/**
 * SSE Endpoint for Task Events
 *
 * Streams real-time task lifecycle events to connected clients.
 * Used by the notification system and active tasks indicator.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { taskRegistry } from "@/lib/background-tasks/registry";
import type { TaskEvent } from "@/lib/background-tasks/types";
import { startScheduler } from "@/lib/scheduler/scheduler-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Authenticate user
  let userId: string;
  try {
    userId = await requireAuth(request);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  // Ensure scheduler + task queue are running before streaming events
  await startScheduler();

  // Create SSE stream
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[SSE] Starting event stream for user: ${userId}`);

      // Send initial connection message
      const connectMessage = JSON.stringify({
        type: "connected",
        timestamp: new Date().toISOString(),
      });
      controller.enqueue(encoder.encode(`data: ${connectMessage}\n\n`));

      // Subscribe to task events for this user
      const handleStarted = (event: TaskEvent) => {
        const runId = "task" in event ? event.task.runId : event.runId;
        console.log(`[SSE] Sending task:started event to user ${userId}:`, runId);
        try {
          const message = JSON.stringify({
            type: "task:started",
            data: event,
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error(`[SSE] Failed to send task:started event:`, err);
        }
      };

      const handleCompleted = (event: TaskEvent) => {
        const runId = "task" in event ? event.task.runId : event.runId;
        console.log(`[SSE] Sending task:completed event to user ${userId}:`, runId);
        try {
          const message = JSON.stringify({
            type: "task:completed",
            data: event,
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error(`[SSE] Failed to send task:completed event:`, err);
        }
      };

      const handleProgress = (event: TaskEvent) => {
        const runId = "task" in event ? event.task.runId : event.runId;
        console.log(`[SSE] Sending task:progress event to user ${userId}:`, runId);
        try {
          const message = JSON.stringify({
            type: "task:progress",
            data: event,
          });

          // Safety guard: drop excessively large SSE messages (> 1MB)
          const MAX_SSE_MESSAGE_BYTES = 1_000_000;
          if (message.length > MAX_SSE_MESSAGE_BYTES) {
            console.error(
              `[SSE] Dropping oversized progress event (${(message.length / 1024).toFixed(0)}KB) for run ${runId}. ` +
              `This indicates a missing upstream truncation guard.`
            );
            const fallback = JSON.stringify({
              type: "task:progress",
              data: {
                runId,
                eventType: "task:progress",
                progressText: "Progress update (content too large for display)",
                timestamp: new Date().toISOString(),
                _oversizedDropped: true,
              },
            });
            controller.enqueue(encoder.encode(`data: ${fallback}\n\n`));
            return;
          }

          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error(`[SSE] Failed to send task:progress event:`, err);
        }
      };

      // Subscribe to user-specific events
      console.log(`[SSE] Subscribing to events for user: ${userId}`);
      cleanup = taskRegistry.subscribeForUser(userId, {
        onStarted: handleStarted,
        onCompleted: handleCompleted,
        onProgress: handleProgress,
      });
      console.log(`[SSE] Subscribed to events for user: ${userId}`);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${heartbeat}\n\n`));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Handle client disconnect
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
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
