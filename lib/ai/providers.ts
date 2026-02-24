/**
 * LLM Provider Configuration
 *
 * Supports multiple providers:
 * - anthropic: Anthropic Claude models
 * - openrouter: OpenRouter (OpenAI-compatible API with access to many models)
 * - antigravity: Antigravity free models via Google OAuth (Gemini 3, Claude Sonnet 4.5, etc.)
 * - codex: OpenAI Codex models via ChatGPT OAuth
 * - claudecode: Claude models via Claude Pro/MAX OAuth (Claude Code)
 */

import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { loadSettings, invalidateSettingsCache } from "@/lib/settings/settings-manager";
import {
  isAntigravityAuthenticated,
  needsTokenRefresh,
  refreshAntigravityToken,
  getAntigravityToken,
  fetchAntigravityProjectId,
  invalidateAntigravityAuthCache,
} from "@/lib/auth/antigravity-auth";
import { isCodexAuthenticated } from "@/lib/auth/codex-auth";
import { CODEX_MODEL_IDS } from "@/lib/auth/codex-models";
import { KIMI_MODEL_IDS } from "@/lib/auth/kimi-models";
import {
  getClaudeCodeAuthState,
  isClaudeCodeAuthenticated,
  invalidateClaudeCodeAuthCache,
} from "@/lib/auth/claudecode-auth";
import { CLAUDECODE_MODEL_IDS } from "@/lib/auth/claudecode-models";
import { ANTIGRAVITY_CONFIG } from "@/lib/auth/antigravity-auth";
import { createAntigravityProvider } from "@/lib/ai/providers/antigravity-provider";
import { createCodexProvider } from "@/lib/ai/providers/codex-provider";
import { createClaudeCodeProvider } from "@/lib/ai/providers/claudecode-provider";
import {
  isModelCompatibleWithProvider as isModelCompatible,
} from "@/lib/ai/model-validation";
import {
  getOpenRouterClient,
  getOpenRouterApiKey,
  invalidateOpenRouterClient,
} from "@/lib/ai/providers/openrouter-client";
import {
  getKimiClient,
  getKimiApiKey,
  invalidateKimiClient,
} from "@/lib/ai/providers/kimi-client";
import {
  getOllamaClient,
  invalidateOllamaClient,
} from "@/lib/ai/providers/ollama-client";

// Re-export embedding helpers so callers don't need to change their imports
export {
  getEmbeddingModel,
  getEmbeddingModelId,
  type EmbeddingProvider,
} from "@/lib/ai/providers/embedding-provider";

// Re-export client-level helpers that other modules may use directly
export { getOpenRouterApiKey, getOpenRouterClient } from "@/lib/ai/providers/openrouter-client";
export { getKimiApiKey, getKimiClient } from "@/lib/ai/providers/kimi-client";
export { getOllamaClient, getOllamaBaseUrl } from "@/lib/ai/providers/ollama-client";

// ---- Types -------------------------------------------------------------------

export type LLMProvider =
  | "anthropic"
  | "openrouter"
  | "antigravity"
  | "codex"
  | "kimi"
  | "ollama"
  | "claudecode";

// ---- Model Sets & Defaults ---------------------------------------------------

// Claude model prefixes - models that should use Anthropic provider
const CLAUDE_MODEL_PREFIXES = ["claude-", "claude-3", "claude-2", "claude-instant"];
// Per-provider model ID sets for routing
const ANTIGRAVITY_MODEL_ID_SET = new Set(ANTIGRAVITY_CONFIG.AVAILABLE_MODELS.map((m) => m.toLowerCase()));
const CODEX_MODEL_ID_SET = new Set(CODEX_MODEL_IDS.map((m) => m.toLowerCase()));
const KIMI_MODEL_ID_SET = new Set(KIMI_MODEL_IDS.map((m) => m.toLowerCase()));
const CLAUDECODE_MODEL_ID_SET = new Set(CLAUDECODE_MODEL_IDS.map((m) => m.toLowerCase()));

// Default models for each provider
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "openrouter/auto",
  antigravity: "claude-sonnet-4-6", // Free via Antigravity
  codex: "gpt-5.1-codex",
  claudecode: "claude-sonnet-4-5-20250929", // Via Claude Pro/MAX OAuth
  kimi: "kimi-k2.5", // Moonshot Kimi K2.5 with 256K context
  ollama: "llama3.1:8b",
};

