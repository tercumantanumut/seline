/**
 * Antigravity AI Provider
 *
 * Custom provider that uses Google's Generative AI SDK with a custom fetch
 * wrapper to transform requests for the Antigravity API gateway.
 *
 * Antigravity provides free access to models like Claude Sonnet 4.5, Gemini 3, etc.
 * through Google OAuth authentication.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  getAntigravityToken,
  ANTIGRAVITY_CONFIG,
  fetchAntigravityProjectId,
} from "@/lib/auth/antigravity-auth";

// Model aliases - map display names to Antigravity API model IDs
// Verified working 2026-01-05: All models work directly without prefix
const MODEL_ALIASES: Record<string, string> = {
  // Direct model names (already in correct format for API)
  "gemini-3-pro-high": "gemini-3-pro-high",
  "gemini-3-pro-low": "gemini-3-pro-low",
  "gemini-3-flash": "gemini-3-flash",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
  "claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

const ANTIGRAVITY_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

// Generate a unique request ID
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req-${timestamp}-${random}`;
}

function generateSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Get the effective model name for Antigravity API
 */
function resolveModelName(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId;
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

  throw new Error("Unsupported request body type for Antigravity request");
}

/**
 * Check if this is a Google Generative Language API request that should be intercepted
 */
function isGenerativeLanguageRequest(url: string): boolean {
  return url.includes("generativelanguage.googleapis.com") ||
    url.includes("/models/") && url.includes(":generateContent") ||
    url.includes("/models/") && url.includes(":streamGenerateContent");
}

/**
 * Custom fetch wrapper that transforms requests for Antigravity API
 */
