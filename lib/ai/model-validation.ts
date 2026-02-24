/**
 * Model Validation Utility
 *
 * Shared validation logic for model-provider compatibility.
 * Used by both settings-manager.ts (global defaults) and
 * session-model-resolver.ts (per-session overrides) to ensure
 * a single source of truth for compatibility rules.
 *
 * This replaces the duplicated validation in:
 * - settings-manager.ts  normalizeModelsForProvider()
 * - providers.ts         isModelCompatibleWithProvider() / validateModelForProvider()
 */

import type { LLMProvider } from "@/components/model-bag/model-bag.types";

// ---------------------------------------------------------------------------
// Provider-specific model ID sets (imported dynamically to avoid circular deps)
// ---------------------------------------------------------------------------

// Antigravity uses exact model ID matching to avoid ambiguity with Anthropic's
// "claude-" prefix (Antigravity has short IDs like "claude-sonnet-4-6")
const ANTIGRAVITY_EXACT_MODELS = new Set([
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low",
  "gemini-3-flash",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
]);

// Prefix-based matching for providers with unambiguous model naming
const MODEL_PREFIXES: Record<LLMProvider, string[]> = {
  anthropic: ["claude-"],
  claudecode: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
  codex: ["gpt-5", "codex"],
  kimi: ["kimi-", "moonshot-"],
  antigravity: [], // uses exact match
  ollama: [],      // accepts any model name
  openrouter: [],  // accepts anything
};

// ---------------------------------------------------------------------------
// Core compatibility check
// ---------------------------------------------------------------------------

/**
 * Check if a model is compatible with the given provider.
 *
 * This is the single source of truth for model-provider compatibility,
 * consolidating the logic from both settings-manager.ts and providers.ts.
 *
 * Rules:
 * - Antigravity: exact match only (short IDs overlap with Anthropic prefix)
 * - Anthropic: claude-* prefix, but NOT Antigravity exact models
 * - Claude Code: claude-opus-4*, claude-sonnet-4*, claude-haiku-4* (also accepts Anthropic claude-* models)
 * - Codex: gpt-5*, codex*
 * - Kimi: kimi-*, moonshot-*
 * - Ollama: accepts any model
 * - OpenRouter: accepts anything with "/" or non-provider-specific bare IDs
 */
export function isModelCompatibleWithProvider(
  model: string,
  provider: LLMProvider,
): boolean {
  if (!model) return false;
  const lowerModel = model.toLowerCase().trim();

  // Antigravity uses exact model ID matching
  if (provider === "antigravity") {
    return ANTIGRAVITY_EXACT_MODELS.has(lowerModel);
  }

  // Anthropic: must match claude-* prefix
  if (provider === "anthropic") {
    return MODEL_PREFIXES.anthropic.some((p) => lowerModel.startsWith(p));
  }

  // Claude Code: accepts Claude Code OAuth models + generic claude-* models
  if (provider === "claudecode") {
    // Check Claude Code specific prefixes first, then fall back to generic claude-*
    return (
      MODEL_PREFIXES.claudecode.some((p) => lowerModel.startsWith(p)) ||
      MODEL_PREFIXES.anthropic.some((p) => lowerModel.startsWith(p))
    );
  }

  // Codex: gpt-5*, codex*
  if (provider === "codex") {
    return (
      MODEL_PREFIXES.codex.some((p) => lowerModel.startsWith(p)) ||
      lowerModel.includes("codex")
    );
  }

  // Kimi: kimi-*, moonshot-*
  if (provider === "kimi") {
    return MODEL_PREFIXES.kimi.some((p) => lowerModel.startsWith(p));
  }

  // Ollama: accepts any model name
  if (provider === "ollama") return true;

  // OpenRouter: accepts anything with "/" or non-provider-specific bare IDs
  if (provider === "openrouter") {
    if (lowerModel.includes("/")) return true;
    // Reject bare provider-specific IDs that should go through their own provider
    if (
      ANTIGRAVITY_EXACT_MODELS.has(lowerModel) ||
      MODEL_PREFIXES.codex.some((p) => lowerModel.startsWith(p)) ||
      MODEL_PREFIXES.kimi.some((p) => lowerModel.startsWith(p))
    ) {
      return false;
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface ModelValidationResult {
  valid: boolean;
  /** The validated model ID (same as input if valid) */
  model: string;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validate a model for a given provider.
 * Returns a result object instead of silently clearing the model.
 *
 * Use this at API boundaries (settings PUT, session model-config PUT)
 * to reject incompatible models with a clear error message.
 */
export function validateModelForProvider(
  model: string | null | undefined,
  provider: LLMProvider,
): ModelValidationResult {
  // Empty/null model is valid (means "use default")
  if (!model || model.trim() === "") {
    return { valid: true, model: "" };
  }

  const trimmed = model.trim();

  if (isModelCompatibleWithProvider(trimmed, provider)) {
    return { valid: true, model: trimmed };
  }

  return {
    valid: false,
    model: trimmed,
    error: `Model "${trimmed}" is not compatible with provider "${provider}". ` +
      `Please select a model that belongs to the ${provider} provider.`,
  };
}

// ---------------------------------------------------------------------------
// Batch validation (for settings with multiple model fields)
// ---------------------------------------------------------------------------

export type ModelFieldName = "chatModel" | "researchModel" | "visionModel" | "utilityModel";

export interface BatchValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  /** Fields that were validated successfully (including empty ones) */
  validFields: ModelFieldName[];
}

/**
 * Validate all model fields for a provider at once.
 * Returns aggregated results for use in API error responses.
 */
export function validateAllModelsForProvider(
  models: Partial<Record<ModelFieldName, string | null | undefined>>,
  provider: LLMProvider,
): BatchValidationResult {
  const errors: Record<string, string> = {};
  const validFields: ModelFieldName[] = [];
  const fields: ModelFieldName[] = ["chatModel", "researchModel", "visionModel", "utilityModel"];

  for (const field of fields) {
    const value = models[field];
    if (value === undefined) {
      // Field not being updated, skip
      continue;
    }
    const result = validateModelForProvider(value, provider);
    if (result.valid) {
      validFields.push(field);
    } else {
      errors[field] = result.error!;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    validFields,
  };
}

// ---------------------------------------------------------------------------
// Session model config validation
// ---------------------------------------------------------------------------

/**
 * Validate a session model config.
 * If the config includes a provider override, validates models against that provider.
 * If no provider override, validates against the provided global provider.
 */
export function validateSessionModelConfig(
  config: {
    sessionProvider?: LLMProvider;
    sessionChatModel?: string;
    sessionResearchModel?: string;
    sessionVisionModel?: string;
    sessionUtilityModel?: string;
  },
  globalProvider: LLMProvider,
): BatchValidationResult {
  const effectiveProvider = config.sessionProvider || globalProvider;

  return validateAllModelsForProvider(
    {
      chatModel: config.sessionChatModel,
      researchModel: config.sessionResearchModel,
      visionModel: config.sessionVisionModel,
      utilityModel: config.sessionUtilityModel,
    },
    effectiveProvider,
  );
}