// Utility models - fast/cheap models for background tasks
export const UTILITY_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openrouter: "google/gemini-2.5-flash",
  antigravity: "gemini-3-flash", // Free via Antigravity
  codex: "gpt-5.1-codex-mini",
  claudecode: "claude-haiku-4-5-20251001", // Via Claude Pro/MAX OAuth
  kimi: "kimi-k2-turbo-preview", // Fast Kimi model for utility tasks
  ollama: "llama3.1:8b",
};

// ---- Lazy provider singletons ------------------------------------------------

let _antigravityProvider: ReturnType<typeof createAntigravityProvider> | null = null;
let _antigravityProviderToken: string | undefined = undefined;

let _codexProvider: ReturnType<typeof createCodexProvider> | null = null;

let _claudecodeProvider: ReturnType<typeof createClaudeCodeProvider> | null = null;

// ---- Token management --------------------------------------------------------

/**
 * Ensure Antigravity token is valid, refreshing if needed.
 * Also fetches project ID if missing.
 * This should be called before making API requests with Antigravity.
 * Exported so it can be called from API routes before streaming.
 */
export async function ensureAntigravityTokenValid(): Promise<boolean> {
  // Invalidate caches first to ensure we read fresh token state from disk
  invalidateSettingsCache();
  invalidateAntigravityAuthCache();

  let token = getAntigravityToken();
  if (!token) {
    return false;
  }

  const isExpired = token.expires_at <= Date.now();
  const needsRefresh = needsTokenRefresh() || isExpired;

  if (needsRefresh) {
    if (!token.refresh_token) {
      return false;
    }

    console.log("[PROVIDERS] Antigravity token needs refresh, attempting...");
    const refreshed = await refreshAntigravityToken();
    if (!refreshed) {
      return false;
    }

    // Invalidate provider so it picks up new token
    _antigravityProvider = null;
    _antigravityProviderToken = undefined;

    // Reload token after refresh
    token = getAntigravityToken();
    if (!token) {
      return false;
    }
  }

  // Fetch project ID if missing (required for API calls)
  if (token && !token.project_id) {
    console.log("[PROVIDERS] Fetching Antigravity project ID...");
    const projectId = await fetchAntigravityProjectId();
    if (projectId) {
      // Invalidate provider to pick up new project ID
      _antigravityProvider = null;
      _antigravityProviderToken = undefined;
    } else {
      console.warn("[PROVIDERS] Failed to fetch Antigravity project ID.");
      return false;
    }
  }

  return true;
}

/**
 * Ensure Claude Code auth is valid via official Agent SDK status checks.
 */
export async function ensureClaudeCodeTokenValid(): Promise<boolean> {
  invalidateSettingsCache();
  invalidateClaudeCodeAuthCache();

  const authenticated = await isClaudeCodeAuthenticated();
  if (!authenticated) {
    return false;
  }

  // Invalidate provider so the next request uses fresh SDK auth state.
  _claudecodeProvider = null;

  return true;
}

// ---- Provider instance getters -----------------------------------------------

/**
 * Get Antigravity provider instance.
 * Uses Google Generative AI SDK with custom fetch wrapper for Antigravity API.
 */
function getAntigravityProvider(): (modelId: string) => LanguageModel {
  const token = getAntigravityToken();
  const currentToken = token?.access_token;

  // Recreate provider if token changed
  if (_antigravityProvider && _antigravityProviderToken !== currentToken) {
    _antigravityProvider = null;
  }

  if (!_antigravityProvider) {
    _antigravityProviderToken = currentToken;
    _antigravityProvider = createAntigravityProvider();
  }

  if (!_antigravityProvider) {
    throw new Error("Antigravity provider not available - not authenticated");
  }

  return _antigravityProvider;
}

/**
 * Get Claude Code provider instance.
 */
function getClaudeCodeProviderInstance(): (modelId: string) => LanguageModel {
  if (!_claudecodeProvider) {
    _claudecodeProvider = createClaudeCodeProvider();
  }

  if (!_claudecodeProvider) {
    throw new Error("Claude Code provider not available - not authenticated");
  }

  return _claudecodeProvider;
}

// ---- Model classification ----------------------------------------------------

function isClaudeCodeOAuthModel(modelId: string): boolean {
  return CLAUDECODE_MODEL_ID_SET.has(modelId.toLowerCase());
}

