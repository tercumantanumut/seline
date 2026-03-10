/**
 * WebSocket transport for the Codex Responses API.
 *
 * Matches the official Codex CLI (codex-rs) behaviour:
 * - Connects via `wss://` with `OpenAI-Beta: responses_websockets=2026-02-06`
 * - Sends the request body as a single JSON text message wrapped in `response.create`
 * - Receives individual JSON text messages and bridges them to SSE format
 *   so the AI SDK's OpenAI provider can consume them transparently.
 * - Captures `x-codex-turn-state` from the HTTP 101 upgrade for sticky routing.
 * - Falls back to HTTP SSE when the server returns 426 (Upgrade Required).
 *
 * Key architectural decisions vs. the previous version:
 *
 *   1. **Wait for first data before resolving.**
 *      The previous version resolved the Promise as soon as `ws.on("open")`
 *      fired. That meant errors that occurred *after* the handshake but
 *      *before* any data (or during streaming) could not be caught by the
 *      caller's try/catch — they only surfaced as stream errors that
 *      Next.js logged as "failed to pipe response".
 *
 *      Now we resolve only after the first `message` event arrives, giving
 *      the caller a much stronger guarantee that the stream will succeed.
 *
 *   2. **onStreamError callback.**
 *      Errors that happen *after* the stream has been resolved are
 *      inherently uncatchable by the caller. Instead of silently eating
 *      them, we invoke an optional `onStreamError` callback so the
 *      provider layer can update session state (disable WS, record
 *      turn-state, etc.) even though the Response has already been
 *      returned.
 *
 *   3. **Structured error type.**
 *      `WsTransportError` carries the `turnState` captured during the
 *      connection, so the caller can recover routing state even when the
 *      handshake is rejected.
 */

import type { IncomingMessage } from "http";
import type WsWebSocket from "ws";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require("ws") as typeof WsWebSocket;

const WS_BETA_HEADER = "responses_websockets=2026-02-06";

/**
 * Event types that indicate the model is actually producing output.
 * We only resolve the sendViaWebSocket promise after seeing one of these,
 * so that early errors (like server_error at sequence_number=2) still
 * land in the caller's try/catch and can be retried.
 *
 * Metadata events (response.created, response.in_progress) are enqueued
 * into the stream but don't trigger resolution.
 */
const CONTENT_BEARING_EVENTS = new Set([
  "response.output_item.added",
  "response.content_part.added",
  "response.output_text.delta",
  "response.content_part.delta",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
  "response.output_text.done",
  "response.audio.delta",
  "response.audio.done",
  "response.output_item.done",
  // Completion/terminal events also trigger resolution — the model processed
  // the request even if the response is short or failed.
  "response.completed",
  "response.done",
  "response.failed",
  "response.incomplete",
]);

// ── Types ───────────────────────────────────────────────────────────────────

export interface WsResult {
  response: Response;
  /** Updated sticky-routing token (may be null if server didn't send one). */
  turnState: string | null;
}

/**
 * Error thrown when the WS transport fails.
 * Carries the captured turn-state so the caller can persist it.
 */
export class WsTransportError extends Error {
  /** HTTP status from a rejected upgrade (0 if not applicable). */
  public readonly statusCode: number;
  /** Turn-state captured before the error occurred. */
  public readonly turnState: string | null;

  constructor(message: string, statusCode: number, turnState: string | null) {
    super(message);
    this.name = "WsTransportError";
    this.statusCode = statusCode;
    this.turnState = turnState;
  }
}

export interface WsSendOptions {
  /** Caller-owned turn state from a previous call (isolated per session). */
  turnState?: string | null;
  /**
   * Callback invoked when the stream errors AFTER the Response has been
   * resolved. The caller cannot catch this via try/catch — this callback
   * is the only way to react (e.g., disable WS for the session).
   */
  onStreamError?: (error: Error, turnState: string | null) => void;
  /**
   * Callback invoked when the stream completes successfully.
   * Receives the final turn-state.
   */
  onStreamComplete?: (turnState: string | null) => void;
}