function createAntigravityFetch(accessToken: string, projectId: string): typeof fetch {
  const sessionId = generateSessionId();
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof URL ? input.toString() :
      typeof input === "string" ? input : input.url;

    // Check if this is a generative language request we should intercept
    if (!isGenerativeLanguageRequest(url)) {
      // Not a generative language request, pass through
      return fetch(input, init);
    }

    // Extract model and action from URL
    // URL format: .../models/{model}:{action} or generativelanguage.googleapis.com/v1beta/models/{model}:{action}
    const match = url.match(/\/models\/([^:/?]+):(\w+)/);
    if (!match) {
      // Can't parse URL, pass through
      return fetch(input, init);
    }

    const [, rawModel, action] = match;
    const effectiveModel = resolveModelName(rawModel || "");
    const streaming = action === "streamGenerateContent";

    // Build Antigravity endpoint URL
    const baseUrl = ANTIGRAVITY_CONFIG.API_BASE_URL;
    const antigravityUrl = `${baseUrl}/${ANTIGRAVITY_CONFIG.API_VERSION}:${action}${streaming ? "?alt=sse" : ""}`;

    // Parse and transform the request body
    let transformedBody: string | undefined;
    if (init?.body) {
      try {
        const bodyText = await readRequestBody(init.body);
        const parsedBody = JSON.parse(bodyText);

        // For Claude models via Antigravity, we need to inject unique IDs into functionCall/functionResponse parts.
        // The Antigravity backend transforms Google format to Claude format, but Claude API requires 
        // tool_use.id fields that don't exist in Google's functionCall format.
        // We generate unique IDs for each functionCall and match them to corresponding functionResponse parts.
        const isClaudeModel = effectiveModel.includes("claude");
        if (isClaudeModel && parsedBody.contents && Array.isArray(parsedBody.contents)) {
          // Track functionCall IDs by name+index for matching with functionResponse
          // Map structure: functionName -> array of generated IDs (in order of appearance)
          const functionCallIds = new Map<string, string[]>();
          // Track which ID index to use for each function name in responses
          const functionResponseIndex = new Map<string, number>();

          // First pass: inject IDs into all functionCall parts
          for (const content of parsedBody.contents) {
            if (content.parts && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (part.functionCall && typeof part.functionCall === "object") {
                  const funcName = (part.functionCall as Record<string, unknown>).name as string;
                  // Generate a unique ID for this function call
                  const callId = `toolu_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;

                  // Store the ID for later matching with functionResponse
                  if (!functionCallIds.has(funcName)) {
                    functionCallIds.set(funcName, []);
                  }
                  functionCallIds.get(funcName)!.push(callId);

                  // Inject the ID into the functionCall (this is what Antigravity backend needs)
                  (part.functionCall as Record<string, unknown>).id = callId;
                }
              }
            }
          }

          // Second pass: inject matching IDs into functionResponse parts
          for (const content of parsedBody.contents) {
            if (content.parts && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (part.functionResponse && typeof part.functionResponse === "object") {
                  const funcName = (part.functionResponse as Record<string, unknown>).name as string;
                  const ids = functionCallIds.get(funcName);

                  if (ids && ids.length > 0) {
                    // Get the current index for this function name
                    const idx = functionResponseIndex.get(funcName) || 0;
                    if (idx < ids.length) {
                      // Inject the matching ID
                      (part.functionResponse as Record<string, unknown>).id = ids[idx];
                      functionResponseIndex.set(funcName, idx + 1);
                    }
                  }
                }
              }
            }
          }

          console.log(`[Antigravity] Injected tool call IDs for Claude model: ${functionCallIds.size} function types`);
        }

        // Wrap the request in Antigravity's expected format
        const wrappedBody = {
          project: projectId,
          model: effectiveModel,
          userAgent: "antigravity",
          requestId: generateRequestId(),
          request: {
            ...parsedBody,
            sessionId,
          },
        };

        transformedBody = JSON.stringify(wrappedBody);
      } catch (e) {
        console.error("[Antigravity] Failed to transform request body:", e);
        throw e;
      }
    }

    // Build headers
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", streaming ? "text/event-stream" : "application/json");
    headers.set("User-Agent", ANTIGRAVITY_CONFIG.HEADERS["User-Agent"]);
    headers.set("X-Goog-Api-Client", ANTIGRAVITY_CONFIG.HEADERS["X-Goog-Api-Client"]);
    headers.set("Client-Metadata", ANTIGRAVITY_CONFIG.HEADERS["Client-Metadata"]);

    // Remove any API key header (we use OAuth Bearer token)
    headers.delete("x-goog-api-key");

    console.log(`[Antigravity] Request: ${action} for model ${effectiveModel}`);
    console.log(`[Antigravity] URL: ${antigravityUrl}`);

    // Make the request to Antigravity
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const clearTimeoutOnce = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    timeoutId = setTimeout(() => {
      clearTimeoutOnce();
      controller.abort(new Error("Antigravity request timed out"));
    }, ANTIGRAVITY_REQUEST_TIMEOUT_MS);

    const upstreamSignal = init?.signal;
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort(upstreamSignal.reason);
      } else {
        upstreamSignal.addEventListener("abort", () => controller.abort(upstreamSignal.reason), { once: true });
      }
    }

    let response: Response;
    try {
      response = await fetch(antigravityUrl, {
        ...init,
        method: init?.method || "POST",
        headers,
        body: transformedBody,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeoutOnce();
      throw error;
    }

    if (!response.ok) {
      clearTimeoutOnce();
      const errorText = await response.clone().text();
      console.error(`[Antigravity] Error: ${response.status} ${response.statusText}`);
      console.error(`[Antigravity] Response: ${errorText.substring(0, 500)}`);
      return response;
    }

    // For streaming responses, transform SSE data
    if (streaming && response.body) {
      const transformedBody = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(createResponseTransformStream(clearTimeoutOnce))
        .pipeThrough(new TextEncoderStream());

      return new Response(transformedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // For non-streaming, unwrap the response
    const text = await response.text();
    clearTimeoutOnce();
    const unwrappedText = unwrapResponse(text);

    return new Response(unwrappedText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/**
 * Transform SSE stream to unwrap response objects
 */
function createResponseTransformStream(onComplete?: () => void): TransformStream<string, string> {
  let buffer = "";

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          controller.enqueue(line + "\n");
          continue;
        }

        const json = line.slice(5).trim();
        if (!json) {
          controller.enqueue(line + "\n");
          continue;
        }

        try {
          const parsed = JSON.parse(json);
          // Unwrap the response field if present
          const unwrapped = parsed.response !== undefined ? parsed.response : parsed;
          controller.enqueue(`data: ${JSON.stringify(unwrapped)}\n`);
        } catch {
          controller.enqueue(line + "\n");
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        controller.enqueue(buffer);
      }
      onComplete?.();
    },
  });
}

/**
 * Unwrap a non-streaming response
 */
function unwrapResponse(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed.response !== undefined) {
      return JSON.stringify(parsed.response);
    }
    return text;
  } catch {
    return text;
  }
}

/**
 * Create an Antigravity provider instance (async to fetch project ID if needed)
 */
export async function createAntigravityProviderAsync(): Promise<((modelId: string) => LanguageModel) | null> {
  const token = getAntigravityToken();
  if (!token) {
    console.warn("[Antigravity] No token available");
    return null;
  }

  const accessToken = token.access_token;
  let projectId = token.project_id || "";

  // Fetch project ID if missing
  if (!projectId) {
    console.log("[Antigravity] No project_id in token, fetching via loadCodeAssist...");
    const fetchedProjectId = await fetchAntigravityProjectId();
    if (fetchedProjectId) {
      projectId = fetchedProjectId;
    } else {
      console.warn("[Antigravity] Failed to fetch project ID. API calls may fail.");
      console.warn("[Antigravity] Try re-authenticating in Settings > Antigravity.");
    }
  }

  if (projectId) {
    console.log("[Antigravity] Using project:", projectId);
  }

  // Create Google AI provider with custom fetch
  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "", // Not used, we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel - the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}

/**
 * Create an Antigravity provider instance (sync version - uses cached project ID only)
 */
export function createAntigravityProvider(): ((modelId: string) => LanguageModel) | null {
  const token = getAntigravityToken();
  if (!token) {
    console.warn("[Antigravity] No token available");
    return null;
  }

  const accessToken = token.access_token;
  const projectId = token.project_id || "";

  if (!projectId) {
    console.warn("[Antigravity] No project_id in token. Use createAntigravityProviderAsync() to auto-fetch.");
    console.warn("[Antigravity] Or re-authenticate in Settings > Antigravity.");
  } else {
    console.log("[Antigravity] Using project:", projectId);
  }

  // Create Google AI provider with custom fetch
  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "", // Not used, we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel - the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}
