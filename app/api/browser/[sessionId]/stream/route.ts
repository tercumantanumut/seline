/**
 * SSE endpoint for real-time browser screencast frames.
 *
 * GET /api/browser/[sessionId]/stream
 *
 * Streams JPEG frames as Server-Sent Events from the CDP screencast.
 * Each event contains a base64-encoded JPEG frame (~20-40KB at quality 40).
 * At ~3 FPS, this uses ~60-120 KB/s — well within SSE limits.
 *
 * The client connects via EventSource and renders frames on an <img> element.
 */

import { NextRequest } from "next/server";
import { subscribeToFrames, isScreencastActive, getLatestFrame } from "@/lib/browser/screencast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HEAD — lightweight probe to check if a screencast is active.
 * Used by BrowserBackdrop to detect when to connect.
 */
export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const active = isScreencastActive(sessionId);
  return new Response(null, { status: active ? 200 : 404 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Check if there's an active screencast for this session
  if (!isScreencastActive(sessionId)) {
    return new Response(
      JSON.stringify({ error: "No active browser session", sessionId }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial frame immediately if available
      const latest = getLatestFrame(sessionId);
      if (latest) {
        const event = `data: ${JSON.stringify({ data: latest.data, ts: latest.receivedAt })}\n\n`;
        controller.enqueue(encoder.encode(event));
      }

      // Subscribe to future frames
      const unsubscribe = subscribeToFrames(sessionId, (frame) => {
        try {
          const event = `data: ${JSON.stringify({ data: frame.data, ts: frame.receivedAt })}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          // Stream may be closed
          unsubscribe();
        }
      });

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
