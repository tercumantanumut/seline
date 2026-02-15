/**
 * SSE Endpoint for Unified Task Events
 *
 * Streams real-time task lifecycle events to connected clients.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { isTaskSuppressedFromUI, type TaskEvent } from "@/lib/background-tasks/types";
import { startScheduler } from "@/lib/scheduler/scheduler-service";
import { nowISO } from "@/lib/utils/timestamp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEBUG_SSE_EVENTS = process.env.DEBUG_SSE_EVENTS === "true";
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_SSE_MESSAGE_BYTES = 1_000_000; // 1MB

const redact = (value?: string) => {
  if (!value) return undefined;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

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
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let onAbort: (() => void) | null = null;
  let lastSuccessfulSendAt = Date.now();
  let lastHeartbeatScheduledAt = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[SSE] Starting unified task stream for user: ${userId}`);

      const sendDataMessage = (payload: unknown) => {
        const serializeStartedAt = Date.now();
        const message = JSON.stringify(payload);
        const serializeDurationMs = Date.now() - serializeStartedAt;
        const byteLength = Buffer.byteLength(message, "utf8");

        if (byteLength > MAX_SSE_MESSAGE_BYTES) {
          return { skipped: true, message, serializeDurationMs, byteLength, enqueueDurationMs: 0 };
        }

        const msSinceLastSuccessfulSend = Date.now() - lastSuccessfulSendAt;
        const enqueueStartedAt = Date.now();
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        const enqueueDurationMs = Date.now() - enqueueStartedAt;
        lastSuccessfulSendAt = Date.now();

        if (DEBUG_SSE_EVENTS) {
          console.log("[SSE] Event sent", {
            byteLength,
            serializeDurationMs,
            enqueueDurationMs,
            msSinceLastSuccessfulSend,
          });
        }

        return { skipped: false, message, serializeDurationMs, byteLength, enqueueDurationMs };
      };

      sendDataMessage({
        type: "connected",
        timestamp: nowISO(),
      });

      const handleEvent = (event: TaskEvent) => {
        try {
          if (event.eventType !== "task:progress" && isTaskSuppressedFromUI(event.task)) {
            return;
          }

          if (DEBUG_SSE_EVENTS) {
            console.log("[SSE] → Sending task event to client:", {
              eventType: event.eventType,
              runId: redact("task" in event ? event.task.runId : event.runId),
              type: "task" in event ? event.task.type : event.type,
              userId: redact("task" in event ? event.task.userId : event.userId),
              hasProgressText: event.eventType === "task:progress" ? Boolean(event.progressText) : undefined,
            });
          }

          const payload = {
            type: event.eventType,
            data: event,
          };
          const sendResult = sendDataMessage(payload);

          // Safety guard: drop excessively large SSE messages (> 1MB)
          // This prevents memory spikes from serialized oversized progressContent
          // that somehow bypassed upstream truncation guards.
          if (sendResult.skipped) {
            const runId = "task" in event ? event.task.runId : ("runId" in event ? event.runId : "?");
            console.error(
              `[SSE] Dropping oversized event (${(sendResult.byteLength / 1024).toFixed(0)}KB): ` +
              `type=${event.eventType}, runId=${runId}. ` +
              `This indicates a missing upstream truncation guard.`
            );

            sendDataMessage({
              type: event.eventType,
              data: {
                ...("runId" in event ? { runId: event.runId, type: event.type, userId: event.userId } : {}),
                runId,
                eventType: event.eventType,
                progressText: "Progress update (content too large for display)",
                timestamp: event.timestamp ?? new Date().toISOString(),
                _oversizedDropped: true,
              },
            });
            return;
          }

          if (DEBUG_SSE_EVENTS) {
            console.log("[SSE] Event telemetry", {
              eventType: event.eventType,
              byteLength: sendResult.byteLength,
              serializeDurationMs: sendResult.serializeDurationMs,
              enqueueDurationMs: sendResult.enqueueDurationMs,
              msSinceLastSuccessfulSend: Date.now() - lastSuccessfulSendAt,
            });
          }
        } catch (err) {
          console.error("[SSE] Failed to send task event:", err);
        }
      };

      cleanup = taskRegistry.subscribeForUser(userId, {
        onStarted: handleEvent,
        onCompleted: handleEvent,
        onProgress: handleEvent,
      });

      heartbeatInterval = setInterval(() => {
        try {
          const now = Date.now();
          const expectedAt = lastHeartbeatScheduledAt + HEARTBEAT_INTERVAL_MS;
          const heartbeatSkewMs = now - expectedAt;
          lastHeartbeatScheduledAt = now;

          sendDataMessage({
            type: "heartbeat",
            timestamp: nowISO(),
          });

          if (DEBUG_SSE_EVENTS) {
            console.log("[SSE] Heartbeat telemetry", {
              heartbeatSkewMs,
              msSinceLastSuccessfulSend: Date.now() - lastSuccessfulSendAt,
            });
          }
        } catch {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, HEARTBEAT_INTERVAL_MS);

      onAbort = () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    },

    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (onAbort) {
        request.signal.removeEventListener("abort", onAbort);
        onAbort = null;
      }
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
