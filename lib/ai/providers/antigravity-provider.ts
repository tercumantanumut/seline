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
import { createAntigravityFetch } from "./antigravity-streaming";

// Re-export schema utilities so existing imports keep working
export {
  normalizeAntigravityToolSchemas,
  sanitizeSchema,
  isPlainObject,
  DEFAULT_ANTIGRAVITY_INPUT_SCHEMA,
  ANTIGRAVITY_ALLOWED_SCHEMA_KEYS,
} from "./antigravity-schema";

// Re-export streaming utilities so existing imports keep working
export {
  createAntigravityFetch,
  createResponseTransformStreamWithRetry,
  unwrapResponse,
  ensureClaudeFunctionPartIds,
  isGenerativeLanguageRequest,
  generateRequestId,
  generateSessionId,
} from "./antigravity-streaming";

// ---- Model configuration -----------------------------------------------------

// Model aliases - map display names to Antigravity API model IDs
// Verified working 2026-01-05: All models work directly without prefix
const MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-pro-high": "gemini-3.1-pro-high",
  "gemini-3.1-pro-low": "gemini-3.1-pro-low",
  "gemini-3-flash": "gemini-3-flash",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

/**
 * Get the effective model name for Antigravity API.
 * Strips the `antigravity-` prefix if present and applies alias mapping.
 */
function resolveModelName(modelId: string): string {
  // Strip antigravity- prefix if present
  const modelWithoutPrefix = modelId.replace(/^antigravity-/i, "");
  const model = MODEL_ALIASES[modelWithoutPrefix] || modelWithoutPrefix;

  // Antigravity API: gemini-3-pro requires tier suffix (gemini-3-pro-low/high)
  if (model.toLowerCase() === "gemini-3-pro") {
    return "gemini-3.1-pro-low";
  }
  return model;
}

// ---- Provider factories ------------------------------------------------------

/**
 * Create an Antigravity provider instance (async — fetches project ID if needed).
 */
export async function createAntigravityProviderAsync(): Promise<
  ((modelId: string) => LanguageModel) | null
> {
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
    apiKey: "", // Not used — we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId, resolveModelName),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel — the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}

/**
 * Create an Antigravity provider instance (sync — uses cached project ID only).
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
    console.warn(
      "[Antigravity] No project_id in token. Use createAntigravityProviderAsync() to auto-fetch."
    );
    console.warn("[Antigravity] Or re-authenticate in Settings > Antigravity.");
  } else {
    console.log("[Antigravity] Using project:", projectId);
  }

  // Create Google AI provider with custom fetch
  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "", // Not used — we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId, resolveModelName),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel — the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}
