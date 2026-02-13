/**
 * Web Browse API Route
 *
 * Streaming endpoint for web browsing with progress updates.
 * Uses Server-Sent Events (SSE) to stream fetching and synthesis progress.
 */

import { requireAuth } from "@/lib/auth/local-auth";
import { createMessage, getOrCreateLocalUser } from "@/lib/db/queries";
import { nextOrderingIndex } from "@/lib/session/message-ordering";
import { loadSettings } from "@/lib/settings/settings-manager";
import { browseAndSynthesize, type WebBrowseEvent } from "@/lib/ai/web-browse";
import { getWebScraperProvider } from "@/lib/ai/web-scraper/provider";
import {
  createAgentRun,
  completeAgentRun,
  withRunContext,
  appendRunEvent,
} from "@/lib/observability";
import { buildInterruptionMessage, buildInterruptionMetadata } from "@/lib/messages/interruption";

export const maxDuration = 120; // 2 minutes max for web browsing

export async function POST(req: Request) {
  try {
    // Authenticate user
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    // Parse request body
    const body = await req.json();
    const { urls, query, sessionId, characterId } = body as {
      urls: string[] | string;
      query: string;
      sessionId: string;
      characterId?: string;
    };
    const normalizedUrls = Array.isArray(urls)
      ? urls
      : typeof urls === "string"
        ? urls
            .split(",")
            .map((url) => url.trim())
            .filter((url) => url.length > 0)
        : [];

    // Validate inputs
    if (normalizedUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (normalizedUrls.length > 5) {
      return new Response(
        JSON.stringify({ error: "Maximum 5 URLs allowed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Session ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create agent run for observability
    const agentRun = await createAgentRun({
      sessionId,
      userId: dbUser.id,
      pipelineName: "web-browse",
      triggerType: "api",
      characterId: characterId || undefined,
      metadata: {
        urlCount: normalizedUrls.length,
        queryLength: query.length,
        urls: normalizedUrls,
      },
    });

    // Create streaming response
    const encoder = new TextEncoder();
    const abortController = new AbortController();

    const stream = new ReadableStream({
      async start(controller) {
        // Send event helper
        const sendEvent = (event: WebBrowseEvent) => {
          try {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (err) {
            console.error("[WEB-BROWSE-API] Failed to send event:", err);
          }
        };

        // Wrap stream logic with run context
        await withRunContext(
          { runId: agentRun.id, sessionId, pipelineName: "web-browse" },
          async () => {
            try {
              // Run web browse with event streaming
              const result = await browseAndSynthesize({
                urls: normalizedUrls,
                query: query.trim(),
                options: {
                  sessionId,
                  userId: dbUser.id,
                  characterId: characterId || null,
                },
                emit: sendEvent,
                abortSignal: abortController.signal,
              });

              // Complete agent run successfully
              await completeAgentRun(agentRun.id, "succeeded", {
                sourcesUsed: result.fetchedUrls.length,
                synthesisLength: result.synthesis?.length || 0,
              });

              // Send final result event
              sendEvent({
                type: "synthesis_complete",
                synthesis: result.synthesis,
                sourcesUsed: result.fetchedUrls,
                timestamp: new Date(),
              });
            } catch (err) {
              if (err instanceof Error && err.name === "AbortError") {
                sendEvent({
                  type: "error",
                  error: "Request cancelled",
                  timestamp: new Date(),
                });
                const interruptionTimestamp = new Date();
                // Allocate ordering index for system interruption message
                const systemMessageIndex = await nextOrderingIndex(sessionId);

                await createMessage({
                  sessionId,
                  role: "system",
                  content: [
                    {
                      type: "text",
                      text: buildInterruptionMessage("web-browse", interruptionTimestamp),
                    },
                  ],
                  orderingIndex: systemMessageIndex,
                  metadata: buildInterruptionMetadata("web-browse", interruptionTimestamp),
                });
                // Complete agent run as cancelled
                await completeAgentRun(agentRun.id, "cancelled", {
                  reason: "user_aborted",
                });
                await appendRunEvent({
                  runId: agentRun.id,
                  eventType: "run_completed",
                  level: "info",
                  pipelineName: "web-browse",
                  data: { status: "cancelled", reason: "user_aborted" },
                });
              } else {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                console.error("[WEB-BROWSE-API] Error:", errorMessage);
                sendEvent({
                  type: "error",
                  error: errorMessage,
                  timestamp: new Date(),
                });
                // Complete agent run as failed
                await completeAgentRun(agentRun.id, "failed", {
                  error: errorMessage,
                });
              }
            } finally {
              controller.close();
            }
          }
        );
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[WEB-BROWSE-API] Unhandled error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET endpoint to check configuration
export async function GET() {
  const provider = getWebScraperProvider();
  const firecrawlConfigured =
    provider === "firecrawl" &&
    !!process.env.FIRECRAWL_API_KEY &&
    process.env.FIRECRAWL_API_KEY.trim().length > 0;
  const localConfigured = provider === "local";

  return new Response(
    JSON.stringify({
      available: true,
      provider,
      firecrawlConfigured,
      localConfigured,
      message: localConfigured
        ? "Web Browse is configured for local scraping"
        : firecrawlConfigured
          ? "Web Browse is fully configured"
          : "Web Browse requires FIRECRAWL_API_KEY to be configured",
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