function isAntigravityModel(modelId: string): boolean {
  return ANTIGRAVITY_MODEL_ID_SET.has(modelId.toLowerCase());
}

function isCodexModel(modelId: string): boolean {
  const baseModel = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  const lower = baseModel.toLowerCase();
  if (CODEX_MODEL_ID_SET.has(lower)) return true;
  return lower.includes("codex") || lower.includes("gpt-5");
}

function isKimiModel(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase();
  return (
    KIMI_MODEL_ID_SET.has(lowerModel) ||
    lowerModel.startsWith("kimi-") ||
    lowerModel.startsWith("moonshot-")
  );
}

function isClaudeModel(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase();
  return CLAUDE_MODEL_PREFIXES.some((prefix) => lowerModel.startsWith(prefix));
}

// ---- Model validation --------------------------------------------------------

function isModelCompatibleWithProvider(model: string, provider: LLMProvider): boolean {
  return isModelCompatible(model, provider);
}

/**
 * Validate that a model is compatible with the current provider.
 * If incompatible, logs a single warning and returns the fallback.
 * If the model is empty/null, returns null (caller decides the fallback behavior).
 *
 * NOTE: This is a runtime guard for the model resolution path.
 * The primary validation should happen at the API boundary (settings PUT,
 * session model-config PUT) via model-validation.ts.
 */
function validateModelForProvider(
  model: string | null | undefined,
  provider: LLMProvider,
  fallback: string,
  fieldName: string
): string | null {
  if (!model) return null;
  if (isModelCompatibleWithProvider(model, provider)) return model;

  console.warn(
    `[PROVIDERS] ${provider} selected but ${fieldName} "${model}" is incompatible, using ${fallback}`
  );
  return fallback;
}

// ---- Provider cache invalidation ---------------------------------------------

function invalidateProviderClient(provider: LLMProvider): void {
  switch (provider) {
    case "openrouter":
      invalidateOpenRouterClient();
      break;
    case "antigravity":
      _antigravityProvider = null;
      _antigravityProviderToken = undefined;
      break;
    case "codex":
      _codexProvider = null;
      break;
    case "claudecode":
      _claudecodeProvider = null;
      break;
    case "kimi":
      invalidateKimiClient();
      break;
    case "ollama":
      invalidateOllamaClient();
      break;
    case "anthropic":
      // Anthropic is stateless in this module (no cached client instance).
      break;
  }
}

/**
 * Invalidate cached provider clients for one or more providers.
 */
export function invalidateProviderCacheFor(
  providers: LLMProvider | LLMProvider[]
): void {
  const providerList = Array.isArray(providers) ? providers : [providers];
  for (const provider of providerList) {
    invalidateProviderClient(provider);
  }
}

/**
 * Invalidate all cached provider clients (call when settings change globally).
 */
export function invalidateProviderCache(): void {
  invalidateProviderCacheFor([
    "openrouter",
    "antigravity",
    "codex",
    "claudecode",
    "kimi",
    "ollama",
  ]);
}

// ---- Provider selection ------------------------------------------------------

/**
 * Get the configured LLM provider.
 * Reads directly from settings file to ensure latest configuration is used.
 */
export function getConfiguredProvider(): LLMProvider {
  const settings = loadSettings();
  const provider = settings.llmProvider || process.env.LLM_PROVIDER?.toLowerCase();

  if (provider === "antigravity") {
    if (!isAntigravityAuthenticated()) {
      console.warn(
        "[PROVIDERS] Antigravity selected but not authenticated, falling back to anthropic"
      );
      return "anthropic";
    }
    return "antigravity";
  }

  if (provider === "codex") {
    if (!isCodexAuthenticated()) {
      console.warn(
        "[PROVIDERS] Codex selected but not authenticated, falling back to anthropic"
      );
      return "anthropic";
    }
    return "codex";
  }

  if (provider === "claudecode") {
    const state = getClaudeCodeAuthState();
    if (!state.isAuthenticated) {
      console.warn(
        "[PROVIDERS] Claude Code selected but not authenticated, falling back to anthropic"
      );
      return "anthropic";
    }
    return "claudecode";
  }

  if (provider === "openrouter") {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      console.warn(
        "[PROVIDERS] OpenRouter selected but OPENROUTER_API_KEY is not set, falling back to anthropic"
      );
      return "anthropic";
    }
    return "openrouter";
  }

  if (provider === "kimi") {
    const apiKey = getKimiApiKey();
    if (!apiKey) {
      console.warn(
        "[PROVIDERS] Kimi selected but KIMI_API_KEY is not set, falling back to anthropic"
      );
      return "anthropic";
    }
    return "kimi";
  }

  if (provider === "ollama") {
    return "ollama";
  }

  return "anthropic";
}

