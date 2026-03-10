import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  CODEX_CONFIG,
  decodeCodexJWT,
  ensureValidCodexToken,
  getCodexAccessToken,
} from "@/lib/auth/codex-auth";
import { getCodexInstructions } from "@/lib/auth/codex-instructions";
import { transformCodexRequest } from "@/lib/auth/codex-request";
import { convertSseToJson, ensureContentType } from "@/lib/auth/codex-response";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";
import { sendViaWebSocket, WsTransportError } from "./codex-websocket";
import {
  resolveSessionId,
  getSessionState,
  setTurnState,
  isWsEnabled,
  disableWs,
  WS_DISABLED_COOLDOWN_MS,
} from "./codex-session-store";
import { tryAcquireWs, releaseWs, type WsTicket } from "./codex-ws-gate";

const DUMMY_API_KEY = "chatgpt-oauth";
const CODEX_MAX_RETRY_ATTEMPTS = 5;
const CODEX_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function rewriteCodexUrl(url: string): string {
  if (url.includes(CODEX_CONFIG.API_PATH)) {
    return url;
  }
  return url.replace("/responses", CODEX_CONFIG.API_PATH);
}

async function readRequestBody(body: BodyInit): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return new TextDecoder().decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (typeof (body as Blob).text === "function") {
    return await (body as Blob).text();
  }

  throw new Error("Unsupported request body type for Codex request");
}

function getCodexUserAgent(): string {
  const platform = process.platform === "darwin" ? "Mac OS" : process.platform === "win32" ? "Windows" : "Linux";
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  return `codex_cli_rs/0.1.0 (${platform}; ${arch})`;
}

function createCodexHeaders(
  init: RequestInit | undefined,
  accountId: string,
  accessToken: string,
  opts?: { promptCacheKey?: string; turnState?: string | null },
): Headers {
  const headers = new Headers(init?.headers ?? {});
  headers.delete("x-api-key");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("ChatGPT-Account-ID", accountId);
  headers.set("originator", CODEX_CONFIG.HEADERS.originator);
  headers.set("User-Agent", getCodexUserAgent());
  headers.set("Accept", "text/event-stream");

  if (opts?.promptCacheKey) {
    headers.set("session_id", opts.promptCacheKey);
  } else {
    headers.delete("session_id");
  }

  // Sticky routing: replay the caller-owned turn-state token
  if (opts?.turnState) {
    headers.set("x-codex-turn-state", opts.turnState);
  }

  return headers;
}

async function mapUsageLimit404(response: Response): Promise<Response | null> {
  if (response.status !== 404) return null;

  const clone = response.clone();
  let text = "";
  try {
    text = await clone.text();
  } catch {
    text = "";
  }
  if (!text) return null;

  let code = "";
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; type?: string } };
    code = (parsed?.error?.code ?? parsed?.error?.type ?? "").toString();
  } catch {
    code = "";
  }

  const haystack = `${code} ${text}`.toLowerCase();
  if (!/usage_limit_reached|usage_not_included|rate_limit_exceeded|usage limit/i.test(haystack)) {
    return null;
  }

  const headers = new Headers(response.headers);
  return new Response(response.body, {
    status: 429,
    statusText: "Too Many Requests",
    headers,
  });
}

async function readErrorPreview(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
}

/**
 * Wrap a ReadableStream body with an inactivity timeout.
 * If no data arrives for CODEX_INACTIVITY_TIMEOUT_MS, the stream is aborted.
 */
function wrapWithInactivityTimeout(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        inactivityTimer = setTimeout(() => {
          console.warn("[Codex] Inactivity timeout — no data for", CODEX_INACTIVITY_TIMEOUT_MS / 1000, "seconds");
          controller.error(new Error(`Codex stream inactivity timeout (${CODEX_INACTIVITY_TIMEOUT_MS / 1000}s) — no first chunk`));
        }, CODEX_INACTIVITY_TIMEOUT_MS);
      },
      transform(chunk, controller) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          console.warn("[Codex] Inactivity timeout — no data for", CODEX_INACTIVITY_TIMEOUT_MS / 1000, "seconds");
          controller.error(new Error(`Codex stream inactivity timeout (${CODEX_INACTIVITY_TIMEOUT_MS / 1000}s)`));
        }, CODEX_INACTIVITY_TIMEOUT_MS);
        controller.enqueue(chunk);
      },
      flush() {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      },
    }),
  );
}

// ── Early SSE error detection ────────────────────────────────────────────────

