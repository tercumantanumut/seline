import { consumeStream, streamText, stepCountIs, type ModelMessage, type Tool, type UserModelMessage } from "ai";
import { ensureAntigravityTokenValid, ensureClaudeCodeTokenValid } from "@/lib/ai/providers";
import { registerAllTools } from "@/lib/ai/tool-registry";
import { AI_CONFIG } from "@/lib/ai/config";
import { shouldUseCache } from "@/lib/ai/cache/config";
import { applyCacheToMessages, estimateCacheSavings } from "@/lib/ai/cache/message-cache";
import { ContextWindowManager } from "@/lib/context-window";
import { getSessionModelId, getSessionProvider, resolveSessionLanguageModel, getSessionDisplayName, getSessionProviderTemperature } from "@/lib/ai/session-model-resolver";
import { generateSessionTitle } from "@/lib/ai/title-generator";
import { createSession, createMessage, updateMessage, getSession, getOrCreateLocalUser, updateSession, deleteMessagesNotIn, getInjectedMessageIds } from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { sessionHasTruncatedContent } from "@/lib/ai/truncated-content-store";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { registerChatAbortController, removeChatAbortController } from "@/lib/background-tasks/chat-abort-registry";
import {
  createLivePromptQueue,
  drainLivePromptQueue,
  removeLivePromptQueue,
} from "@/lib/background-tasks/live-prompt-queue-registry";
import { signalUndrainedMessages } from "@/lib/background-tasks/undrained-signal";
import {
  buildUserInjectionContent,
  buildStopSystemMessage,
} from "@/lib/background-tasks/live-prompt-helpers";
import { combineAbortSignals } from "@/lib/utils/abort";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";
import type { ChatTask } from "@/lib/background-tasks/types";
import { nowISO } from "@/lib/utils/timestamp";
import type { DBToolCallPart } from "@/lib/messages/converter";
import type { FrontendMessage } from "@/lib/messages/tool-enhancement";
import { MAX_STREAM_TOOL_RESULT_TOKENS } from "@/lib/ai/tool-result-stream-guard";
import {
  withRunContext,
  createAgentRun,
  completeAgentRun,
  appendRunEvent,
  initializeToolEventHandler,
} from "@/lib/observability";
import { nextOrderingIndex } from "@/lib/session/message-ordering";
import { getEnabledPluginsForAgent, getInstalledPlugins, loadPluginHooks } from "@/lib/plugins/registry";
import { getWorkflowByAgentId, getWorkflowResources } from "@/lib/agents/workflows";
import { INTERNAL_API_SECRET } from "@/lib/config/internal-api-secret";

// ── Extracted utility modules ─────────────────────────────────────────────────
import {
  shouldInjectContext,
  getContextInjectionTracking,
  getDiscoveredToolsFromMessages,
  getDiscoveredToolsFromMetadata,
  isValidIanaTimezone,
  resolvePluginRootMap,
} from "./context-injection";
import { stripPasteFromMessageForDB } from "./content-sanitizer";
import { extractContent } from "./content-extractor";
import {
  type StreamingMessageState,
  appendTextPartToState,
  recordToolInputStart,
  recordToolInputDelta,
  recordStructuredToolCall,
  recordToolResultChunk,
  finalizeStreamingToolCalls,
} from "./streaming-state";
import {
  shouldTreatStreamErrorAsCancellation,
} from "./canonical-content";
import { buildToolsForRequest } from "./tools-builder";
import { prepareMessagesForRequest } from "./message-prep";
import { createOnFinishCallback, createOnAbortCallback } from "./stream-callbacks";
import { createSyncStreamingMessage } from "./streaming-progress";
import { buildSystemPromptForRequest } from "./system-prompt-builder";
import { mcpContextStore, type SelineMcpContext } from "@/lib/ai/providers/mcp-context-store";

// Initialize tool event handler for observability (once per runtime)
initializeToolEventHandler();

// Maximum request duration in seconds
export const maxDuration = 300;

// Ensure settings are loaded (syncs provider selection to process.env)
loadSettings();

// Initialize tool registry once per runtime
registerAllTools();

// Check if Styly AI API is configured (for tool discovery instructions)
const hasStylyApiKey = () => !!process.env.STYLY_AI_API_KEY;

/**
 * Drain any messages that were queued for live-prompt injection but never
 * processed by prepareStep. Rather than persisting them as dangling DB
 * messages, we set a per-session signal so the frontend can convert the
 * injected-live chips to "fallback" and replay them as a new run.
 */
function handleUndrainedQueueMessages(runId: string, sessionId: string): void {
  const undrained = drainLivePromptQueue(runId);
  if (undrained.length > 0) {
    signalUndrainedMessages(sessionId);
  }
}

