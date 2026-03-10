import { getSession } from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { ContextWindowManager } from "@/lib/context-window";
import { getSessionModelId, getSessionProvider } from "@/lib/ai/session-model-resolver";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 15_000;

type PreflightPayload = {
  ok: boolean;
  httpStatus?: number;
  error?: string;
  details?: string;
  status?: string;
  recovery?: { action?: string; message?: string };
  compactionResult?: {
    success?: boolean;
    tokensFreed?: number;
    messagesCompacted?: number;
  };
  compactionDurationMs?: number;
};

function sseData(payload: PreflightPayload): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseHeartbeat(): Uint8Array {
  return encoder.encode(": heartbeat\n\n");
}

export async function POST(req: Request) {
  const bodyText = await req.text();
  const parsedBody = bodyText ? JSON.parse(bodyText) as { sessionId?: string } : {};
  const headerSessionId = req.headers.get("X-Session-Id") ?? undefined;
  const sessionId = parsedBody.sessionId || headerSessionId;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(sseHeartbeat());
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL_MS);

      const finish = (payload: PreflightPayload) => {
        clearInterval(heartbeat);
        controller.enqueue(sseData(payload));
        controller.close();
      };

      void (async () => {
        try {
          await requireAuth(req);

          if (!sessionId) {
            finish({ ok: true });
            return;
          }

          const session = await getSession(sessionId);
          if (!session) {
            finish({
              ok: false,
              httpStatus: 404,
              error: "Session not found",
            });
            return;
          }

          const sessionMetadata = (session.metadata as Record<string, unknown>) || {};
          const currentModelId = getSessionModelId(sessionMetadata);
          const currentProvider = getSessionProvider(sessionMetadata);
          const contextCheck = await ContextWindowManager.preFlightCheck(
            sessionId,
            currentModelId,
            5000,
            currentProvider,
          );

          if (!contextCheck.canProceed) {
            finish({
              ok: false,
              httpStatus: 413,
              error: "Context window limit exceeded",
              details: ContextWindowManager.getStatusMessage(contextCheck.status),
              status: contextCheck.status.status,
              recovery: contextCheck.recovery,
              compactionResult: contextCheck.compactionResult
                ? {
                    success: contextCheck.compactionResult.success,
                    tokensFreed: contextCheck.compactionResult.tokensFreed,
                    messagesCompacted: contextCheck.compactionResult.messagesCompacted,
                  }
                : undefined,
              compactionDurationMs: contextCheck.compactionDurationMs,
            });
            return;
          }

          finish({
            ok: true,
            status: contextCheck.status.status,
            compactionResult: contextCheck.compactionResult
              ? {
                  success: contextCheck.compactionResult.success,
                  tokensFreed: contextCheck.compactionResult.tokensFreed,
                  messagesCompacted: contextCheck.compactionResult.messagesCompacted,
                }
              : undefined,
            compactionDurationMs: contextCheck.compactionDurationMs,
          });
        } catch (error) {
          finish({
            ok: false,
            httpStatus: 500,
            error: error instanceof Error ? error.message : "Preflight failed",
          });
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