/**
 * Content-bearing SSE event types — same set used by the WS transport.
 * When we see one of these, we know the model is producing output.
 */
const SSE_CONTENT_EVENTS = new Set([
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
  "response.completed",
  "response.done",
  "response.failed",
  "response.incomplete",
]);

const EARLY_ERROR_MAX_BUFFER_BYTES = 64 * 1024; // 64 KB
const EARLY_ERROR_MAX_WAIT_MS = 10_000; // 10 seconds

/**
 * Buffer SSE events from the HTTP response body until a content-bearing
 * event or a retryable server_error is detected.
 *
 * - If an early `server_error` arrives before content: throws so the
 *   retry loop in createCodexFetch can retry the entire request.
 * - If a content-bearing event arrives first: returns a reconstructed
 *   stream that replays buffered chunks then continues from the original.
 * - Safety limits: stops buffering after 64 KB or 10 seconds.
 */
async function awaitFirstContentOrError(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();
  const bufferedChunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let sseText = "";
  const startTime = Date.now();

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // Safety limits — stop buffering, return what we have
      if (totalBytes > EARLY_ERROR_MAX_BUFFER_BYTES || Date.now() - startTime > EARLY_ERROR_MAX_WAIT_MS) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      bufferedChunks.push(value);
      totalBytes += value.byteLength;
      sseText += decoder.decode(value, { stream: true });

      // Scan for data: lines in the accumulated SSE text
      const lines = sseText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(trimmed.indexOf(":") + 1).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const event = JSON.parse(jsonStr) as {
            type?: string;
            error?: { type?: string; message?: string };
          };

          // Early server_error before content — throw for retry
          if (event.type === "error" && event.error?.type === "server_error") {
            try { reader.cancel(); } catch {}
            throw new Error(
              `Codex server_error (retryable): ${event.error.message || "server_error"}`
            );
          }

          // Content-bearing event — stop buffering, content is flowing
          if (event.type && SSE_CONTENT_EVENTS.has(event.type)) {
            return buildReplayStream(bufferedChunks, reader);
          }
        } catch (e) {
          // Re-throw our own errors
          if (e instanceof Error && e.message.includes("server_error")) throw e;
          // JSON parse failure on partial data — continue buffering
        }
      }
    }
  } catch (error) {
    try { reader.cancel(); } catch {}
    throw error;
  }

  // No error and no content detected (or hit safety limit)
  // Return buffered + remaining stream
  return buildReplayStream(bufferedChunks, reader);
}

/**
 * Create a ReadableStream that first replays buffered chunks,
 * then continues reading from the original reader.
 */
function buildReplayStream(
  buffered: Uint8Array[],
  reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (idx < buffered.length) {
        controller.enqueue(buffered[idx++]);
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    },
  });
}

// ── Fetch factory ───────────────────────────────────────────────────────────

/**
 * Create the custom fetch function for the Codex provider.
 *
 * State management:
 *   - Per-session state (turnState, wsDisabledUntil) is read from the
 *     CodexSessionStore, keyed by sessionId from the observability
 *     run context (AsyncLocalStorage). This means state persists across
 *     turns in the same chat session but is fully isolated between sessions.
 *
 *   - WS concurrency is controlled by the CodexWsGate, which limits
 *     the number of concurrent WS connections to 1 (or configurable N).
 *     Requests that can't get a WS slot fall back to HTTP immediately.
 *
 *   - Post-open WS errors are handled via the onStreamError callback,
 *     which updates the session store even though the Response has
 *     already been returned to the caller.
 */
function createCodexFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = extractRequestUrl(input);

    if (!url.includes("/responses")) {
      return fetch(input, init);
    }

    const tokenValid = await ensureValidCodexToken();
    if (!tokenValid) {
      throw new Error("Codex authentication required");
    }

    const accessToken = getCodexAccessToken();
    if (!accessToken) {
      throw new Error("Codex access token missing");
    }

    const decoded = decodeCodexJWT(accessToken);
    const accountId = decoded?.accountId;
    if (!accountId) {
      throw new Error("Failed to extract ChatGPT account ID from token");
    }

    // ── Resolve session context ────────────────────────────────────────
    const sessionId = resolveSessionId();
    const sessionState = getSessionState(sessionId);

    let originalStream = true;
    let promptCacheKey: string | undefined;
    let updatedInit = init;

    if (init?.body) {
      const bodyText = await readRequestBody(init.body);
      const parsed = JSON.parse(bodyText) as Record<string, any>;
      originalStream = parsed.stream === true;
      promptCacheKey = typeof parsed.prompt_cache_key === "string" ? parsed.prompt_cache_key : undefined;

      const inputItemCount = Array.isArray(parsed.input) ? parsed.input.length : 0;
      console.log(
        `[CODEX] Request pre-transform: model=${parsed.model}, inputItems=${inputItemCount}, ` +
        `bodySize=${(bodyText.length / 1024).toFixed(1)}KB, session=${sessionId}`
      );

      const codexInstructions = await getCodexInstructions(parsed.model);
      const transformed = await transformCodexRequest(parsed, codexInstructions);

      const transformedBody = JSON.stringify(transformed);
      const transformedItemCount = Array.isArray(transformed.input) ? transformed.input.length : 0;
      console.log(
        `[CODEX] Request post-transform: inputItems=${transformedItemCount}, ` +
        `bodySize=${(transformedBody.length / 1024).toFixed(1)}KB`
      );

      updatedInit = {
        ...init,
        body: transformedBody,
      };
    }

    const headers = createCodexHeaders(updatedInit, accountId, accessToken, {
      promptCacheKey,
      turnState: sessionState.turnState,
    });
    headers.set("Content-Type", "application/json");

    // ── Try WebSocket transport (gated) ─────────────────────────────────
    const wsEnabledForSession = isWsEnabled(sessionId);
    let wsTicket: WsTicket | null = null;

    if (wsEnabledForSession) {
      wsTicket = tryAcquireWs(sessionId);
    }

    if (wsTicket) {
      try {
        const headersObj: Record<string, string> = {};
        headers.forEach((value, key) => { headersObj[key] = value; });

        const wsBody = JSON.parse(updatedInit?.body as string ?? "{}") as Record<string, unknown>;

        console.log(`[Codex] Attempting WebSocket transport (session=${sessionId}, ticket=#${wsTicket.id})`);
        const wsResult = await sendViaWebSocket(
          rewriteCodexUrl(url),
          wsBody,
          headersObj,
          init?.signal ?? undefined,
          {
            turnState: sessionState.turnState,
            onStreamError: (error, turnState) => {
              // This fires AFTER the Response was returned — we can't
              // catch this in try/catch, but we CAN update session state
              // so the next request for this session falls back to HTTP.
              console.warn(
                `[Codex] Post-open WS stream error for session ${sessionId}: ${error.message}`
              );
              disableWs(sessionId);
              if (turnState) setTurnState(sessionId, turnState);
              releaseWs(wsTicket!);
            },
            onStreamComplete: (turnState) => {
              if (turnState) setTurnState(sessionId, turnState);
              releaseWs(wsTicket!);
            },
          },
        );
        console.log(`[Codex] WebSocket transport established (session=${sessionId})`);

        // Update session-scoped turn state from this connection
        if (wsResult.turnState) {
          setTurnState(sessionId, wsResult.turnState);
        }

        // For non-streaming callers (e.g. generateText), convert SSE → JSON
        if (!originalStream) {
          const responseHeaders = ensureContentType(wsResult.response.headers);
          return await convertSseToJson(wsResult.response, responseHeaders);
        }
        return wsResult.response;
      } catch (wsError) {
        // Release the gate slot on failure
        releaseWs(wsTicket);

        // Recover turn-state from structured error
        if (wsError instanceof WsTransportError && wsError.turnState) {
          setTurnState(sessionId, wsError.turnState);
        }

        const msg = wsError instanceof Error ? wsError.message : String(wsError);
        const statusCode = wsError instanceof WsTransportError ? wsError.statusCode : 0;

        // 426 = server says use HTTP. Cool down WS for this session only.
        if (msg.includes("426") || statusCode === 426) {
          disableWs(sessionId);
          console.warn(`[Codex] Server returned 426 — disabling WebSocket for ${WS_DISABLED_COOLDOWN_MS / 1000}s (session=${sessionId})`);
        } else {
          // Any other WS failure: short cooldown to avoid hammering
          disableWs(sessionId, 10_000);
        }

        console.warn(`[Codex] WebSocket failed, falling back to HTTP SSE (session=${sessionId}):`, msg);
        // Fall through to HTTP transport below
      }
    } else if (wsEnabledForSession) {
      console.debug(`[Codex] WS gate full — using HTTP SSE directly (session=${sessionId})`);
    }

    // ── HTTP SSE transport (fallback) ────────────────────────────────────
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(rewriteCodexUrl(url), {
          ...updatedInit,
          method: updatedInit?.method || "POST",
          headers,
        });
      } catch (error) {
        const classification = classifyRecoverability({
          provider: "codex",
          error,
          message: error instanceof Error ? error.message : String(error),
        });
        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CODEX_MAX_RETRY_ATTEMPTS,
          aborted: init?.signal?.aborted ?? false,
        });
        if (!retry) {
          throw error;
        }
        const delay = getBackoffDelayMs(attempt);
        console.log("[Codex] Retrying after transport failure", {
          attempt: attempt + 1,
          reason: classification.reason,
          delayMs: delay,
          outcome: "scheduled",
          sessionId,
        });
        await sleepWithAbort(delay, init?.signal ?? undefined);
        continue;
      }

      const mapped = response.ok ? null : await mapUsageLimit404(response);
      const effectiveResponse = mapped ?? response;
      if (!effectiveResponse.ok) {
        const errorText = await readErrorPreview(effectiveResponse);
        const classification = classifyRecoverability({
          provider: "codex",
          statusCode: effectiveResponse.status,
          message: errorText,
        });
        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CODEX_MAX_RETRY_ATTEMPTS,
          aborted: init?.signal?.aborted ?? false,
        });
        if (retry) {
          const delay = getBackoffDelayMs(attempt);
          console.log("[Codex] Retrying after recoverable HTTP response", {
            attempt: attempt + 1,
            reason: classification.reason,
            delayMs: delay,
            statusCode: effectiveResponse.status,
            outcome: "scheduled",
            sessionId,
          });
          await sleepWithAbort(delay, init?.signal ?? undefined);
          continue;
        }
        if (effectiveResponse.status === 400) {
          console.error("[Codex] Bad Request — response body:", errorText.slice(0, 1000));
        }
        return effectiveResponse;
      }

      // Capture sticky routing token for subsequent requests (session-scoped)
      const newTurnState = effectiveResponse.headers.get("x-codex-turn-state");
      if (newTurnState) {
        setTurnState(sessionId, newTurnState);
      }

      if (!originalStream) {
        const responseHeaders = ensureContentType(effectiveResponse.headers);
        return await convertSseToJson(effectiveResponse, responseHeaders);
      }

      // Buffer early SSE events to detect server_error before content starts.
      // If a retryable error is detected, awaitFirstContentOrError throws
      // and the retry loop below catches it.
      if (effectiveResponse.body) {
        try {
          const contentStream = await awaitFirstContentOrError(
            effectiveResponse.body,
            init?.signal ?? undefined,
          );
          const wrappedBody = wrapWithInactivityTimeout(contentStream);
          return new Response(wrappedBody, {
            status: effectiveResponse.status,
            headers: effectiveResponse.headers,
          });
        } catch (earlyError) {
          // Early server_error detected in the SSE stream — classify and retry
          const classification = classifyRecoverability({
            provider: "codex",
            error: earlyError,
            message: earlyError instanceof Error ? earlyError.message : String(earlyError),
          });
          const retry = shouldRetry({
            classification,
            attempt,
            maxAttempts: CODEX_MAX_RETRY_ATTEMPTS,
            aborted: init?.signal?.aborted ?? false,
          });
          if (retry) {
            const delay = getBackoffDelayMs(attempt);
            console.log("[Codex] Retrying after early SSE stream server_error", {
              attempt: attempt + 1,
              reason: classification.reason,
              delayMs: delay,
              sessionId,
            });
            await sleepWithAbort(delay, init?.signal ?? undefined);
            continue;
          }
          throw earlyError;
        }
      }

      return effectiveResponse;
    }
  };
}

// ── Provider factory ────────────────────────────────────────────────────────

/**
 * Create a Codex provider.
 *
 * The provider can be cached (called once) because all mutable state
 * lives in the CodexSessionStore (keyed by sessionId from run context)
 * and the CodexWsGate (process-global singleton). The fetch function
 * dynamically reads the session context on each invocation.
 */
export function createCodexProvider(): (modelId: string) => LanguageModel {
  const openai = createOpenAI({
    name: "codex",
    baseURL: CODEX_CONFIG.API_BASE_URL,
    apiKey: DUMMY_API_KEY,
    fetch: createCodexFetch(),
  });

  return (modelId: string): LanguageModel => {
    return openai(modelId) as unknown as LanguageModel;
  };
}
