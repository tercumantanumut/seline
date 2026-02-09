/**
 * Session Model Resolver
 *
 * Resolves which model to use for a given session by checking
 * session-level overrides in metadata before falling back to
 * global settings from settings-manager.ts.
 *
 * This enables per-session model assignment:
 *   Session A → Claude Sonnet 4.5 (Anthropic)
 *   Session B → GPT-5.1 Codex (Codex)
 *   Session C → (no override) → uses global settings
 */

import type { LanguageModel } from "ai";
import type { SessionModelConfig } from "@/components/model-bag/model-bag.types";
import { loadSettings, type AppSettings } from "@/lib/settings/settings-manager";
import {
  getLanguageModel,
  getModelByName,
  getChatModel,
  getResearchModel,
  getVisionModel,
  getUtilityModel,
  getConfiguredProvider,
  type LLMProvider,
} from "@/lib/ai/providers";

// ---------------------------------------------------------------------------
// Session metadata keys for model overrides
// ---------------------------------------------------------------------------

const SESSION_MODEL_KEYS = {
  provider: "sessionProvider",
  chat: "sessionChatModel",
  research: "sessionResearchModel",
  vision: "sessionVisionModel",
  utility: "sessionUtilityModel",
} as const;

// ---------------------------------------------------------------------------
// Extract session model config from metadata
// ---------------------------------------------------------------------------

/**
 * Extract SessionModelConfig from session metadata.
 * Returns null if no overrides are present.
 */
export function extractSessionModelConfig(
  metadata: Record<string, unknown> | null | undefined,
): SessionModelConfig | null {
  if (!metadata) return null;

  const config: SessionModelConfig = {};
  let hasOverride = false;

  if (typeof metadata[SESSION_MODEL_KEYS.provider] === "string" && metadata[SESSION_MODEL_KEYS.provider]) {
    config.sessionProvider = metadata[SESSION_MODEL_KEYS.provider] as LLMProvider;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.chat] === "string" && metadata[SESSION_MODEL_KEYS.chat]) {
    config.sessionChatModel = metadata[SESSION_MODEL_KEYS.chat] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.research] === "string" && metadata[SESSION_MODEL_KEYS.research]) {
    config.sessionResearchModel = metadata[SESSION_MODEL_KEYS.research] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.vision] === "string" && metadata[SESSION_MODEL_KEYS.vision]) {
    config.sessionVisionModel = metadata[SESSION_MODEL_KEYS.vision] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.utility] === "string" && metadata[SESSION_MODEL_KEYS.utility]) {
    config.sessionUtilityModel = metadata[SESSION_MODEL_KEYS.utility] as string;
    hasOverride = true;
  }

  return hasOverride ? config : null;
}

// ---------------------------------------------------------------------------
// Resolve model for a session (with fallback to global)
// ---------------------------------------------------------------------------

/**
 * Resolve the chat model for a session.
 *
 * Priority:
 *   1. sessionMetadata.sessionChatModel (per-session override)
 *   2. Global chatModel from settings-manager.ts
 *   3. Provider default
 */
export function resolveSessionChatModel(
  sessionMetadata: Record<string, unknown> | null | undefined,
): LanguageModel {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionChatModel) {
    // No session override — use global
    return getChatModel();
  }

  const modelId = config.sessionChatModel;
  console.log(`[SESSION-RESOLVER] Using session chat model override: ${modelId}`);

  try {
    return getModelByName(modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session model "${modelId}", falling back to global:`, error);
    return getChatModel();
  }
}

/**
 * Resolve the primary language model for a session's streamText call.
 * This is the main entry point used by app/api/chat/route.ts.
 *
 * If the session has a model override, it returns that model.
 * Otherwise it returns getLanguageModel() (current behavior).
 */
export function resolveSessionLanguageModel(
  sessionMetadata: Record<string, unknown> | null | undefined,
): LanguageModel {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionChatModel) {
    return getLanguageModel();
  }

  const modelId = config.sessionChatModel;
  console.log(`[SESSION-RESOLVER] Using session language model override: ${modelId}`);

  try {
    return getModelByName(modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session model "${modelId}", falling back to global:`, error);
    return getLanguageModel();
  }
}

/**
 * Resolve the research model for a session.
 */
export function resolveSessionResearchModel(
  sessionMetadata: Record<string, unknown> | null | undefined,
): LanguageModel {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionResearchModel) {
    return getResearchModel();
  }

  const modelId = config.sessionResearchModel;
  console.log(`[SESSION-RESOLVER] Using session research model override: ${modelId}`);

  try {
    return getModelByName(modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session research model "${modelId}", falling back to global:`, error);
    return getResearchModel();
  }
}

/**
 * Resolve the vision model for a session.
 */
export function resolveSessionVisionModel(
  sessionMetadata: Record<string, unknown> | null | undefined,
): LanguageModel {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionVisionModel) {
    return getVisionModel();
  }

  const modelId = config.sessionVisionModel;
  console.log(`[SESSION-RESOLVER] Using session vision model override: ${modelId}`);

  try {
    return getModelByName(modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session vision model "${modelId}", falling back to global:`, error);
    return getVisionModel();
  }
}

/**
 * Resolve the utility model for a session.
 */
export function resolveSessionUtilityModel(
  sessionMetadata: Record<string, unknown> | null | undefined,
): LanguageModel {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionUtilityModel) {
    return getUtilityModel();
  }

  const modelId = config.sessionUtilityModel;
  console.log(`[SESSION-RESOLVER] Using session utility model override: ${modelId}`);

  try {
    return getModelByName(modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session utility model "${modelId}", falling back to global:`, error);
    return getUtilityModel();
  }
}

/**
 * Build the session model config object to store in session.metadata.
 * Only includes non-empty values.
 */
export function buildSessionModelMetadata(
  config: SessionModelConfig,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (config.sessionProvider) result[SESSION_MODEL_KEYS.provider] = config.sessionProvider;
  if (config.sessionChatModel) result[SESSION_MODEL_KEYS.chat] = config.sessionChatModel;
  if (config.sessionResearchModel) result[SESSION_MODEL_KEYS.research] = config.sessionResearchModel;
  if (config.sessionVisionModel) result[SESSION_MODEL_KEYS.vision] = config.sessionVisionModel;
  if (config.sessionUtilityModel) result[SESSION_MODEL_KEYS.utility] = config.sessionUtilityModel;
  return result;
}

/**
 * Clear all session model overrides from metadata.
 * Returns a new metadata object with session model keys removed.
 */
export function clearSessionModelMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...metadata };
  for (const key of Object.values(SESSION_MODEL_KEYS)) {
    delete result[key];
  }
  return result;
}