/**
 * Get the configured model for the active provider.
 * Reads directly from settings file to ensure latest configuration is used.
 */
export function getConfiguredModel(): string {
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const envModel = settings.chatModel || process.env.LLM_MODEL;

  const model = envModel || DEFAULT_MODELS[provider];
  return (
    validateModelForProvider(model, provider, DEFAULT_MODELS[provider], "model") ||
    DEFAULT_MODELS[provider]
  );
}

/**
 * Get the appropriate temperature for the current provider.
 * Kimi K2.5 models require temperature=1 (fixed value).
 */
export function getProviderTemperature(requestedTemp: number): number {
  const provider = getConfiguredProvider();
  if (provider === "kimi") {
    return 1; // Kimi K2.5 fixed value; custom fetch overrides to 0.6 for non-thinking mode
  }
  return requestedTemp;
}

// ---- Model instance routing --------------------------------------------------

/**
 * Get a language model instance for the configured provider and model.
 */
export function getLanguageModel(modelOverride?: string): LanguageModel {
  const provider = getConfiguredProvider();
  const model =
    validateModelForProvider(
      modelOverride || getConfiguredModel(),
      provider,
      DEFAULT_MODELS[provider],
      "model"
    ) || DEFAULT_MODELS[provider];

  console.log(`[PROVIDERS] Using provider: ${provider}, model: ${model}`);

  switch (provider) {
    case "antigravity": {
      if (!isAntigravityAuthenticated()) {
        throw new Error("Antigravity authentication required. Please login via Settings.");
      }
      return getAntigravityProvider()(model);
    }

    case "codex": {
      if (!isCodexAuthenticated()) {
        throw new Error("Codex authentication required. Please login via Settings.");
      }
      if (!_codexProvider) {
        _codexProvider = createCodexProvider();
      }
      return _codexProvider(model);
    }

    case "claudecode": {
      return getClaudeCodeProviderInstance()(model);
    }

    case "kimi": {
      const apiKey = getKimiApiKey();
      if (!apiKey) {
        throw new Error("KIMI_API_KEY environment variable is not configured");
      }
      return getKimiClient()(model);
    }

    case "ollama":
      return getOllamaClient()(model);

    case "openrouter": {
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY environment variable is not configured");
      }
      return getOpenRouterClient()(model);
    }

    case "anthropic":
    default:
      return anthropic(model);
  }
}

/**
 * Get a language model instance for a specific model ID.
 * Automatically routes to the correct provider based on model ID:
 * - Antigravity models (gemini-3-*, claude-sonnet-4-5, etc.) -> Antigravity provider (if authenticated)
 * - Claude models (claude-*) -> Anthropic provider
 * - Other models (provider/model format) -> OpenRouter provider
 */
export function getModelByName(modelId: string): LanguageModel {
  if (isAntigravityModel(modelId) && isAntigravityAuthenticated()) {
    console.log(`[PROVIDERS] Using Antigravity for model: ${modelId}`);
    return getAntigravityProvider()(modelId);
  }

  if (isCodexModel(modelId) && isCodexAuthenticated()) {
    console.log(`[PROVIDERS] Using Codex for model: ${modelId}`);
    if (!_codexProvider) {
      _codexProvider = createCodexProvider();
    }
    return _codexProvider(modelId);
  }

  if (isClaudeCodeOAuthModel(modelId)) {
    console.log(`[PROVIDERS] Using Claude Code for model: ${modelId}`);
    return getClaudeCodeProviderInstance()(modelId);
  }

  if (isKimiModel(modelId)) {
    const apiKey = getKimiApiKey();
    if (apiKey) {
      console.log(`[PROVIDERS] Using Kimi for model: ${modelId}`);
      return getKimiClient()(modelId);
    }
    // Fall through to OpenRouter if no Kimi key
  }

  if (isClaudeModel(modelId)) {
    console.log(`[PROVIDERS] Using Anthropic for Claude model: ${modelId}`);
    return anthropic(modelId);
  }

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not configured");
  }
  console.log(`[PROVIDERS] Using OpenRouter for model: ${modelId}`);
  return getOpenRouterClient()(modelId);
}

