import { createAnthropic } from "@ai-sdk/anthropic";
import { query as claudeAgentQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentDefinition,
  HookEvent,
  HookCallbackMatcher,
  SdkPluginConfig,
  OutputFormat,
  ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { LanguageModel } from "ai";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";
import { readClaudeAgentSdkAuthStatus } from "@/lib/auth/claude-agent-sdk-auth";
import { isElectronProduction } from "@/lib/utils/environment";
import { mcpContextStore, type SelineMcpContext } from "./mcp-context-store";
import { createSelineSdkMcpServer } from "./seline-sdk-mcp-server";
import { buildSdkHooksFromSeline, mergeHooks } from "@/lib/plugins/sdk-hook-adapter";

const CLAUDECODE_MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

/**
 * SDK-native options that extend a basic Claude Agent SDK query.
 * These are forwarded directly to the SDK's query() call, enabling full
 * SDK capabilities: multi-agent delegation, lifecycle hooks, plugin loading,
 * session continuation, structured output, and thinking controls.
 *
 * Use these when you need capabilities beyond the basic prompt→text path
 * provided by the fetch interceptor (e.g. background tasks, direct SDK calls).
 */
export type ClaudeAgentSdkQueryOptions = {
  /**
   * Custom subagent definitions for SDK-native Task tool delegation.
   * Keys are agent names; values define the subagent's prompt, tools, and model.
   */
  agents?: Record<string, AgentDefinition>;
  /**
   * Tool names auto-allowed without permission prompts.
   * Does not restrict; use `disallowedTools` to remove tools entirely.
   */
  allowedTools?: string[];
  /**
   * Tool names to explicitly disallow. These are removed from the model's
   * context and cannot be used even if otherwise allowed.
   */
  disallowedTools?: string[];
  /**
   * Lifecycle hook callbacks (PreToolUse, PostToolUse, Notification, etc.).
   * Enables programmatic observability and control over tool execution.
   */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  /**
   * Local plugins to load for this session.
   * Plugins provide custom commands, agents, skills, and hooks.
   * Currently only `{ type: 'local', path: string }` is supported.
   */
  plugins?: SdkPluginConfig[];
  /**
   * Resume a prior session by its session ID.
   * Loads conversation history so the agent can continue where it left off.
   */
  resume?: string;
  /**
   * Pin a specific session ID for this query (must be a valid UUID).
   * Mutually exclusive with `resume` unless `forkSession` is used.
   */
  sessionId?: string;
  /**
   * Structured output format.
   * When set, the agent returns data matching the provided JSON schema.
   */
  outputFormat?: OutputFormat;
  /**
   * Extended thinking / reasoning configuration.
   * - `{ type: 'adaptive' }` — Claude decides when and how much to think (Opus 4.6+)
   * - `{ type: 'enabled', budgetTokens: number }` — fixed token budget
   * - `{ type: 'disabled' }` — no extended thinking
   */
  thinking?: ThinkingConfig;
  /**
   * Response effort level (guides thinking depth).
   * - 'low' — fastest, minimal thinking
   * - 'medium' — moderate
   * - 'high' — deep reasoning (default)
   * - 'max' — maximum (Opus 4.6 only)
   */
  effort?: "low" | "medium" | "high" | "max";
  /**
   * Whether to persist the session to ~/.claude/projects/.
   * Set to `false` for ephemeral or automated workflows that don't need history.
   * @default true
   */
  persistSession?: boolean;
  /**
   * Maximum number of conversation turns before stopping.
   * Defaults to 1000 to allow arbitrarily long agentic work.
   * @default 1000
   */
  maxTurns?: number;
  /**
   * Override the permission mode for this specific query.
   * Defaults to "bypassPermissions" (server context has no interactive TTY).
   * Use "acceptEdits" for slightly stricter control (auto-accepts file edits,
   * still gates on arbitrary bash commands).
   */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  /**
   * Working directory for the SDK agent session.
   * Defaults to the agent's primary sync folder (resolved from DB) or `process.cwd()`.
   */
  cwd?: string;
  /**
   * Per-request Seline platform context used to build an in-process MCP server
   * that exposes ToolRegistry tools and per-agent MCP tools to the SDK agent.
   *
   * When provided here (for `queryWithSdkOptions` callers) or propagated via
   * `mcpContextStore` (for the fetch-interceptor / chat-route path), the SDK
   * agent can call vectorSearch, memorize, runSkill, scheduleTask, and any
   * MCP server tools configured for the active agent.
   */
  mcpContext?: SelineMcpContext;
};

function sanitizeLoneSurrogates(input: string): { value: string; changed: boolean } {
  let changed = false;
  let output = "";

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Preserve valid surrogate pairs and replace malformed lone surrogates.
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        output += input[i] + input[i + 1];
        i += 1;
      } else {
        output += "\ufffd";
        changed = true;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\ufffd";
      changed = true;
      continue;
    }

    output += input[i];
  }

  return { value: output, changed };
}

