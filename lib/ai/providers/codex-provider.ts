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

const DUMMY_API_KEY = "chatgpt-oauth";
const CODEX_MAX_RETRY_ATTEMPTS = 5;

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

function createCodexHeaders(
  init: RequestInit | undefined,
  accountId: string,
  accessToken: string,
  opts?: { promptCacheKey?: string },
): Headers {
  const headers = new Headers(init?.headers ?? {});
  headers.delete("x-api-key");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("chatgpt-account-id", accountId);
  headers.set("OpenAI-Beta", CODEX_CONFIG.HEADERS["OpenAI-Beta"]);
  headers.set("originator", CODEX_CONFIG.HEADERS.originator);
  headers.set("Accept", "text/event-stream");

  if (opts?.promptCacheKey) {
    headers.set("conversation_id", opts.promptCacheKey);
    headers.set("session_id", opts.promptCacheKey);
  } else {
    headers.delete("conversation_id");
    headers.delete("session_id");
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

    let originalStream = true;
    let promptCacheKey: string | undefined;
    let updatedInit = init;

    if (init?.body) {
      const bodyText = await readRequestBody(init.body);
      const parsed = JSON.parse(bodyText) as Record<string, any>;
      originalStream = parsed.stream === true;
      promptCacheKey = typeof parsed.prompt_cache_key === "string" ? parsed.prompt_cache_key : undefined;

      const codexInstructions = await getCodexInstructions(parsed.model);
      const transformed = await transformCodexRequest(parsed, codexInstructions);

      updatedInit = {
        ...init,
        body: JSON.stringify(transformed),
      };
    }

    const headers = createCodexHeaders(updatedInit, accountId, accessToken, { promptCacheKey });
    headers.set("Content-Type", "application/json");

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
          });
          await sleepWithAbort(delay, init?.signal ?? undefined);
          continue;
        }
        return effectiveResponse;
      }

      if (!originalStream) {
        const responseHeaders = ensureContentType(effectiveResponse.headers);
        return await convertSseToJson(effectiveResponse, responseHeaders);
      }

      return effectiveResponse;
    }
  };
}

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
