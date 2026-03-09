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
 */

import type { IncomingMessage } from "http";
import type WsWebSocket from "ws";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require("ws") as typeof WsWebSocket;

const WS_BETA_HEADER = "responses_websockets=2026-02-06";

// ── Module state ────────────────────────────────────────────────────────────

/** Sticky-routing token captured from the WebSocket upgrade response. */
let wsTurnState: string | null = null;

/** Once set to true, all future requests skip WebSocket and use HTTP SSE. */
let wsDisabled = false;

// ── Public helpers ──────────────────────────────────────────────────────────

export function isWebSocketDisabled(): boolean {
  return wsDisabled;
}

export function getWsTurnState(): string | null {
  return wsTurnState;
}

// ── Core transport ──────────────────────────────────────────────────────────

/**
 * Open a WebSocket connection to the Codex Responses API, send the request,
 * and return a synthetic `Response` whose body is an SSE-formatted
 * `ReadableStream`.  The caller can pass this directly to the AI SDK as if
 * it were a normal HTTP streaming response.
 */
export async function sendViaWebSocket(
  httpUrl: string,
  requestBody: Record<string, unknown>,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const wsUrl = httpUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");

  // ── Handshake headers (match official CLI) ────────────────────────────
  const wsHeaders: Record<string, string> = { ...headers };
  wsHeaders["OpenAI-Beta"] = WS_BETA_HEADER;

  // Replay sticky routing token if we have one
  if (wsTurnState) {
    wsHeaders["x-codex-turn-state"] = wsTurnState;
  }

  // Drop HTTP-only headers that don't belong in a WebSocket handshake
  delete wsHeaders["Content-Type"];
  delete wsHeaders["Accept"];

  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const ws = new WebSocket(wsUrl, { headers: wsHeaders });
    let resolved = false;

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
      const turnState = response.headers["x-codex-turn-state"];
      if (turnState && typeof turnState === "string") {
        wsTurnState = turnState;
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

      // Bridge WebSocket messages → SSE ReadableStream
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const cleanup = () => {
            ws.removeListener("message", onMessage);
            ws.removeListener("close", onClose);
            ws.removeListener("error", onStreamError);
            signal?.removeEventListener("abort", onAbort);
          };

          const onMessage = (data: WsWebSocket.Data) => {
            const text = data.toString();

            try {
              const event = JSON.parse(text) as { type?: string; error?: { message?: string }; status?: number; status_code?: number };
              const eventType = event.type || "";

              // Handle WebSocket-specific error events
              if (eventType === "error") {
                const errorMsg = event.error?.message || "Unknown WebSocket error";
                const status = event.status || event.status_code;
                console.error(`[Codex WS] Error event: ${status} — ${errorMsg}`);
                cleanup();
                try { controller.error(new Error(errorMsg)); } catch {}
                ws.close();
                return;
              }

              // Convert to SSE format: event: {type}\ndata: {json}\n\n
              const sseLine = `event: ${eventType}\ndata: ${text}\n\n`;
              controller.enqueue(encoder.encode(sseLine));

              // Stream terminates on completion events
              if (
                eventType === "response.completed" ||
                eventType === "response.done"
              ) {
                cleanup();
                try { controller.close(); } catch {}
                ws.close();
              }

              if (
                eventType === "response.failed" ||
                eventType === "response.incomplete"
              ) {
                cleanup();
                try { controller.close(); } catch {}
                ws.close();
              }
            } catch {
              // Non-JSON message — forward as raw SSE data line
              const sseLine = `data: ${text}\n\n`;
              controller.enqueue(encoder.encode(sseLine));
            }
          };

          const onClose = () => {
            cleanup();
            try { controller.close(); } catch {}
          };

          const onStreamError = (err: Error) => {
            cleanup();
            try { controller.error(err); } catch {}
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

      // Resolve with synthetic HTTP Response wrapping the SSE stream
      resolved = true;
      resolve(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    });

    // ── Connection error (before open) ───────────────────────────────
    ws.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      if (!resolved) {
        resolved = true;
        console.warn("[Codex WS] Connection error, falling back to HTTP:", err.message);
        reject(err);
      }
    });

    // ── Non-101 response (server rejected upgrade) ───────────────────
    ws.on("unexpected-response", (_req: unknown, res: IncomingMessage) => {
      signal?.removeEventListener("abort", onAbort);
      const status = res.statusCode || 0;

      // Capture turn-state even on failure
      const turnState = res.headers["x-codex-turn-state"];
      if (turnState && typeof turnState === "string") {
        wsTurnState = turnState;
      }

      if (status === 426) {
        // Server explicitly says "use HTTP" — disable WS for this process
        wsDisabled = true;
        console.warn("[Codex WS] Server returned 426 — disabling WebSocket, falling back to HTTP");
      }

      if (!resolved) {
        resolved = true;
        reject(new Error(`WebSocket handshake failed: ${status}`));
      }

      ws.close();
    });
  });
}