export function sanitizeJsonStringValues(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    return sanitizeLoneSurrogates(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const sanitizedArray = value.map((entry) => {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: sanitizedArray, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      sanitizedObject[key] = result.value;
    }
    return { value: sanitizedObject, changed };
  }

  return { value, changed: false };
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSdkToolResultsFromUserMessage(
  msg: unknown,
): Array<{ toolCallId: string; output: unknown; toolName?: string }> {
  if (!isDictionary(msg) || msg.type !== "user") return [];

  const out: Array<{ toolCallId: string; output: unknown; toolName?: string }> = [];
  const seen = new Set<string>();
  const pushResult = (toolCallId: string, output: unknown, toolName?: string) => {
    if (!toolCallId || seen.has(toolCallId)) return;
    seen.add(toolCallId);
    out.push({ toolCallId, output, ...(toolName ? { toolName } : {}) });
  };

  const parentToolUseId = typeof msg.parent_tool_use_id === "string"
    ? msg.parent_tool_use_id
    : "";
  if ("tool_use_result" in msg && parentToolUseId) {
    pushResult(
      parentToolUseId,
      (msg as { tool_use_result?: unknown }).tool_use_result,
      typeof msg.tool_name === "string" ? msg.tool_name : undefined,
    );
  }

  const innerMessage = isDictionary(msg.message) ? msg.message : null;
  const content = Array.isArray(innerMessage?.content)
    ? innerMessage.content
    : [];

  for (const part of content) {
    if (!isDictionary(part) || part.type !== "tool_result") continue;
    const toolUseId =
      typeof part.tool_use_id === "string"
        ? part.tool_use_id
        : parentToolUseId;
    if (!toolUseId) continue;

    const toolName =
      typeof part.name === "string"
        ? part.name
        : typeof part.tool_name === "string"
          ? part.tool_name
          : undefined;

    if ("tool_use_result" in part) {
      pushResult(toolUseId, (part as { tool_use_result?: unknown }).tool_use_result, toolName);
      continue;
    }
    if ("content" in part) {
      pushResult(toolUseId, (part as { content?: unknown }).content, toolName);
      continue;
    }
    pushResult(toolUseId, part, toolName);
  }

  return out;
}

function normalizeToolUseInput(input: unknown): Record<string, unknown> {
  if (isDictionary(input)) {
    return input;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (isDictionary(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to placeholder object.
    }
  }

  return {
    _recoveredInvalidToolUseInput: true,
    _inputType: input === null ? "null" : Array.isArray(input) ? "array" : typeof input,
  };
}

export function normalizeAnthropicToolUseInputs(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  fixedCount: number;
} {
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return { body, fixedCount: 0 };
  }

  let fixedCount = 0;
  const normalizedMessages = messages.map((message) => {
    if (!isDictionary(message) || !Array.isArray(message.content)) {
      return message;
    }

    const normalizedContent = message.content.map((part) => {
      if (!isDictionary(part) || part.type !== "tool_use") {
        return part;
      }

      const normalizedInput = normalizeToolUseInput(part.input);
      if (normalizedInput !== part.input) {
        fixedCount += 1;
      }

      return {
        ...part,
        input: normalizedInput,
      };
    });

    return { ...message, content: normalizedContent };
  });

  return { body: { ...body, messages: normalizedMessages }, fixedCount };
}

function buildSystemPrompt(system: unknown): string | undefined {
  if (typeof system === "string" && system.trim().length > 0) {
    return system;
  }

  if (Array.isArray(system)) {
    const text = system
      .map((entry) => {
        if (isDictionary(entry) && typeof entry.text === "string") {
          return entry.text;
        }
        return "";
      })
      .filter((line) => line.length > 0)
      .join("\n\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function buildPromptFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return "USER: Continue.";
  }

  const lines: string[] = [];

  for (const message of messages) {
    if (!isDictionary(message)) {
      continue;
    }

    const role = message.role === "assistant" ? "ASSISTANT" : "USER";
    const content = message.content;

    if (typeof content === "string" && content.trim().length > 0) {
      lines.push(`${role}: ${content}`);
      continue;
    }

    if (Array.isArray(content)) {
      const fragments: string[] = [];
      for (const part of content) {
        if (!isDictionary(part) || typeof part.type !== "string") {
          continue;
        }

        if (part.type === "text" && typeof part.text === "string") {
          fragments.push(part.text);
        } else if (part.type === "tool_use") {
          const toolName = typeof part.name === "string" ? part.name : "tool";
          fragments.push(`[tool_use:${toolName}]`);
        } else if (part.type === "tool_result") {
          fragments.push("[tool_result]");
        }
      }

      if (fragments.length > 0) {
        lines.push(`${role}: ${fragments.join("\n")}`);
      }
    }
  }

  if (lines.length === 0) {
    return "USER: Continue.";
  }

  return lines.join("\n\n");
}

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("authentication") ||
    lower.includes("authentication_failed") ||
    lower.includes("auth") ||
    lower.includes("oauth") ||
    lower.includes("login")
  );
}

function createAnthropicMessageResponse(text: string, model: string): Response {
  const outputTokens = Math.max(1, Math.ceil(text.length / 4));

  return new Response(
    JSON.stringify({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: outputTokens,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function createAnthropicStreamResponse(text: string, model: string): Response {
  const messageId = `msg_${crypto.randomUUID()}`;
  const outputTokens = Math.max(1, Math.ceil(text.length / 4));
  const chunks = text.length > 0 ? text.match(/.{1,800}/gs) ?? [text] : [""];

  const events: string[] = [];
  events.push(`event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  })}\n\n`);

  events.push(`event: content_block_start\ndata: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}\n\n`);

  for (const chunk of chunks) {
    events.push(`event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: chunk },
    })}\n\n`);
  }

  events.push("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
  events.push(`event: message_delta\ndata: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: outputTokens },
  })}\n\n`);
  events.push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");

  return new Response(events.join(""), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Create a real-time streaming Response that pipes Claude Agent SDK events
 * as Anthropic-compatible SSE content blocks.
 *
 * Unlike `runClaudeAgentQuery` (which collects text then builds a batch response),
 * this streams tool_use and text blocks to the client as they arrive, enabling the
 * chat UI to show intermediate tool steps in real-time.
 */
function createStreamingClaudeCodeResponse(options: {
  prompt: string;
  model: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  sdkOptions?: ClaudeAgentSdkQueryOptions;
}): Response {
  const messageId = `msg_${crypto.randomUUID()}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const abortController = new AbortController();
      const onAbort = () => abortController.abort();
      if (options.signal) {
        if (options.signal.aborted) {
          abortController.abort();
        } else {
          options.signal.addEventListener("abort", onAbort, { once: true });
        }
      }

      try {
        const sdk = options.sdkOptions;
        const mcpCtx: SelineMcpContext | undefined =
          sdk?.mcpContext ?? mcpContextStore.getStore();
        const sdkToolResultBridge = mcpCtx?.sdkToolResultBridge;

        const selineMcpServers = mcpCtx
          ? { "seline-platform": createSelineSdkMcpServer(mcpCtx) }
          : undefined;

        const resolvedCwd = sdk?.cwd ?? mcpCtx?.cwd ?? process.cwd();

        // Bridge Seline plugin cache paths → SDK plugin configs
        const selinePluginConfigs: SdkPluginConfig[] = (mcpCtx?.pluginPaths ?? [])
          .map((p) => ({ type: "local" as const, path: p }));
        const mergedPlugins = selinePluginConfigs.length > 0 || sdk?.plugins
          ? [...selinePluginConfigs, ...(sdk?.plugins ?? [])]
          : undefined;

        // Bridge Seline hooks → SDK hook callbacks
        const selineHooks = mcpCtx?.hookContext
          ? buildSdkHooksFromSeline(
              mcpCtx.sessionId,
              mcpCtx.hookContext.allowedPluginNames,
              mcpCtx.hookContext.pluginRoots,
            )
          : undefined;
        const mergedHookMap = mergeHooks(selineHooks, sdk?.hooks);

        const query = claudeAgentQuery({
          prompt: options.prompt,
          options: {
            abortController,
            cwd: resolvedCwd,
            ...(resolvedCwd !== process.cwd() ? { additionalDirectories: [resolvedCwd] } : {}),
            executable: "node",
            includePartialMessages: true,
            settingSources: ["project"] as ("user" | "project" | "local")[],
            maxTurns: sdk?.maxTurns ?? 1000,
            model: options.model,
            permissionMode: sdk?.permissionMode ?? "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            env: (() => {
              const e: Record<string, string | undefined> = { ...process.env };
              delete e.ANTHROPIC_API_KEY;
              delete e.CLAUDECODE;
              if (isElectronProduction()) e.ELECTRON_RUN_AS_NODE = "1";
              return e;
            })(),
            ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
            ...(selineMcpServers ? { mcpServers: selineMcpServers } : {}),
            ...(sdk?.agents ? { agents: sdk.agents } : {}),
            ...(sdk?.allowedTools ? { allowedTools: sdk.allowedTools } : {}),
            ...(sdk?.disallowedTools ? { disallowedTools: sdk.disallowedTools } : {}),
            ...(mergedHookMap ? { hooks: mergedHookMap } : {}),
            ...(mergedPlugins ? { plugins: mergedPlugins } : {}),
            ...(sdk?.resume ? { resume: sdk.resume } : {}),
            ...(sdk?.sessionId ? { sessionId: sdk.sessionId } : {}),
            ...(sdk?.outputFormat ? { outputFormat: sdk.outputFormat } : {}),
            ...(sdk?.thinking ? { thinking: sdk.thinking } : {}),
            ...(sdk?.effort ? { effort: sdk.effort } : {}),
            ...(sdk?.persistSession !== undefined ? { persistSession: sdk.persistSession } : {}),
          },
        });

        // Emit message_start
        emit("message_start", {
          type: "message_start",
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            model: options.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        });

        let nextContentIndex = 0;
        let outputTokens = 0;
        let syntheticStreamLocalIndex = -1;
        let sawStreamTextThisTurn = false;
        const streamedToolUseIdsThisTurn = new Set<string>();
        const streamedToolUseNamesThisTurn = new Set<string>();
        const streamLocalToGlobalIndex = new Map<number, number>();
        const openStreamLocalIndices = new Set<number>();

        const allocateContentIndex = () => {
          const idx = nextContentIndex;
          nextContentIndex += 1;
          return idx;
        };

        const emitTextBlock = (text: string, index?: number) => {
          if (!text) return;
          const targetIndex = index ?? allocateContentIndex();
          emit("content_block_start", {
            type: "content_block_start",
            index: targetIndex,
            content_block: { type: "text", text: "" },
          });
          emit("content_block_delta", {
            type: "content_block_delta",
            index: targetIndex,
            delta: { type: "text_delta", text },
          });
          emit("content_block_stop", { type: "content_block_stop", index: targetIndex });
          outputTokens += Math.max(1, Math.ceil(text.length / 4));
        };

        const emitToolUseBlock = (
          id: string,
          name: string,
          inputJson?: string,
          index?: number,
        ) => {
          const targetIndex = index ?? allocateContentIndex();
          emit("content_block_start", {
            type: "content_block_start",
            index: targetIndex,
            content_block: { type: "tool_use", id, name },
          });
          if (inputJson !== undefined) {
            emit("content_block_delta", {
              type: "content_block_delta",
              index: targetIndex,
              delta: { type: "input_json_delta", partial_json: inputJson },
            });
          }
          emit("content_block_stop", { type: "content_block_stop", index: targetIndex });
        };

        const getEventIndex = (event: Record<string, unknown>): number | null => {
          const raw = event.index;
          if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
          return raw;
        };

        const resolveDeltaOrStopLocalIndex = (event: Record<string, unknown>): number | null => {
          const indexed = getEventIndex(event);
          if (indexed !== null) return indexed;
          if (openStreamLocalIndices.size === 1) {
            return [...openStreamLocalIndices][0];
          }
          return null;
        };

        const closeOpenStreamBlocks = () => {
          for (const localIndex of [...openStreamLocalIndices]) {
            const globalIndex = streamLocalToGlobalIndex.get(localIndex);
            if (globalIndex !== undefined) {
              emit("content_block_stop", { type: "content_block_stop", index: globalIndex });
            }
            openStreamLocalIndices.delete(localIndex);
          }
        };

        const resetTurnStreamTracking = () => {
          closeOpenStreamBlocks();
          streamLocalToGlobalIndex.clear();
          openStreamLocalIndices.clear();
          sawStreamTextThisTurn = false;
          streamedToolUseIdsThisTurn.clear();
          streamedToolUseNamesThisTurn.clear();
        };

        for await (const message of query) {
          if (message.type === "user") {
            if (sdkToolResultBridge) {
              const bridgedResults = extractSdkToolResultsFromUserMessage(message);
              for (const entry of bridgedResults) {
                sdkToolResultBridge.publish(entry.toolCallId, entry.output, entry.toolName);
              }
            }
            continue;
          }

          // ── stream_event: real-time deltas (text + tool_use) ──────────────
          if (message.type === "stream_event") {
            const event = (message as { event?: unknown }).event;
            if (!isDictionary(event) || typeof event.type !== "string") continue;

            if (event.type === "content_block_start" && isDictionary(event.content_block)) {
              const explicitLocalIndex = getEventIndex(event);
              if (
                explicitLocalIndex === 0 &&
                streamLocalToGlobalIndex.size > 0 &&
                !openStreamLocalIndices.has(0)
              ) {
                // New turn started but an assistant summary message did not arrive.
                resetTurnStreamTracking();
              }
              const localIndex = explicitLocalIndex ?? syntheticStreamLocalIndex--;
              if (streamLocalToGlobalIndex.has(localIndex)) {
                // Duplicate/out-of-order start; keep the first mapping for append-only deltas.
                continue;
              }
              const globalIndex = allocateContentIndex();
              streamLocalToGlobalIndex.set(localIndex, globalIndex);
              openStreamLocalIndices.add(localIndex);

              const blockType = event.content_block.type;
              if (blockType === "text") {
                emit("content_block_start", {
                  type: "content_block_start",
                  index: globalIndex,
                  content_block: { type: "text", text: "" },
                });
                sawStreamTextThisTurn = true;
              } else if (blockType === "tool_use") {
                const toolUseId =
                  typeof event.content_block.id === "string"
                    ? event.content_block.id
                    : `toolu_${crypto.randomUUID()}`;
                const toolName =
                  typeof event.content_block.name === "string"
                    ? event.content_block.name
                    : "unknown";
                emit("content_block_start", {
                  type: "content_block_start",
                  index: globalIndex,
                  content_block: {
                    type: "tool_use",
                    id: toolUseId,
                    name: toolName,
                  },
                });
                streamedToolUseIdsThisTurn.add(toolUseId);
                streamedToolUseNamesThisTurn.add(toolName);
              } else {
                openStreamLocalIndices.delete(localIndex);
              }
              continue;
            }

            if (event.type === "content_block_delta" && isDictionary(event.delta)) {
              const localIndex = resolveDeltaOrStopLocalIndex(event);
              let globalIndex = localIndex !== null
                ? streamLocalToGlobalIndex.get(localIndex)
                : undefined;
              if (globalIndex === undefined) {
                // Out-of-order delta before start; synthesize a matching block so
                // downstream append-only validation remains stable.
                const fallbackLocalIndex = localIndex ?? syntheticStreamLocalIndex--;
                globalIndex = allocateContentIndex();
                streamLocalToGlobalIndex.set(fallbackLocalIndex, globalIndex);
                openStreamLocalIndices.add(fallbackLocalIndex);
                if (event.delta.type === "text_delta") {
                  emit("content_block_start", {
                    type: "content_block_start",
                    index: globalIndex,
                    content_block: { type: "text", text: "" },
                  });
                  sawStreamTextThisTurn = true;
                } else if (event.delta.type === "input_json_delta") {
                  const toolUseId = `toolu_${crypto.randomUUID()}`;
                  const toolName = "unknown";
                  emit("content_block_start", {
                    type: "content_block_start",
                    index: globalIndex,
                    content_block: { type: "tool_use", id: toolUseId, name: toolName },
                  });
                  streamedToolUseIdsThisTurn.add(toolUseId);
                  streamedToolUseNamesThisTurn.add(toolName);
                }
              }

              if (event.delta.type === "text_delta" && typeof event.delta.text === "string") {
                emit("content_block_delta", {
                  type: "content_block_delta",
                  index: globalIndex,
                  delta: { type: "text_delta", text: event.delta.text },
                });
                outputTokens += Math.max(1, Math.ceil(String(event.delta.text).length / 4));
              } else if (event.delta.type === "input_json_delta" && typeof event.delta.partial_json === "string") {
                emit("content_block_delta", {
                  type: "content_block_delta",
                  index: globalIndex,
                  delta: { type: "input_json_delta", partial_json: event.delta.partial_json },
                });
              }
              continue;
            }

            if (event.type === "content_block_stop") {
              const localIndex = resolveDeltaOrStopLocalIndex(event);
              if (localIndex === null) continue;
              const globalIndex = streamLocalToGlobalIndex.get(localIndex);
              if (globalIndex === undefined || !openStreamLocalIndices.has(localIndex)) continue;
              emit("content_block_stop", { type: "content_block_stop", index: globalIndex });
              openStreamLocalIndices.delete(localIndex);
              continue;
            }

            // Pass through any other stream events we don't handle
            continue;
          }

          if (message.type === "tool_use_summary") {
            const summary = (message as { summary?: unknown }).summary;
            if (typeof summary === "string" && summary.trim().length > 0) {
              emitTextBlock(summary);
            }
            continue;
          }

          // ── assistant: finalized message with content blocks ──────────────
          if (message.type === "assistant") {
            closeOpenStreamBlocks();
            const assistant = message as {
              message?: {
                content?: Array<{
                  type?: string;
                  text?: string;
                  id?: string;
                  name?: string;
                  input?: unknown;
                }>;
              };
              error?: string;
            };

            if (
              assistant.error === "authentication_failed" ||
              assistant.error === "billing_error"
            ) {
              throw new Error(assistant.error);
            }

            // Fallback/patch-up mode: emit assistant content that wasn't already
            // streamed as deltas in this turn.
            const content = assistant.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (!block?.type) continue;

                if (block.type === "tool_use" && block.id && block.name) {
                  const duplicateById = streamedToolUseIdsThisTurn.has(block.id);
                  const duplicateByName = streamedToolUseNamesThisTurn.has(block.name);
                  if (duplicateById || duplicateByName) {
                    continue;
                  }
                  emitToolUseBlock(block.id, block.name, JSON.stringify(block.input ?? {}));
                } else if (block.type === "text" && block.text) {
                  // Avoid duplicate assistant text only when stream text for this turn
                  // was already emitted.
                  if (!sawStreamTextThisTurn) {
                    emitTextBlock(block.text);
                  }
                }
              }
            }
            resetTurnStreamTracking();
            continue;
          }

          // ── result: final message ─────────────────────────────────────────
          if (message.type === "result") {
            closeOpenStreamBlocks();
            const result = message as {
              is_error?: boolean;
              subtype?: string;
              result?: string;
              errors?: string[];
            };

            if (Array.isArray(result.errors) && result.errors.length > 0) {
              const errorText = result.errors.join("\n");
              emitTextBlock(errorText);
            }

            if (
              nextContentIndex === 0 &&
              typeof result.result === "string" &&
              result.result.length > 0
            ) {
              emitTextBlock(result.result);
            }

            if (result.is_error) {
              console.error("[ClaudeCode] SDK query error:", result.subtype);
            }
            continue;
          }
        }

        closeOpenStreamBlocks();

        // Close the message
        emit("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: outputTokens },
        });
        emit("message_stop", { type: "message_stop" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[ClaudeCode] Streaming error:", errorMessage);

        try {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "api_error", message: errorMessage } })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } catch {
          // Controller may already be closed
        }
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runClaudeAgentQuery(options: {
  prompt: string;
  model: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  sdkOptions?: ClaudeAgentSdkQueryOptions;
}): Promise<string> {
  const abortController = new AbortController();
  const signal = options.signal;

  const onAbort = () => abortController.abort();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const sdk = options.sdkOptions;

  // Resolve per-request Seline MCP context: explicit sdkOptions take precedence,
  // then fall back to AsyncLocalStorage (set by the chat route before streamText).
  const mcpCtx: SelineMcpContext | undefined =
    sdk?.mcpContext ?? mcpContextStore.getStore();

  // Build an in-process MCP server that exposes Seline platform tools to the
  // SDK agent when context is available.
  const selineMcpServers = mcpCtx
    ? { "seline-platform": createSelineSdkMcpServer(mcpCtx) }
    : undefined;

  // Resolve working directory: explicit SDK option > MCP context > process.cwd()
  const resolvedCwd = sdk?.cwd ?? mcpCtx?.cwd ?? process.cwd();

  // Bridge Seline plugin cache paths → SDK plugin configs
  const selinePluginConfigs: SdkPluginConfig[] = (mcpCtx?.pluginPaths ?? [])
    .map((p) => ({ type: "local" as const, path: p }));
  const mergedPlugins = selinePluginConfigs.length > 0 || sdk?.plugins
    ? [...selinePluginConfigs, ...(sdk?.plugins ?? [])]
    : undefined;

  // Bridge Seline hooks → SDK hook callbacks
  const selineHooks = mcpCtx?.hookContext
    ? buildSdkHooksFromSeline(
        mcpCtx.sessionId,
        mcpCtx.hookContext.allowedPluginNames,
        mcpCtx.hookContext.pluginRoots,
      )
    : undefined;
  const mergedHookMap = mergeHooks(selineHooks, sdk?.hooks);

  const query = claudeAgentQuery({
    prompt: options.prompt,
    options: {
      abortController,
      cwd: resolvedCwd,
      ...(resolvedCwd !== process.cwd() ? { additionalDirectories: [resolvedCwd] } : {}),
      executable: "node",
      includePartialMessages: true,
      // Allow multi-step agentic work (read → plan → write → verify).
      maxTurns: sdk?.maxTurns ?? 1000,
      model: options.model,
      // bypassPermissions is the correct default for a headless server context:
      // there is no interactive TTY to approve permission prompts, so "default"
      // mode causes the agent to stall on every write/bash and fall back to
      // asking clarifying questions instead of executing.
      permissionMode: sdk?.permissionMode ?? "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Always provide a sanitized env:
      // - Strip ANTHROPIC_API_KEY so the SDK uses OAuth, not the app-level key
      // - Strip CLAUDECODE to avoid "nested session" errors
      // - In Electron production, set ELECTRON_RUN_AS_NODE=1 (Electron binary → Node mode)
      env: (() => {
        const e: Record<string, string | undefined> = { ...process.env };
        delete e.ANTHROPIC_API_KEY;
        delete e.CLAUDECODE;
        if (isElectronProduction()) e.ELECTRON_RUN_AS_NODE = "1";
        return e;
      })(),
      ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
      // Seline platform tools exposed via in-process MCP server
      ...(selineMcpServers ? { mcpServers: selineMcpServers } : {}),
      // SDK-native passthrough options
      ...(sdk?.agents ? { agents: sdk.agents } : {}),
      ...(sdk?.allowedTools ? { allowedTools: sdk.allowedTools } : {}),
      ...(sdk?.disallowedTools ? { disallowedTools: sdk.disallowedTools } : {}),
      ...(mergedHookMap ? { hooks: mergedHookMap } : {}),
      ...(mergedPlugins ? { plugins: mergedPlugins } : {}),
      ...(sdk?.resume ? { resume: sdk.resume } : {}),
      ...(sdk?.sessionId ? { sessionId: sdk.sessionId } : {}),
      ...(sdk?.outputFormat ? { outputFormat: sdk.outputFormat } : {}),
      ...(sdk?.thinking ? { thinking: sdk.thinking } : {}),
      ...(sdk?.effort ? { effort: sdk.effort } : {}),
      ...(sdk?.persistSession !== undefined ? { persistSession: sdk.persistSession } : {}),
    },
  });

  let text = "";
  let sawStreamText = false;

  try {
    for await (const message of query) {
      if (message.type === "stream_event") {
        const event = (message as { event?: unknown }).event;
        if (
          isDictionary(event) &&
          event.type === "content_block_delta" &&
          isDictionary(event.delta) &&
          event.delta.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          sawStreamText = true;
          text += event.delta.text;
        }
        continue;
      }

      if (message.type === "assistant") {
        const assistant = message as {
          message?: {
            content?: Array<{ type?: string; text?: string }>;
          };
          error?: string;
        };

        // Surface auth and billing errors immediately so the retry handler can act.
        if (
          assistant.error === "authentication_failed" ||
          assistant.error === "billing_error"
        ) {
          throw new Error(assistant.error);
        }

        // Agent SDK emits both stream deltas and a finalized assistant payload.
        // If we already consumed deltas, skip assistant text to avoid duplicate output.
        if (!sawStreamText) {
          const content = assistant.message?.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part?.type === "text" && typeof part.text === "string") {
                text += part.text;
              }
            }
          }
        }
        continue;
      }

      if (message.type === "result") {
        const result = message as {
          is_error?: boolean;
          subtype?: string;
          result?: string;
          errors?: string[];
        };

        // Some SDK versions include a final textual result summary; only use it
        // when no stream/assistant text was captured.
        if (
          !sawStreamText &&
          text.trim().length === 0 &&
          typeof result.result === "string" &&
          result.result.length > 0
        ) {
          text = result.result;
        }

        if (Array.isArray(result.errors) && result.errors.length > 0) {
          text = `${text}\n${result.errors.join("\n")}`.trim();
        }

        if (result.is_error) {
          throw new Error(result.subtype || "error_during_execution");
        }
        continue;
      }

      // The SDK emits additional informational messages (system subtypes like
      // hook_started/hook_response/files_persisted, tool_progress, task_notification,
      // status, etc.). These don't affect the text output but should not cause errors.
      // We intentionally fall through without handling them.
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  return text.trim();
}

/**
 * Execute a Claude Agent SDK query with full SDK capabilities.
 *
 * Unlike the fetch-interceptor path (`createClaudeCodeProvider`), this API
 * accepts native SDK options such as agent definitions, lifecycle hooks, plugin
 * loading, session continuation, structured output, and thinking controls.
 *
 * Includes the same retry-with-exponential-backoff and auth-check behaviour as
 * the fetch interceptor, making it safe to use from background tasks, prompt
 * enhancement pipelines, and direct SDK integrations.
 *
 * @example
 * ```ts
 * const result = await queryWithSdkOptions({
 *   prompt: "Summarise the changes in the last commit",
 *   model: "claude-sonnet-4-6",
 *   sdkOptions: {
 *     persistSession: false,
 *     maxTurns: 3,
 *     allowedTools: ["Bash", "Read"],
 *   },
 * });
 * ```
 */
export async function queryWithSdkOptions(options: {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  sdkOptions?: ClaudeAgentSdkQueryOptions;
}): Promise<string> {
  const model = options.model ?? DEFAULT_MODEL;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runClaudeAgentQuery({
        prompt: options.prompt,
        model,
        systemPrompt: options.systemPrompt,
        signal: options.signal,
        sdkOptions: options.sdkOptions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isAuthError(message)) {
        const authStatus = await readClaudeAgentSdkAuthStatus({ timeoutMs: 20_000, model });
        if (!authStatus.authenticated) {
          const err = new Error("Claude Agent SDK authentication required") as Error & {
            auth: { required: boolean; url: string | undefined; output: string[] | undefined };
          };
          err.auth = { required: true, url: authStatus.authUrl, output: authStatus.output };
          throw err;
        }
      }

      const classification = classifyRecoverability({
        provider: "claudecode",
        error,
        message,
      });

      const retry = shouldRetry({
        classification,
        attempt,
        maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS,
        aborted: options.signal?.aborted ?? false,
      });

      if (!retry) {
        throw error;
      }

      const delay = getBackoffDelayMs(attempt);
      console.log("[ClaudeCode] Retrying Agent SDK query", {
        attempt: attempt + 1,
        reason: classification.reason,
        delayMs: delay,
      });
      await sleepWithAbort(delay, options.signal ?? undefined);
    }
  }
}

function createClaudeCodeFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept Anthropic API calls.
    if (!url.includes("api.anthropic.com")) {
      return fetch(input, init);
    }

    if (!init?.body || typeof init.body !== "string") {
      return fetch(input, init);
    }

    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return fetch(input, init);
    }

    const normalizedToolInputs = normalizeAnthropicToolUseInputs(parsedBody);
    if (normalizedToolInputs.fixedCount > 0) {
      console.warn(
        `[ClaudeCode] Normalized ${normalizedToolInputs.fixedCount} invalid tool_use.input payload(s) before Agent SDK call`,
      );
    }

    const sanitizedBody = sanitizeJsonStringValues(normalizedToolInputs.body);
    if (sanitizedBody.changed) {
      console.warn("[ClaudeCode] Replaced lone surrogate characters in request body before Agent SDK call");
    }

    const requestBody = sanitizedBody.value as Record<string, unknown>;
    const prompt = buildPromptFromMessages(requestBody.messages);
    const model = typeof requestBody.model === "string" ? requestBody.model : DEFAULT_MODEL;
    const systemPrompt = buildSystemPrompt(requestBody.system);
    const isStream = requestBody.stream === true;

    // For streaming requests, use the real-time streaming path that pipes SDK
    // events (including tool_use blocks) directly to the client as SSE.
    if (isStream) {
      return createStreamingClaudeCodeResponse({
        prompt,
        model,
        systemPrompt,
        signal: init.signal ?? undefined,
      });
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        const output = await runClaudeAgentQuery({
          prompt,
          model,
          systemPrompt,
          signal: init.signal ?? undefined,
        });

        return createAnthropicMessageResponse(output, model);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (isAuthError(message)) {
          const authStatus = await readClaudeAgentSdkAuthStatus({ timeoutMs: 20_000, model });
          if (!authStatus.authenticated) {
            return new Response(
              JSON.stringify({
                error: "Claude Agent SDK authentication required",
                auth: {
                  required: true,
                  url: authStatus.authUrl,
                  output: authStatus.output,
                },
              }),
              {
                status: 401,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }
        }

        const classification = classifyRecoverability({
          provider: "claudecode",
          error,
          message,
        });

        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS,
          aborted: init.signal?.aborted ?? false,
        });

        if (!retry) {
          throw error;
        }

        const delay = getBackoffDelayMs(attempt);
        console.log("[ClaudeCode] Retrying Agent SDK request", {
          attempt: attempt + 1,
          reason: classification.reason,
          delayMs: delay,
          outcome: "scheduled",
        });
        await sleepWithAbort(delay, init.signal ?? undefined);
      }
    }
  };
}

export function createClaudeCodeProvider(): (modelId: string) => LanguageModel {
  const provider = createAnthropic({
    apiKey: "claude-agent-sdk",
    fetch: createClaudeCodeFetch(),
  });

  return (modelId: string): LanguageModel => {
    return provider(modelId) as unknown as LanguageModel;
  };
}