// ---- Convenience model getters -----------------------------------------------

/**
 * Get the chat model for conversations.
 */
export function getChatModel(): LanguageModel {
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const chatModel = validateModelForProvider(
    settings.chatModel || process.env.LLM_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "chatModel"
  );

  if (chatModel) {
    console.log(`[PROVIDERS] Using configured chat model: ${chatModel}`);
    return provider === "ollama" ? getLanguageModel(chatModel) : getModelByName(chatModel);
  }

  return getLanguageModel();
}

/**
 * Get the research model for Deep Research mode.
 */
export function getResearchModel(): LanguageModel {
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const researchModel = validateModelForProvider(
    settings.researchModel || process.env.RESEARCH_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "researchModel"
  );

  if (researchModel) {
    console.log(`[PROVIDERS] Using configured research model: ${researchModel}`);
    return provider === "ollama"
      ? getLanguageModel(researchModel)
      : getModelByName(researchModel);
  }

  return getChatModel();
}

/**
 * Get the vision model for image analysis.
 */
export function getVisionModel(): LanguageModel {
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const visionModel = validateModelForProvider(
    settings.visionModel || process.env.VISION_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "visionModel"
  );

  if (visionModel) {
    console.log(`[PROVIDERS] Using configured vision model: ${visionModel}`);
    return provider === "ollama" ? getLanguageModel(visionModel) : getModelByName(visionModel);
  }

  console.log(`[PROVIDERS] Using chat model for vision (has native vision support)`);
  return getChatModel();
}

/**
 * Get a utility model for background tasks (compaction, memory extraction, etc.).
 * Uses a fast/cheap model appropriate for the configured provider.
 * - Anthropic: Claude Haiku 4.5
 * - OpenRouter: Gemini 2.5 Flash
 * - Antigravity: Gemini 3 Flash (free)
 */
export function getUtilityModel(): LanguageModel {
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const overrideModel = validateModelForProvider(
    settings.utilityModel || process.env.UTILITY_MODEL,
    provider,
    UTILITY_MODELS[provider],
    "utilityModel"
  );

  if (overrideModel) {
    console.log(`[PROVIDERS] Using configured utility model: ${overrideModel}`);
    return provider === "ollama"
      ? getLanguageModel(overrideModel)
      : getModelByName(overrideModel);
  }

  const model = UTILITY_MODELS[provider];
  console.log(`[PROVIDERS] Using utility model: ${model} (provider: ${provider})`);
  // Delegate to getLanguageModel with the provider-specific utility model as override.
  // The routing logic is identical; getLanguageModel handles auth checks and client init.
  return getLanguageModel(model);
}

// ---- Metadata / feature queries ----------------------------------------------

/**
 * Get provider display name for logging.
 */
export function getProviderDisplayName(): string {
  const provider = getConfiguredProvider();
  const model = getConfiguredModel();

  switch (provider) {
    case "antigravity":
      return `Antigravity (${model}) [Free]`;
    case "codex":
      return `Codex (${model})`;
    case "claudecode":
      return `Claude Code (${model})`;
    case "kimi":
      return `Kimi (${model})`;
    case "ollama":
      return `Ollama (${model})`;
    case "openrouter":
      return `OpenRouter (${model})`;
    case "anthropic":
    default:
      return `Anthropic (${model})`;
  }
}

/**
 * Check if the current provider supports a specific feature.
 */
export function providerSupportsFeature(
  feature: "tools" | "streaming" | "images"
): boolean {
  const provider = getConfiguredProvider();

  const featureSupport: Record<LLMProvider, Record<string, boolean>> = {
    anthropic: { tools: true, streaming: true, images: true },
    openrouter: { tools: true, streaming: true, images: true },
    antigravity: { tools: true, streaming: true, images: true },
    codex: { tools: true, streaming: true, images: true },
    claudecode: { tools: true, streaming: true, images: true },
    kimi: { tools: true, streaming: true, images: true },
    ollama: { tools: false, streaming: true, images: false },
  };

  return featureSupport[provider]?.[feature] ?? false;
}
