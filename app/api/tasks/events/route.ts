/**
 * SSE Endpoint for Unified Task Events
 *
 * Streams real-time task lifecycle events to connected clients.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { taskRegistry } from "@/lib/background-tasks/registry";
import type { TaskEvent } from "@/lib/background-tasks/types";
import { startScheduler } from "@/lib/scheduler/scheduler-service";
import { nowISO } from "@/lib/utils/timestamp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  await startScheduler();

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[SSE] Starting unified task stream for user: ${userId}`);

      const connectMessage = JSON.stringify({
        type: "connected",
        timestamp: nowISO(),
      });
      controller.enqueue(encoder.encode(`data: ${connectMessage}\n\n`));

      const handleEvent = (event: TaskEvent) => {
        try {
          const message = JSON.stringify({
            type: event.eventType,
            data: event,
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error("[SSE] Failed to send task event:", err);
        }
      };

      cleanup = taskRegistry.subscribeForUser(userId, {
        onStarted: handleEvent,
        onCompleted: handleEvent,
        onProgress: handleEvent,
      });

      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = JSON.stringify({
            type: "heartbeat",
            timestamp: nowISO(),
          });
          controller.enqueue(encoder.encode(`data: ${heartbeat}\n\n`));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
