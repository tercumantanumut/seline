/**
 * Deep Research API Route
 *
 * Streaming endpoint for deep research mode.
 * Uses Server-Sent Events (SSE) to stream progress updates to the client.
 */

import { runDeepResearch, type DeepResearchEvent, type DeepResearchConfig } from '@/lib/ai/deep-research';
import { getWebSearchProviderStatus } from '@/lib/ai/web-search/providers';
import { requireAuth } from '@/lib/auth/local-auth';
import { createSession, createMessage, getOrCreateLocalUser, getSession } from '@/lib/db/queries';
import { nextOrderingIndex } from '@/lib/session/message-ordering';
import { loadSettings } from '@/lib/settings/settings-manager';
import { extractSessionModelConfig } from '@/lib/ai/session-model-resolver';
import {
  createAgentRun,
  completeAgentRun,
  updateAgentRunMetadata,
  withRunContext,
  appendRunEvent,
} from "@/lib/observability";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { registerChatAbortController, removeChatAbortController } from "@/lib/background-tasks/chat-abort-registry";
import { buildInterruptionMessage, buildInterruptionMetadata } from "@/lib/messages/interruption";
import type { ChatTask } from "@/lib/background-tasks/types";
import type { FinalReport, ResearchFinding, ResearchPhase } from "@/lib/ai/deep-research/types";

export const maxDuration = 300; // 5 minutes for deep research

type DeepResearchProgress = {
  completed: number;
  total: number;
  currentQuery: string;
} | null;

interface PersistedDeepResearchState {
  runId: string;
  query: string;
  phase: ResearchPhase;
  phaseMessage: string;
  progress: DeepResearchProgress;
  findings: ResearchFinding[];
  finalReport: FinalReport | null;
  error: string | null;
  updatedAt: string;
}