// Feature-flagged safety projection for task progress SSE payloads.
const ENABLE_PROGRESS_CONTENT_LIMITER = process.env.ENABLE_PROGRESS_CONTENT_LIMITER === "true";


export async function POST(req: Request) {
  let agentRun: { id: string } | null = null;
  let chatTaskRegistered = false;
  let configuredProvider: string | undefined;
  let activeSessionId: string | undefined;
  try {
    const isScheduledRun = req.headers.get("X-Scheduled-Run") === "true";
    const isInternalAuth = req.headers.get("X-Internal-Auth") === INTERNAL_API_SECRET;
    let userId: string;

    const scheduledRunId = isScheduledRun ? req.headers.get("X-Scheduled-Run-Id") : null;
    const scheduledTaskId = isScheduledRun ? req.headers.get("X-Scheduled-Task-Id") : null;
    const scheduledTaskName = isScheduledRun ? req.headers.get("X-Scheduled-Task-Name") : null;

    if (isInternalAuth) {
      const headerSessionId = req.headers.get("X-Session-Id");
      if (headerSessionId) {
        const session = await getSession(headerSessionId);
        if (session?.userId) {
          userId = session.userId;
          console.log(`[CHAT API] Internal auth bypass for user ${userId}`);
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid session for scheduled task" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: "Session ID required for scheduled task" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      userId = await requireAuth(req);
    }

    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const selectedProvider = (settings.llmProvider || process.env.LLM_PROVIDER || "").toLowerCase();

    if (!isInternalAuth) {
      if (selectedProvider === "antigravity") {
        const tokenValid = await ensureAntigravityTokenValid();
        if (!tokenValid) {
          return new Response(
            JSON.stringify({ error: "Antigravity authentication expired. Please re-authenticate in Settings." }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      if (selectedProvider === "claudecode") {
        const tokenValid = await ensureClaudeCodeTokenValid();
        if (!tokenValid) {
          return new Response(
            JSON.stringify({ error: "Claude Code authentication expired. Please re-authenticate in Settings." }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const body = await req.json();
    const { messages, sessionId: bodySessionId } = body as {
      messages: Array<{
        id?: string;
        role: string;
        content?: string | unknown;
        parts?: Array<{ type: string; text?: string; image?: string; url?: string }>;
        experimental_attachments?: Array<{ name?: string; contentType?: string; url?: string }>;
      }>;
      sessionId?: string;
    };

    const headerSessionId = req.headers.get("X-Session-Id");
    const providedSessionId = headerSessionId || bodySessionId;

    const characterId = req.headers.get("X-Character-Id");
    const userTimezoneHeader = req.headers.get("X-User-Timezone")?.trim() || null;
    const taskSource = req.headers.get("X-Task-Source")?.toLowerCase();
    const isChannelSource = taskSource === "channel";

    console.log(`[CHAT API] Session ID: header=${headerSessionId}, body=${bodySessionId}, using=${providedSessionId}, characterId=${characterId}, source=${taskSource || "chat"}`);

    const lastMsg = messages[messages.length - 1];
    console.log(`[CHAT API] Last message: role=${lastMsg?.role}, hasParts=${!!lastMsg?.parts}, partsCount=${lastMsg?.parts?.length}, hasAttachments=${!!(lastMsg as any)?.experimental_attachments}`);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    sessionId = providedSessionId ?? "";
    let isNewSession = false;
    let sessionMetadata: Record<string, unknown> = {};

    if (!sessionId) {
      const session = await createSession({
        title: "New Design Session",
        userId: dbUser.id,
        metadata: isValidIanaTimezone(userTimezoneHeader)
          ? { userTimezone: userTimezoneHeader }
          : {},
      });
      sessionId = session.id;
      isNewSession = true;
      sessionMetadata = (session.metadata as Record<string, unknown>) || {};
    } else {
      activeSessionId = sessionId;
    const session = await getSession(sessionId);
      if (!session) {
        const newSession = await createSession({
          id: sessionId,
          title: "New Design Session",
          userId: dbUser.id,
          metadata: isValidIanaTimezone(userTimezoneHeader)
            ? { userTimezone: userTimezoneHeader }
            : {},
        });
        sessionId = newSession.id;
        isNewSession = true;
        sessionMetadata = (newSession.metadata as Record<string, unknown>) || {};
      } else if (session.userId !== dbUser.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      } else {
        sessionMetadata = (session.metadata as Record<string, unknown>) || {};
      }
    }

    // Keep session timezone fresh so tools in this same request can rely on it.
    if (isValidIanaTimezone(userTimezoneHeader) && sessionMetadata.userTimezone !== userTimezoneHeader) {
      sessionMetadata = { ...sessionMetadata, userTimezone: userTimezoneHeader };
      await updateSession(sessionId, { metadata: sessionMetadata });
    }

    const appSettings = loadSettings();
    const toolLoadingMode = appSettings.toolLoadingMode ?? "deferred";
    const eventCharacterId = characterId || ((sessionMetadata?.characterId as string | undefined) ?? "");
    const shouldEmitProgress = Boolean(sessionId);
    const streamingState: StreamingMessageState | null = shouldEmitProgress
      ? {
        parts: [],
        toolCallParts: new Map<string, DBToolCallPart>(),
        loggedIncompleteToolCalls: new Set<string>(),
        messageId: undefined,
        lastBroadcastAt: 0,
        lastBroadcastSignature: "",
      }
      : null;

    const syncStreamingMessage = shouldEmitProgress && streamingState
      ? createSyncStreamingMessage({
          sessionId,
          userId: dbUser.id,
          eventCharacterId,
          scheduledRunId,
          scheduledTaskId,
          scheduledTaskName,
          getAgentRunId: () => agentRun?.id,
          streamingState,
        })
      : undefined;

    const contextTracking = getContextInjectionTracking(sessionMetadata);
    const injectContext = shouldInjectContext(contextTracking, isNewSession, toolLoadingMode);
    console.log(`[CHAT API] Context injection: isNew=${isNewSession}, tracking=${JSON.stringify(contextTracking)}, inject=${injectContext}`);

    // ── Context window pre-flight check ───────────────────────────────────────
    const currentModelId = getSessionModelId(sessionMetadata);
    const currentProvider = getSessionProvider(sessionMetadata);
    const contextCheck = await ContextWindowManager.preFlightCheck(
      sessionId,
      currentModelId,
      5000, // Conservative system prompt estimate
      currentProvider
    );

    if (!contextCheck.canProceed) {
      console.error(`[CHAT API] Context window check failed: ${contextCheck.error}`, contextCheck.status);
      return new Response(
        JSON.stringify({
          error: "Context window limit exceeded",
          details: ContextWindowManager.getStatusMessage(contextCheck.status),
          status: contextCheck.status.status,
          recovery: contextCheck.recovery,
          compactionResult: contextCheck.compactionResult
            ? { success: contextCheck.compactionResult.success, tokensFreed: contextCheck.compactionResult.tokensFreed, messagesCompacted: contextCheck.compactionResult.messagesCompacted }
            : undefined,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    const streamToolResultBudgetTokens = MAX_STREAM_TOOL_RESULT_TOKENS;
    console.log(`[CHAT API] Context window: ${contextCheck.status.status} (${contextCheck.status.formatted.current}/${contextCheck.status.formatted.max}), tool budget: ${streamToolResultBudgetTokens.toLocaleString()} tokens`);
    if (contextCheck.compactionResult?.success) {
      console.log(`[CHAT API] Compaction completed: ${contextCheck.compactionResult.messagesCompacted} msgs, ${contextCheck.compactionResult.tokensFreed} tokens freed`);
    }

    // ── Create agent run ───────────────────────────────────────────────────────
    agentRun = await createAgentRun({
      sessionId,
      userId: dbUser.id,
      pipelineName: "chat",
      triggerType: isScheduledRun ? "cron" : isChannelSource ? "webhook" : "chat",
      metadata: { characterId: characterId || null, messageCount: messages.length, taskSource: taskSource || "chat" },
    });
    const chatAbortController = new AbortController();
    registerChatAbortController(agentRun.id, chatAbortController);
    createLivePromptQueue(agentRun.id, sessionId);

    const isDelegation = sessionMetadata?.isDelegation === true;
    const chatTask: ChatTask = {
      type: "chat",
      runId: agentRun.id,
      userId: dbUser.id,
      characterId: characterId ?? undefined,
      sessionId,
      status: "running",
      startedAt: nowISO(),
      pipelineName: "chat",
      triggerType: isScheduledRun ? "cron" : isChannelSource ? "webhook" : isDelegation ? "delegation" : "chat",
      messageCount: messages.length,
      metadata: isScheduledRun || isChannelSource || isDelegation
        ? {
            ...(isScheduledRun ? { scheduledRunId: scheduledRunId ?? undefined, scheduledTaskId: scheduledTaskId ?? undefined } : {}),
            ...(isChannelSource ? { suppressFromUI: true, taskSource: "channel" } : {}),
            ...(isDelegation ? { isDelegation: true, parentAgentId: sessionMetadata.parentAgentId, workflowId: sessionMetadata.workflowId } : {}),
          }
        : undefined,
    };
    const existingTask = taskRegistry.get(agentRun.id);
    if (existingTask) {
      taskRegistry.updateStatus(agentRun.id, "running", chatTask);
    } else {
      taskRegistry.register(chatTask);
    }
    chatTaskRegistered = true;

    // ── Save new user message ──────────────────────────────────────────────────
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const lastMessage = messages[messages.length - 1];
    let persistedUserMessageId: string | undefined;
    const userMessageCount = messages.filter((msg) => msg.role === "user").length;

    if (!isScheduledRun && lastMessage && lastMessage.role === 'user') {
      const messageForDB = stripPasteFromMessageForDB(lastMessage);
      const extractedContent = await extractContent(messageForDB);
      const normalizedContent: unknown[] = Array.isArray(extractedContent)
        ? extractedContent
        : [{ type: "text", text: typeof extractedContent === "string" ? extractedContent : "" }];

      const isValidUUID = lastMessage.id && uuidRegex.test(lastMessage.id);
      const userMessageIndex = await nextOrderingIndex(sessionId);
      const result = await createMessage({
        ...(isValidUUID && { id: lastMessage.id }),
        sessionId,
        role: 'user',
        content: normalizedContent,
        orderingIndex: userMessageIndex,
        metadata: {},
      });
      const savedUserMessageId = result?.id;
      persistedUserMessageId = savedUserMessageId;
      console.log(`[CHAT API] Saved new user message: ${lastMessage.id} -> ${savedUserMessageId || 'SKIPPED (conflict)'}`);

      const plainTextContent = getPlainTextFromContent(extractedContent);
      if ((isNewSession || userMessageCount === 1) && plainTextContent.length > 0) {
        void generateSessionTitle(sessionId, plainTextContent);
      }
    }

    // ── Edit/Reload truncation cleanup ──────────────────────────────────────
    // When the user edits a message or clicks reload, assistant-ui sends a
    // truncated message list (everything up to the edited message + the new
    // version). DB messages beyond that list are stale and must be removed,
    // otherwise they reappear when the session is reloaded from DB.
    if (!isNewSession && !isScheduledRun) {
      const frontendIds = new Set(
        messages
          .filter(m => m.id && uuidRegex.test(m.id))
          .map(m => m.id!)
      );
      if (persistedUserMessageId) {
        // If the client sent a non-UUID message id, keep the DB-generated id too.
        // Without this, normal sends can be mistaken for edit/reload truncation.
        frontendIds.add(persistedUserMessageId);
      }
      if (frontendIds.size > 0) {
        // Protect all messages created server-side during live-prompt injection.
        // Both the injected user messages and the pre-injection split assistant
        // message are tagged with livePromptInjected:true in the DB so they
        // survive across run boundaries (a registry would be cleared before the
        // next request).
        const injectedIds = await getInjectedMessageIds(sessionId);
        for (const id of injectedIds) {
          frontendIds.add(id);
        }
        const deleted = await deleteMessagesNotIn(sessionId, frontendIds);
        if (deleted > 0) {
          console.log(`[CHAT API] Edit/reload truncation: removed ${deleted} stale message(s)`);
        }
      }
    }

    // ── Prepare messages (HYBRID approach) ────────────────────────────────────
    console.log(`[CHAT API] Using HYBRID approach: ${messages.length} frontend messages`);
    const { coreMessages, enhancedMessages } = await prepareMessagesForRequest({
      messages: messages as FrontendMessage[],
      sessionId,
      userId: dbUser.id,
      characterId,
      sessionMetadata,
      currentModelId,
      currentProvider,
    });

    // ── Plugin / workflow scope ────────────────────────────────────────────────
    const useCaching = shouldUseCache(currentProvider);

    let scopedPlugins = await getInstalledPlugins(dbUser.id, { status: "active" });
    if (characterId) {
      scopedPlugins = await getEnabledPluginsForAgent(dbUser.id, characterId, characterId);
    }

    let workflowPromptContext: string | null = null;
    let workflowPromptContextInput: import("@/lib/agents/workflows").WorkflowPromptContextInput | null = null;
    if (characterId) {
      try {
        const workflowCtx = await getWorkflowByAgentId(characterId);
        if (workflowCtx) {
          const resources = await getWorkflowResources(workflowCtx.workflow.id, characterId);
          if (resources) {
            if (resources.sharedResources.pluginIds.length > 0) {
              const existingIds = new Set(scopedPlugins.map((p) => p.id));
              const allPlugins = await getInstalledPlugins(dbUser.id, { status: "active" });
              for (const plugin of allPlugins) {
                if (resources.sharedResources.pluginIds.includes(plugin.id) && !existingIds.has(plugin.id)) {
                  scopedPlugins.push(plugin);
                  existingIds.add(plugin.id);
                }
              }
            }
            workflowPromptContext = resources.promptContext;
            workflowPromptContextInput = resources.promptContextInput;
            console.log(`[CHAT API] Resolved workflow ${workflowCtx.workflow.id} (role: ${resources.role}, shared plugins: ${resources.sharedResources.pluginIds.length}, shared folders: ${resources.sharedResources.syncFolderIds.length})`);
          }
        }
      } catch (workflowError) {
        console.warn("[CHAT API] Failed to resolve workflow context (non-fatal):", workflowError);
      }
    }

    try {
      const hookCount = loadPluginHooks(scopedPlugins);
      if (hookCount > 0) console.log(`[CHAT API] Loaded hooks from ${hookCount} scoped plugin(s)`);
    } catch (pluginHookError) {
      console.warn("[CHAT API] Failed to load scoped plugin hooks (non-fatal):", pluginHookError);
    }

    const pluginRoots = await resolvePluginRootMap(scopedPlugins);

    // ── Build system prompt ────────────────────────────────────────────────────
    const {
      systemPromptValue,
      characterAvatarUrl,
      characterAppearanceDescription,
      enabledTools,
    } = await buildSystemPromptForRequest({
      characterId,
      userId: dbUser.id,
      toolLoadingMode,
      useCaching,
      sessionMetadata,
      contextWindowStatus: contextCheck.status,
      workflowPromptContext,
      devWorkspaceEnabled: appSettings.devWorkspaceEnabled ?? false,
    });

    // ── Build tools ────────────────────────────────────────────────────────────
    const historicallyDiscoveredTools = getDiscoveredToolsFromMessages(enhancedMessages);
    const metadataDiscoveredTools = getDiscoveredToolsFromMetadata(sessionMetadata);
    const previouslyDiscoveredTools = new Set([...historicallyDiscoveredTools, ...metadataDiscoveredTools]);
    const allowedPluginNames = new Set(scopedPlugins.map((plugin) => plugin.name));

    const toolsResult = await buildToolsForRequest({
      sessionId,
      userId: dbUser.id,
      characterId,
      characterAvatarUrl,
      characterAppearanceDescription,
      sessionMetadata,
      enabledTools,
      previouslyDiscoveredTools,
      toolLoadingMode,
      devWorkspaceEnabled: appSettings.devWorkspaceEnabled ?? false,
      streamToolResultBudgetTokens,
      pluginRoots,
      allowedPluginNames,
      workflowPromptContextInput,
    });

    const {
      allToolsWithMCP,
      initialActiveToolNames,
      hasStopHooks,
      discoveredTools,
      initialActiveTools,
    } = toolsResult;

    const useDeferredLoading = toolLoadingMode !== "always";

    // ── Seline MCP context for SDK agent tool exposure ─────────────────────────
    // Stored in AsyncLocalStorage so the Claude Agent SDK fetch interceptor can
    // read it without needing changes to every function signature in between.
    // Must be set AFTER buildToolsForRequest() so MCP servers are already
    // connected and their tools are registered in ToolRegistry.
    const mcpCtx: SelineMcpContext = {
      userId: dbUser.id,
      sessionId,
      characterId: characterId ?? null,
      enabledTools: enabledTools ?? undefined,
    };

    // ── Apply caching to messages ──────────────────────────────────────────────
    const cachedMessages = useCaching ? applyCacheToMessages(coreMessages) : coreMessages;

    if (useCaching && injectContext) {
      const estimatedSavings = estimateCacheSavings(
        Array.isArray(systemPromptValue) ? systemPromptValue : [],
        cachedMessages
      );
      console.log(`[CACHE] Estimated savings: ${estimatedSavings.totalCacheableTokens} tokens cacheable, ~$${estimatedSavings.estimatedSavings.toFixed(4)} saved per hit`);
    }

    // ── Stream setup ───────────────────────────────────────────────────────────
    const provider = getSessionProvider(sessionMetadata);
    configuredProvider = provider;
    console.log(`[CHAT API] Using LLM: ${getSessionDisplayName(sessionMetadata)}, inject=${injectContext}, caching=${useCaching ? "on" : "off"}`);

    const runFinalized = { value: false };

    const finalizeFailedRun = async (
      errorMessage: string,
      isCreditError: boolean,
      options?: { sourceError?: unknown; streamAborted?: boolean }
    ) => {
      if (runFinalized.value) return;
      runFinalized.value = true;
      if (chatTaskRegistered && agentRun?.id) {
        try {
          const classification = classifyRecoverability({ provider, error: options?.sourceError, message: errorMessage });
          const shouldCancel = shouldTreatStreamErrorAsCancellation({
            errorMessage,
            isCreditError,
            streamAborted: options?.streamAborted ?? streamAbortSignal.aborted,
            classificationRecoverable: classification.recoverable,
            classificationReason: classification.reason,
          });
          const runStatus = shouldCancel ? "cancelled" : "failed";
          removeChatAbortController(agentRun.id);
          if (activeSessionId) {
            handleUndrainedQueueMessages(agentRun.id, activeSessionId);
            removeLivePromptQueue(agentRun.id, activeSessionId);
          }
          await completeAgentRun(agentRun.id, runStatus, shouldCancel
            ? { reason: "stream_interrupted" }
            : { error: isCreditError ? "Insufficient credits" : errorMessage });
          const registryTask = taskRegistry.get(agentRun.id);
          const registryDurationMs = registryTask ? Date.now() - new Date(registryTask.startedAt).getTime() : undefined;
          taskRegistry.updateStatus(agentRun.id, runStatus, shouldCancel
            ? { durationMs: registryDurationMs }
            : { durationMs: registryDurationMs, error: isCreditError ? "Task interrupted - insufficient credits" : errorMessage });
        } catch (failureError) {
          console.error("[CHAT API] Failed to finalize agent run after stream error:", failureError);
        }
      }
      if (hasStopHooks) {
        try {
          const { runStopHooks } = await import("@/lib/plugins/hook-integration");
          runStopHooks(sessionId, options?.streamAborted ? "aborted" : "error", allowedPluginNames, pluginRoots);
        } catch (hookError) {
          console.error("[Hooks] Stop hook dispatch failed:", hookError);
        }
      }
    };

    const runId = agentRun?.id;
    if (!runId) throw new Error("Agent run unavailable for chat stream");

    const streamAbortSignal = combineAbortSignals([req.signal, chatAbortController.signal]);

    // Build shared callback context
    const callbackCtx = {
      sessionId,
      characterId,
      sessionMetadata,
      agentRun,
      streamingState,
      syncStreamingMessage,
      shouldEmitProgress,
      useCaching,
      systemPromptValue,
      cachedMessages,
      discoveredTools,
      previouslyDiscoveredTools,
      initialActiveToolNames,
      contextTracking,
      injectContext,
      toolLoadingMode,
      allowedPluginNames,
      pluginRoots,
      hasStopHooks,
      chatTaskRegistered,
      runFinalized,
      provider,
      streamAbortSignal,
    };

    const createStreamResult = () =>
      mcpContextStore.run(
        mcpCtx,
        () => withRunContext(
        { runId, sessionId, pipelineName: "chat", characterId: characterId || undefined },
        async () => streamText({
          model: resolveSessionLanguageModel(sessionMetadata),
          ...(injectContext && { system: systemPromptValue }),
          messages: cachedMessages,
          tools: allToolsWithMCP,
          activeTools: initialActiveToolNames as (keyof typeof allToolsWithMCP)[],
          abortSignal: streamAbortSignal,
          stopWhen: stepCountIs(AI_CONFIG.maxSteps),
          temperature: getSessionProviderTemperature(sessionMetadata, initialActiveToolNames.length > 0 ? AI_CONFIG.toolTemperature : AI_CONFIG.temperature),
          toolChoice: AI_CONFIG.toolChoice,
          prepareStep: async ({ stepNumber, messages: stepMessages }) => {
            let activeToolSet: Set<string>;
            if (useDeferredLoading) {
              activeToolSet = new Set<string>([
                ...initialActiveTools,
                ...previouslyDiscoveredTools,
                ...discoveredTools,
              ]);
            } else {
              activeToolSet = new Set<string>(Object.keys(allToolsWithMCP));
            }

            if (sessionHasTruncatedContent(sessionId) && !activeToolSet.has("retrieveFullContent")) {
              activeToolSet.add("retrieveFullContent");
            }

            const currentActiveTools = [...activeToolSet];
            if (stepNumber === 0) {
              console.log(`[CHAT API] Step 0: Starting with ${currentActiveTools.length} active tools (mode: ${useDeferredLoading ? "deferred" : "always-include"})`);
            } else if (useDeferredLoading && discoveredTools.size > previouslyDiscoveredTools.size) {
              const newlyDiscovered = [...discoveredTools].filter(t => !previouslyDiscoveredTools.has(t));
              if (newlyDiscovered.length > 0) {
                console.log(`[CHAT API] Step ${stepNumber}: Active tools now include newly discovered: ${newlyDiscovered.join(", ")}`);
              }
            }

            // Drain any mid-run user messages from the in-memory queue.
            // drainLivePromptQueue is atomic (splice-based) — no seenIds tracking needed.
            const pendingPrompts = drainLivePromptQueue(runId);
            if (pendingPrompts.length > 0) {
              const stopRequested = pendingPrompts.some(e => e.stopIntent);
              console.log(
                `[CHAT API] Step ${stepNumber}: Injecting ${pendingPrompts.length} live prompt(s) (stopIntent=${stopRequested})`
              );

              if (stopRequested) {
                // Graceful stop: disable tools + inject system-level stop instruction.
                // We don't hard-abort here — this lets the model acknowledge the stop request
                // before the run ends naturally at the next step boundary.
                return {
                  activeTools: [] as string[],
                  system: buildStopSystemMessage(pendingPrompts),
                };
              }

              // Split the streaming assistant message at the injection boundary so the
              // user's message is stored between the pre-injection and post-injection
              // assistant content rather than after the entire run.
              if (syncStreamingMessage && streamingState) {
                // Flush current assistant content to DB before splitting.
                await syncStreamingMessage(true);
                // Tag the pre-injection assistant message so deleteMessagesNotIn
                // protects it on the next request (it was created server-side and
                // is unknown to the frontend).
                if (streamingState.messageId) {
                  const preId = streamingState.messageId;
                  void updateMessage(preId, { metadata: { livePromptInjected: true } }).catch(() => {});
                }
                // Reset streaming state so post-injection content starts a new DB record.
                streamingState.messageId = undefined;
                streamingState.parts = [];
                streamingState.toolCallParts = new Map();
                streamingState.loggedIncompleteToolCalls = new Set();
                streamingState.lastBroadcastAt = 0;
                streamingState.lastBroadcastSignature = "";
                streamingState.pendingBroadcast = false;
                streamingState.isCreating = false;
                streamingState.stepOffset = stepNumber;
              }

              // Persist each injected user message with the correct ordering index
              // (allocated after the now-sealed pre-injection assistant message).
              for (const prompt of pendingPrompts) {
                try {
                  const orderingIndex = await nextOrderingIndex(sessionId);
                  const injected = await createMessage({
                    sessionId,
                    role: "user",
                    content: [{ type: "text", text: prompt.content }],
                    orderingIndex,
                    metadata: { livePromptInjected: true },
                  });
                } catch (dbError) {
                  console.warn("[CHAT API] Failed to persist injected user message:", dbError);
                }
              }

              // Inject as real user messages — correct conversation semantics vs system hacks.
              // The SDK's prepareStep `messages` return overrides the full message list for this step.
              const injectedUserMessage: UserModelMessage = {
                role: "user",
                content: buildUserInjectionContent(pendingPrompts),
              };
              return {
                activeTools: currentActiveTools as string[],
                messages: [...stepMessages, injectedUserMessage],
              };
            }

            return { activeTools: currentActiveTools as (keyof typeof allToolsWithMCP)[] };
          },
          experimental_repairToolCall: async ({ error, toolCall }) => {
            // Return null to let the SDK inject the error as a tool result so the model can recover.
            // Previously this was automatic in older AI SDK versions; v6 requires it explicitly.
            console.warn(`[CHAT API] Tool call repair triggered for "${toolCall.toolName}": ${error.message}`);
            return null;
          },
          onError: async ({ error }) => {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            await finalizeFailedRun(errorMessage, detectCreditError(errorMessage), { sourceError: error, streamAborted: streamAbortSignal.aborted });
          },
          onChunk: shouldEmitProgress
            ? async ({ chunk }) => {
              if (!streamingState || !syncStreamingMessage) return;
              let changed = false;
              if (chunk.type === "text-delta") {
                changed = appendTextPartToState(streamingState, chunk.text ?? "") || changed;
              } else if (chunk.type === "tool-input-start") {
                changed = recordToolInputStart(streamingState, chunk.id, chunk.toolName) || changed;
              } else if (chunk.type === "tool-input-delta") {
                changed = recordToolInputDelta(streamingState, chunk.id, chunk.delta) || changed;
              } else if (chunk.type === "tool-call") {
                changed = recordStructuredToolCall(streamingState, chunk.toolCallId, chunk.toolName, chunk.input) || changed;
              } else if (chunk.type === "tool-result") {
                changed = recordToolResultChunk(streamingState, chunk.toolCallId, chunk.toolName, chunk.output, chunk.preliminary) || changed;
              }
              if (changed) await syncStreamingMessage();
            }
            : undefined,
          onFinish: createOnFinishCallback(callbackCtx),
          onAbort: createOnAbortCallback(callbackCtx) as any,
        })
      )
    );

    const STREAM_RECOVERY_MAX_ATTEMPTS = 3;
    let result: Awaited<ReturnType<typeof createStreamResult>>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await createStreamResult();
        if (attempt > 0) {
          await appendRunEvent({ runId, eventType: "llm_request_completed", level: "info", pipelineName: "chat", data: { attempt, reason: "stream_recovered", outcome: "recovered" } });
        }
        break;
      } catch (error) {
        const classification = classifyRecoverability({ provider, error, message: error instanceof Error ? error.message : String(error) });
        const retry = shouldRetry({ classification, attempt, maxAttempts: STREAM_RECOVERY_MAX_ATTEMPTS, aborted: streamAbortSignal.aborted });

        if (runId) {
          const delay = retry ? getBackoffDelayMs(attempt) : 0;
          await appendRunEvent({ runId, eventType: "llm_request_failed", level: retry ? "info" : "warn", pipelineName: "chat", data: { attempt: attempt + 1, reason: classification.reason, recoverable: classification.recoverable, delayMs: delay, outcome: retry ? "retrying" : "exhausted" } });
        }

        if (!retry) throw error;

        const delay = getBackoffDelayMs(attempt);
        console.log("[CHAT API] Retrying stream creation", { attempt: attempt + 1, reason: classification.reason, delayMs: delay, provider });
        await sleepWithAbort(delay, streamAbortSignal);
      }
    }

    const response = result!.toUIMessageStreamResponse({
      consumeSseStream: ({ stream }) =>
        consumeStream({
          stream,
          onError: (error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            void finalizeFailedRun(errorMessage, detectCreditError(errorMessage), { sourceError: error, streamAborted: streamAbortSignal.aborted });
          },
        }),
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        void finalizeFailedRun(errorMessage, detectCreditError(errorMessage), { sourceError: error, streamAborted: streamAbortSignal.aborted });
        return "Streaming interrupted. The run was marked accordingly.";
      },
      messageMetadata: ({ part }) => {
        if (part.type === 'finish-step' && part.usage) {
          const anthropicMeta = (part as any).providerMetadata?.anthropic || {};
          const cacheRead = anthropicMeta.cacheReadInputTokens || (part.usage as any).cache_read_input_tokens || 0;
          const cacheWrite = anthropicMeta.cacheCreationInputTokens || (part.usage as any).cache_creation_input_tokens || 0;
          const basePricePerToken = 3 / 1_000_000;
          const estimatedSavingsUsd = cacheRead > 0 ? 0.9 * basePricePerToken * cacheRead : 0;
          return {
            custom: {
              usage: { inputTokens: part.usage.inputTokens, outputTokens: part.usage.outputTokens, totalTokens: part.usage.totalTokens },
              ...(cacheRead > 0 || cacheWrite > 0 ? { cache: { cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, estimatedSavingsUsd } } : {}),
            },
          };
        }
        return undefined;
      },
    });
    response.headers.set("X-Session-Id", sessionId);
    return response;
  } catch (error) {
    console.error("Chat API error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isCreditError = detectCreditError(errorMessage);

    if (chatTaskRegistered && agentRun?.id) {
      try {
        const classification = classifyRecoverability({ provider: configuredProvider, error, message: errorMessage });
        const shouldCancel = shouldTreatStreamErrorAsCancellation({
          errorMessage,
          isCreditError,
          streamAborted: req.signal.aborted,
          classificationRecoverable: classification.recoverable,
          classificationReason: classification.reason,
        });
        const runStatus = shouldCancel ? "cancelled" : "failed";
        removeChatAbortController(agentRun.id);
        if (activeSessionId) {
          removeLivePromptQueue(agentRun.id, activeSessionId);
        }
        await completeAgentRun(agentRun.id, runStatus, shouldCancel
          ? { reason: "stream_interrupted" }
          : { error: isCreditError ? "Insufficient credits" : errorMessage });
        const registryTask = taskRegistry.get(agentRun.id);
        const registryDurationMs = registryTask ? Date.now() - new Date(registryTask.startedAt).getTime() : undefined;
        taskRegistry.updateStatus(agentRun.id, runStatus, shouldCancel
          ? { durationMs: registryDurationMs }
          : { durationMs: registryDurationMs, error: isCreditError ? "Task interrupted - insufficient credits" : errorMessage });
      } catch (e) {
        console.error("[CHAT API] Failed to finalize run status in chat error handler:", e);
      }
    }

    return new Response(
      JSON.stringify({
        error: isCreditError
          ? "Insufficient credits. Please add credits to continue."
          : errorMessage,
      }),
      {
        status: isCreditError ? 402 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function detectCreditError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return lower.includes("insufficient") || lower.includes("quota") || lower.includes("credit") || lower.includes("429");
}

function getPlainTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}
