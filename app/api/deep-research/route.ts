/**
 * Deep Research API Route
 *
 * Streaming endpoint for deep research mode.
 * Uses Server-Sent Events (SSE) to stream progress updates to the client.
 */

import { runDeepResearch, type DeepResearchEvent, type DeepResearchConfig } from '@/lib/ai/deep-research';
import { getWebSearchProviderStatus } from '@/lib/ai/web-search/providers';
import { requireAuth } from '@/lib/auth/local-auth';
import { createSession, createMessage, getOrCreateLocalUser } from '@/lib/db/queries';
import { nextOrderingIndex } from '@/lib/session/message-ordering';
import { loadSettings } from '@/lib/settings/settings-manager';
import {
  createAgentRun,
  completeAgentRun,
  withRunContext,
  appendRunEvent,
} from "@/lib/observability";
import { buildInterruptionMessage, buildInterruptionMetadata } from "@/lib/messages/interruption";

export const maxDuration = 300; // 5 minutes for deep research

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
    let sessionId = providedSessionId;
    if (!sessionId) {
      const session = await createSession({
        title: `Research: ${query.slice(0, 50)}...`,
        userId: dbUser.id,
        metadata: { type: 'deep-research' },
      });
      sessionId = session.id;
    }

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

        // Wrap stream logic with run context
        await withRunContext(
          { runId: agentRun.id, sessionId, pipelineName: "deep-research" },
          async () => {
            try {
              // Run deep research with event streaming and abort signal
              const finalState = await runDeepResearch(
                query.trim(),
                sendEvent,
                { ...userConfig, abortSignal: abortController.signal }
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

              // Complete agent run successfully
              await completeAgentRun(agentRun.id, "succeeded", {
                hasReport: !!finalState.finalReport,
                citationCount: finalState.finalReport?.citations?.length || 0,
              });

              // Send done event
              safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              safeClose();
            } catch (error) {
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
                await completeAgentRun(agentRun.id, "failed", { error: errorMessage });
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
                await completeAgentRun(agentRun.id, "cancelled", { reason: "user_cancelled" });
                await appendRunEvent({
                  runId: agentRun.id,
                  eventType: "run_completed",
                  level: "info",
                  pipelineName: "deep-research",
                  data: { status: "cancelled", reason: "user_cancelled" },
                });
              }

              safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              safeClose();
            }
          }
        );
      },
      cancel() {
        // Called when the client aborts the request
        isClosed = true;
        abortController.abort(); // Signal the research to stop
        console.log('[DEEP-RESEARCH API] Stream cancelled by client');
      },
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Session-Id': sessionId,
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