function createInitialPersistedState(runId: string, query: string): PersistedDeepResearchState {
  return {
    runId,
    query,
    phase: "idle",
    phaseMessage: "",
    progress: null,
    findings: [],
    finalReport: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    // Authenticate user
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    // Parse request body
    const body = await req.json();
    const { query, sessionId: providedSessionId, config: userConfig } = body as {
      query: string;
      sessionId?: string;
      config?: Partial<DeepResearchConfig>;
    };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get or create session
    let sessionId = typeof providedSessionId === 'string' ? providedSessionId.trim() : providedSessionId;
    let sessionMetadata: Record<string, unknown> | null = null;

    if (sessionId) {
      const existingSession = await getSession(sessionId);
      if (!existingSession || existingSession.userId !== dbUser.id) {
        return new Response(
          JSON.stringify({ error: 'Session not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      sessionMetadata = (existingSession.metadata as Record<string, unknown> | null) ?? null;
    } else {
      const session = await createSession({
        title: `Research: ${query.slice(0, 50)}...`,
        userId: dbUser.id,
        metadata: { type: 'deep-research' },
      });
      sessionId = session.id;
      sessionMetadata = (session.metadata as Record<string, unknown> | null) ?? null;
    }

    const sessionModelConfig = extractSessionModelConfig(sessionMetadata);
    const deepResearchConfig: Partial<DeepResearchConfig> = {
      ...userConfig,
      ...(sessionModelConfig?.sessionResearchModel ? { researchModel: sessionModelConfig.sessionResearchModel } : {}),
      ...(sessionModelConfig?.sessionProvider ? { sessionProvider: sessionModelConfig.sessionProvider } : {}),
    };

    // Save user query as a message
    await createMessage({
      sessionId,
      role: 'user',
      content: [{ type: 'text', text: `[Deep Research] ${query}` }],
      metadata: { deepResearch: true },
    });

    // Create agent run for observability
    const agentRun = await createAgentRun({
      sessionId,
      userId: dbUser.id,
      pipelineName: "deep-research",
      triggerType: "api",
      metadata: {
        queryLength: query.length,
        hasCustomConfig: !!userConfig,
      },
    });

    // Create abort controller for cancellation
    const abortController = new AbortController();
    registerChatAbortController(agentRun.id, abortController);

    const deepResearchTask: ChatTask = {
      runId: agentRun.id,
      type: "chat",
      status: "running",
      userId: dbUser.id,
      sessionId,
      pipelineName: "deep-research",
      triggerType: "api",
      startedAt: agentRun.startedAt,
      metadata: {
        deepResearch: true,
        query,
      },
    };
    taskRegistry.register(deepResearchTask);

    let persistedState = createInitialPersistedState(agentRun.id, query.trim());

    const persistState = async (partial: Partial<PersistedDeepResearchState>) => {
      persistedState = {
        ...persistedState,
        ...partial,
        updatedAt: new Date().toISOString(),
      };
      await updateAgentRunMetadata(agentRun.id, {
        deepResearchState: persistedState,
      });
    };

    await persistState({ phase: "planning", phaseMessage: "Creating research plan..." });

    // Create SSE stream
    const encoder = new TextEncoder();
    let isClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Safe enqueue that checks if controller is still open
        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              controller.enqueue(data);
            } catch {
              // Controller already closed, ignore
              isClosed = true;
            }
          }
        };

        // Safe close that checks if controller is still open
        const safeClose = () => {
          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch {
              // Controller already closed, ignore
              isClosed = true;
            }
          }
        };

        const sendEvent = (event: DeepResearchEvent) => {
          const data = JSON.stringify(event);
          safeEnqueue(encoder.encode(`data: ${data}\n\n`));
        };

        let eventPersistenceQueue: Promise<void> = Promise.resolve();

        const persistEventState = async (event: DeepResearchEvent) => {
          switch (event.type) {
            case "phase_change":
              await persistState({ phase: event.phase, phaseMessage: event.message, error: null });
              taskRegistry.emitProgress(agentRun.id, event.message, undefined, {
                sessionId,
                userId: dbUser.id,
                type: "chat",
                startedAt: agentRun.startedAt,
              });
              break;
            case "search_progress":
              await persistState({
                phase: "searching",
                progress: {
                  completed: event.completed,
                  total: event.total,
                  currentQuery: event.currentQuery,
                },
                error: null,
              });
              taskRegistry.emitProgress(agentRun.id, `Research search progress ${event.completed}/${event.total}`, undefined, {
                sessionId,
                userId: dbUser.id,
                type: "chat",
                startedAt: agentRun.startedAt,
              });
              break;
            case "search_result":
              await persistState({ findings: [...persistedState.findings, event.finding], error: null });
              break;
            case "final_report":
              await persistState({ phase: "complete", finalReport: event.report, error: null });
              break;
            case "error":
              await persistState({ phase: "error", error: event.error });
              break;
            case "complete":
              await persistState({ phase: "complete", error: null });
              break;
            default:
              break;
          }
        };

        const queueEventHandling = (event: DeepResearchEvent) => {
          sendEvent(event);
          eventPersistenceQueue = eventPersistenceQueue
            .then(() => persistEventState(event))
            .catch((persistError) => {
              console.error("[DEEP-RESEARCH API] Failed to persist event state:", persistError);
            });
        };

        // Wrap stream logic with run context
        await withRunContext(
          { runId: agentRun.id, sessionId, pipelineName: "deep-research" },
          async () => {
            try {
              // Run deep research with event streaming and abort signal
              const finalState = await runDeepResearch(
                query.trim(),
                (event) => {
                  queueEventHandling(event);
                },
                { ...deepResearchConfig, abortSignal: abortController.signal }
              );

              // Save final report as assistant message
              if (finalState.finalReport) {
                await createMessage({
                  sessionId,
                  role: 'assistant',
                  content: [
                    { type: 'text', text: finalState.finalReport.content },
                  ],
                  metadata: {
                    deepResearch: true,
                    citations: finalState.finalReport.citations,
                    researchPlan: finalState.plan,
                  },
                });
              }

              await eventPersistenceQueue;

              // Complete agent run successfully
              await completeAgentRun(agentRun.id, "succeeded", {
                hasReport: !!finalState.finalReport,
                citationCount: finalState.finalReport?.citations?.length || 0,
                deepResearchState: {
                  ...persistedState,
                  phase: "complete",
                  finalReport: finalState.finalReport ?? persistedState.finalReport,
                  error: null,
                  updatedAt: new Date().toISOString(),
                },
              });
              taskRegistry.updateStatus(agentRun.id, "succeeded");
              removeChatAbortController(agentRun.id);

              // Send done event
              safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              safeClose();
            } catch (error) {
              await eventPersistenceQueue;
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';

              // Don't log cancellation as an error - it's expected behavior
              if (errorMessage !== 'Research cancelled') {
                console.error('[DEEP-RESEARCH API] Error:', errorMessage);
                // Send error event (only if stream is still open)
                sendEvent({
                  type: 'error',
                  error: errorMessage,
                  timestamp: new Date(),
                });
                // Complete agent run as failed
                await completeAgentRun(agentRun.id, "failed", {
                  error: errorMessage,
                  deepResearchState: {
                    ...persistedState,
                    phase: "error",
                    error: errorMessage,
                    updatedAt: new Date().toISOString(),
                  },
                });
                taskRegistry.updateStatus(agentRun.id, "failed", { error: errorMessage });
              } else {
                console.log('[DEEP-RESEARCH API] Research cancelled by user');
                const interruptionTimestamp = new Date();
                await createMessage({
                  sessionId,
                  role: 'system',
                  content: [
                    {
                      type: 'text',
                      text: buildInterruptionMessage('deep-research', interruptionTimestamp),
                    },
                  ],
                  metadata: buildInterruptionMetadata('deep-research', interruptionTimestamp),
                  orderingIndex: await nextOrderingIndex(sessionId),
                });
                // Complete agent run as cancelled
                await completeAgentRun(agentRun.id, "cancelled", {
                  reason: "user_cancelled",
                  deepResearchState: {
                    ...persistedState,
                    phase: "idle",
                    phaseMessage: "Research cancelled",
                    error: null,
                    updatedAt: new Date().toISOString(),
                  },
                });
                taskRegistry.updateStatus(agentRun.id, "cancelled");
                await appendRunEvent({
                  runId: agentRun.id,
                  eventType: "run_completed",
                  level: "info",
                  pipelineName: "deep-research",
                  data: { status: "cancelled", reason: "user_cancelled" },
                });
              }

              removeChatAbortController(agentRun.id);
              safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              safeClose();
            }
          }
        );
      },
      cancel() {
        // Client disconnected: keep processing in background and rely on polling.
        isClosed = true;
        console.log('[DEEP-RESEARCH API] Stream closed by client, continuing in background');
      },
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Session-Id': sessionId,
        'X-Run-Id': agentRun.id,
      },
    });
  } catch (error) {
    console.error('[DEEP-RESEARCH API] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// GET endpoint to check if deep research is available
export async function GET() {
  const searchStatus = getWebSearchProviderStatus();

  return new Response(
    JSON.stringify({
      available: true,
      searchConfigured: searchStatus.available,
      searchProvider: searchStatus.activeProvider,
      searchEnhanced: searchStatus.enhanced,
      message: searchStatus.enhanced
        ? 'Deep Research is configured with Tavily-enhanced web search.'
        : 'Deep Research is configured with DuckDuckGo web search (works out of the box). Add Tavily for enhanced search quality.',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

