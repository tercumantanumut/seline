/**
 * Video Assembly API Route
 *
 * Streaming endpoint for video assembly mode.
 * Uses Server-Sent Events (SSE) to stream progress updates to the client.
 */

import {
  runVideoAssembly,
  type VideoAssemblyEvent,
  type VideoAssemblyConfig,
  DEFAULT_VIDEO_ASSEMBLY_CONFIG,
} from "@/lib/ai/video-assembly";
import { requireAuth } from "@/lib/auth/local-auth";
import { createMessage, getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { buildInterruptionMessage, buildInterruptionMetadata } from "@/lib/messages/interruption";
import { nextOrderingIndex } from "@/lib/session/message-ordering";

export const maxDuration = 600; // 10 minutes for video rendering

export async function POST(req: Request) {
  try {
    // Authenticate user
    const userId = await requireAuth(req);
    const settings = loadSettings();
    await getOrCreateLocalUser(userId, settings.localUserEmail);

    // Parse request body
    const body = await req.json();
    const {
      sessionId,
      theme,
      style,
      targetDuration,
      fps,
      width,
      height,
      transitionDuration,
      defaultTransition,
      includeTextOverlays,
      instructions,
    } = body as {
      sessionId: string;
      theme?: string;
      style?: string;
      targetDuration?: number;
      fps?: number;
      width?: number;
      height?: number;
      transitionDuration?: number;
      defaultTransition?: string;
      includeTextOverlays?: boolean;
      instructions?: string;
    };

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build config from inputs
    const config: VideoAssemblyConfig = {
      ...DEFAULT_VIDEO_ASSEMBLY_CONFIG,
      ...(fps && { fps }),
      ...(width && { outputWidth: width }),
      ...(height && { outputHeight: height }),
      ...(transitionDuration && { transitionDuration }),
      ...(defaultTransition && { defaultTransition: defaultTransition as VideoAssemblyConfig["defaultTransition"] }),
    };

    // Build input
    const input = {
      theme,
      style,
      targetDuration,
      includeTextOverlays: includeTextOverlays ?? true,
      userInstructions: instructions,
    };

    const abortController = new AbortController();

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: VideoAssemblyEvent) => {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          // Run video assembly with event streaming
          const finalState = await runVideoAssembly(
            sessionId,
            input,
            sendEvent,
            config,
            abortController.signal
          );

          // Save result as assistant message
          if (finalState.outputUrl) {
            const messageIndex = await nextOrderingIndex(sessionId);
            await createMessage({
              sessionId,
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: `Video assembled successfully!\n\n**Concept:** ${finalState.plan?.concept || "N/A"}\n\n**Duration:** ${finalState.plan?.totalDuration}s\n\n**Scenes:** ${finalState.plan?.scenes.length}`,
                },
              ],
              orderingIndex: messageIndex,
              metadata: {
                videoAssembly: true,
                videoUrl: finalState.outputUrl,
                plan: finalState.plan,
              },
            });
          }

          // Send done event
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          if (error instanceof Error && error.name === "AbortError") {
            const interruptionTimestamp = new Date();
            await createMessage({
              sessionId,
              role: "system",
              content: [
                {
                  type: "text",
                  text: buildInterruptionMessage("video-assembly", interruptionTimestamp),
                },
              ],
              metadata: buildInterruptionMetadata("video-assembly", interruptionTimestamp),
            });
            console.log("[VIDEO-ASSEMBLY API] Render cancelled by user");
            controller.close();
            return;
          }

          console.error("[VIDEO-ASSEMBLY API] Error:", errorMessage);

          // Send error event
          sendEvent({
            type: "error",
            error: errorMessage,
            phase: "analyzing", // Default phase for errors
            timestamp: new Date(),
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": sessionId,
      },
    });
  } catch (error) {
    console.error("[VIDEO-ASSEMBLY API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// GET endpoint to check if video assembly is available
export async function GET() {
  const remotionConfigured = true; // Remotion is bundled with the app

  return new Response(
    JSON.stringify({
      available: true,
      remotionConfigured,
      message: "Video Assembly is available",
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}