// ── Core transport ──────────────────────────────────────────────────────────

/**
 * Open a WebSocket connection to the Codex Responses API, send the request,
 * and return a synthetic `Response` whose body is an SSE-formatted
 * `ReadableStream`.  The caller can pass this directly to the AI SDK as if
 * it were a normal HTTP streaming response.
 *
 * **Resolution contract**: The returned Promise resolves only after the
 * first message event is received from the WebSocket, ensuring the
 * connection is functional and the server is producing data.
 */
export async function sendViaWebSocket(
  httpUrl: string,
  requestBody: Record<string, unknown>,
  headers: Record<string, string>,
  signal?: AbortSignal,
  opts: WsSendOptions = {},
): Promise<WsResult> {
  const wsUrl = httpUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");

  // ── Handshake headers (match official CLI) ────────────────────────────
  const wsHeaders: Record<string, string> = { ...headers };
  wsHeaders["OpenAI-Beta"] = WS_BETA_HEADER;

  // Replay caller-owned sticky routing token
  if (opts.turnState) {
    wsHeaders["x-codex-turn-state"] = opts.turnState;
  }

  // Drop HTTP-only headers that don't belong in a WebSocket handshake
  delete wsHeaders["Content-Type"];
  delete wsHeaders["Accept"];

  // Track turn state captured during this connection's lifetime
  let capturedTurnState: string | null = opts.turnState ?? null;

  return new Promise<WsResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const ws = new WebSocket(wsUrl, { headers: wsHeaders });
    let resolved = false;
    let requestSent = false;

    // ── Abort handling ────────────────────────────────────────────────
    const onAbort = () => {
      ws.close();
      if (!resolved) {
        resolved = true;
        reject(new DOMException("Aborted", "AbortError"));
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    // ── Capture turn-state from the HTTP 101 upgrade response ────────
    ws.on("upgrade", (response: IncomingMessage) => {
      const ts = response.headers["x-codex-turn-state"];
      if (ts && typeof ts === "string") {
        capturedTurnState = ts;
      }
    });

    // ── Connection opened ────────────────────────────────────────────
    ws.on("open", () => {
      // Send request wrapped as response.create (matches codex-rs)
      const wsRequest = {
        type: "response.create",
        ...requestBody,
      };
      ws.send(JSON.stringify(wsRequest));
      requestSent = true;
      // NOTE: We do NOT resolve here. We wait for the first message.
    });

    // ── Bridge WebSocket messages → SSE ReadableStream ───────────────
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;

        const cleanup = () => {
          ws.removeListener("message", onMessage);
          ws.removeListener("close", onClose);
          ws.removeListener("error", onStreamError);
          signal?.removeEventListener("abort", onAbort);
        };

        const onMessage = (data: WsWebSocket.Data) => {
          const text = data.toString();

          try {
            const event = JSON.parse(text) as {
              type?: string;
              error?: { message?: string };
              status?: number;
              status_code?: number;
            };
            const eventType = event.type || "";

            // Handle WebSocket-specific error events
            if (eventType === "error") {
              const errorMsg = event.error?.message || "Unknown WebSocket error";
              const status = event.status || event.status_code;
              console.error(`[Codex WS] Error event: ${status} — ${errorMsg}`);
              cleanup();

              if (!resolved) {
                // Error before content started — reject so the caller's
                // try/catch can handle retry / fallback to HTTP.
                resolved = true;
                // Clean up the unconsumed stream
                try { controller.close(); } catch {}
                reject(new WsTransportError(
                  `WebSocket error event: ${status} — ${errorMsg}`,
                  typeof status === "number" ? status : 0,
                  capturedTurnState,
                ));
              } else {
                // Error after stream was returned — notify via callback
                // because the caller's try/catch is long gone.
                try { controller.error(new Error(errorMsg)); } catch {}
                opts.onStreamError?.(new Error(errorMsg), capturedTurnState);
              }
              ws.close();
              return;
            }

            // Convert to SSE format: event: {type}\ndata: {json}\n\n
            const sseLine = `event: ${eventType}\ndata: ${text}\n\n`;
            controller.enqueue(encoder.encode(sseLine));

            // ── Resolve only on content-bearing events ────────────
            // Metadata events (response.created, response.in_progress)
            // are enqueued but don't trigger resolution. This lets
            // early server_error events (before content) be caught
            // by the caller's try/catch and retried.
            if (!resolved && CONTENT_BEARING_EVENTS.has(eventType)) {
              resolved = true;
              resolve({
                response: new Response(stream, {
                  status: 200,
                  headers: { "Content-Type": "text/event-stream" },
                }),
                turnState: capturedTurnState,
              });
            }

            // Stream terminates on completion events
            if (
              eventType === "response.completed" ||
              eventType === "response.done"
            ) {
              cleanup();
              try { controller.close(); } catch {}
              opts.onStreamComplete?.(capturedTurnState);
              ws.close();
            }

            if (
              eventType === "response.failed" ||
              eventType === "response.incomplete"
            ) {
              cleanup();
              try { controller.close(); } catch {}
              // These are "completed with issues" — still notify via
              // complete callback so turn state is persisted.
              opts.onStreamComplete?.(capturedTurnState);
              ws.close();
            }
          } catch {
            // Non-JSON message — forward as raw SSE data line
            const sseLine = `data: ${text}\n\n`;
            controller.enqueue(encoder.encode(sseLine));

            // Even non-JSON counts as first data
            if (!resolved) {
              resolved = true;
              resolve({
                response: new Response(stream, {
                  status: 200,
                  headers: { "Content-Type": "text/event-stream" },
                }),
                turnState: capturedTurnState,
              });
            }
          }
        };

        const onClose = () => {
          cleanup();
          if (!resolved) {
            // WS closed before content started — reject so caller can retry/fallback
            resolved = true;
            try { controller.close(); } catch {}
            reject(new WsTransportError(
              "WebSocket closed before content-bearing data was received",
              0,
              capturedTurnState,
            ));
          } else {
            try { controller.close(); } catch {}
          }
        };

        const onStreamError = (err: Error) => {
          cleanup();
          if (!resolved) {
            resolved = true;
            try { controller.close(); } catch {}
            reject(new WsTransportError(
              err.message,
              0,
              capturedTurnState,
            ));
          } else {
            try { controller.error(err); } catch {}
            opts.onStreamError?.(err, capturedTurnState);
          }
        };

        ws.on("message", onMessage);
        ws.on("close", onClose);
        ws.on("error", onStreamError);
      },

      cancel() {
        signal?.removeEventListener("abort", onAbort);
        ws.close();
      },
    });

    // ── Connection error (before open) ───────────────────────────────
    ws.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      if (!resolved) {
        resolved = true;
        console.warn("[Codex WS] Connection error, falling back to HTTP:", err.message);
        reject(new WsTransportError(err.message, 0, capturedTurnState));
      }
    });

    // ── Non-101 response (server rejected upgrade) ───────────────────
    ws.on("unexpected-response", (_req: unknown, res: IncomingMessage) => {
      signal?.removeEventListener("abort", onAbort);
      const status = res.statusCode || 0;

      // Capture turn-state even on failure
      const ts = res.headers["x-codex-turn-state"];
      if (ts && typeof ts === "string") {
        capturedTurnState = ts;
      }

      if (!resolved) {
        resolved = true;
        reject(new WsTransportError(
          `WebSocket handshake failed: ${status}`,
          status,
          capturedTurnState,
        ));
      }

      ws.close();
    });
  });
}
