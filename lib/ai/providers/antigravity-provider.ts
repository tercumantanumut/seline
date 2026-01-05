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

// Generate a unique request ID
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req-${timestamp}-${random}`;
}

// Generate a unique session ID (cached per provider instance)
let sessionId: string | null = null;
function getSessionId(): string {
  if (!sessionId) {
    sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  }
  return sessionId;
}

/**
 * Get the effective model name for Antigravity API
 */
function resolveModelName(modelId: string): string {
  return MODEL_ALIASES[modelId] || modelId;
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
        const bodyText = typeof init.body === "string" ? init.body :
                        init.body instanceof ArrayBuffer ? new TextDecoder().decode(init.body) :
                        String(init.body);
        const parsedBody = JSON.parse(bodyText);

        // Wrap the request in Antigravity's expected format
        const wrappedBody = {
          project: projectId,
          model: effectiveModel,
          userAgent: "antigravity",
          requestId: generateRequestId(),
          request: {
            ...parsedBody,
            sessionId: getSessionId(),
          },
        };

        transformedBody = JSON.stringify(wrappedBody);
      } catch (e) {
        console.error("[Antigravity] Failed to transform request body:", e);
        transformedBody = init.body as string;
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
    const response = await fetch(antigravityUrl, {
      ...init,
      method: init?.method || "POST",
      headers,
      body: transformedBody,
    });

    if (!response.ok) {
      const errorText = await response.clone().text();
      console.error(`[Antigravity] Error: ${response.status} ${response.statusText}`);
      console.error(`[Antigravity] Response: ${errorText.substring(0, 500)}`);
      return response;
    }

    // For streaming responses, transform SSE data
    if (streaming && response.body) {
      const transformedBody = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(createResponseTransformStream())
        .pipeThrough(new TextEncoderStream());

      return new Response(transformedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // For non-streaming, unwrap the response
    const text = await response.text();
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
function createResponseTransformStream(): TransformStream<string, string> {
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

