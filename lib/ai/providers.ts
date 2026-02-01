/**
 * LLM Provider Configuration
 *
 * Supports multiple providers:
 * - anthropic: Anthropic Claude models
 * - openrouter: OpenRouter (OpenAI-compatible API with access to many models)
 * - antigravity: Antigravity free models via Google OAuth (Gemini 3, Claude Sonnet 4.5, etc.)
 * - codex: OpenAI Codex models via ChatGPT OAuth
 */

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";
import { existsSync } from "fs";
import { createLocalEmbeddingModel, DEFAULT_LOCAL_EMBEDDING_MODEL } from "@/lib/ai/local-embeddings";
import {
  isAntigravityAuthenticated,
  needsTokenRefresh,
  refreshAntigravityToken,
  getAntigravityToken,
  ANTIGRAVITY_CONFIG,
  fetchAntigravityProjectId,
} from "@/lib/auth/antigravity-auth";
import { isCodexAuthenticated } from "@/lib/auth/codex-auth";
import { CODEX_MODEL_IDS } from "@/lib/auth/codex-models";
import { KIMI_MODEL_IDS, KIMI_CONFIG } from "@/lib/auth/kimi-models";
import { createAntigravityProvider } from "@/lib/ai/providers/antigravity-provider";
import { createCodexProvider } from "@/lib/ai/providers/codex-provider";

// Provider types
export type LLMProvider = "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi";
export type EmbeddingProvider = "openrouter" | "local";

// Provider configuration
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "openrouter";

// Helper to get OpenRouter API key dynamically (allows settings to set it after module load)
function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

// Default embedding model
const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-4b";
const LOCAL_MODEL_PREFIX = "local:";
const OPENROUTER_MODEL_PREFIX = "openrouter:";

// Default models for each provider
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "x-ai/grok-4.1-fast",
  antigravity: "claude-sonnet-4-5", // Free via Antigravity
  codex: "gpt-5.1-codex",
  kimi: "kimi-k2.5", // Moonshot Kimi K2.5 with 256K context
};

// Utility models - fast/cheap models for background tasks (compaction, memory extraction)
export const UTILITY_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openrouter: "google/gemini-2.5-flash",
  antigravity: "gemini-3-flash", // Free via Antigravity
  codex: "gpt-5.1-codex-mini",
  kimi: "kimi-k2-turbo-preview", // Fast Kimi model for utility tasks
};

// Claude model prefixes - models that should use Anthropic provider
const CLAUDE_MODEL_PREFIXES = ["claude-", "claude3", "claude4"];

// Antigravity models - route only known IDs to avoid false positives
const ANTIGRAVITY_MODEL_ID_SET = new Set(
  ANTIGRAVITY_CONFIG.AVAILABLE_MODELS.map((modelId) => modelId.toLowerCase())
);

const CODEX_MODEL_ID_SET = new Set(
  CODEX_MODEL_IDS.map((modelId) => modelId.toLowerCase())
);

// Kimi model ID set for routing
const KIMI_MODEL_ID_SET = new Set(
  KIMI_MODEL_IDS.map((modelId) => modelId.toLowerCase())
);

// Lazy-initialized OpenRouter client (created on first use to pick up API key from settings)
let _openrouterClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _openrouterClientApiKey: string | undefined = undefined;

// Lazy-initialized Antigravity provider
let _antigravityProvider: ReturnType<typeof createAntigravityProvider> | null = null;
let _antigravityProviderToken: string | undefined = undefined;

// Lazy-initialized Codex provider
let _codexProvider: ReturnType<typeof createCodexProvider> | null = null;

// Lazy-initialized Kimi client (OpenAI-compatible)
let _kimiClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _kimiClientApiKey: string | undefined = undefined;

// Cache for local embedding model instance
let _localEmbeddingModel: EmbeddingModel | null = null;
let _localEmbeddingModelId: string | null = null;
let _localEmbeddingModelDir: string | undefined = undefined;

function getOpenRouterClient() {
  const apiKey = getOpenRouterApiKey();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();

  // Recreate client if API key changed (e.g., settings were updated)
  if (_openrouterClient && _openrouterClientApiKey !== apiKey) {
    _openrouterClient = null;
  }

  // Create client lazily so it picks up API key after settings are initialized
  if (!_openrouterClient) {
    _openrouterClientApiKey = apiKey;

    // Parse OpenRouter args from settings (with validation)
    let providerOptions = {};
    if (settings.openrouterArgs) {
      try {
        const args = JSON.parse(settings.openrouterArgs);
        // Extract quantization suffix for model name
        const quant = args.quant;
        // Pass other options to providerOptions
        providerOptions = { ...args };
        console.log("[PROVIDERS] OpenRouter args applied:", providerOptions);
      } catch (error) {
        console.warn("[PROVIDERS] Invalid OpenRouter args JSON, ignoring:", error);
      }
    }

    _openrouterClient = createOpenAICompatible({
      name: "openrouter",
      baseURL: OPENROUTER_BASE_URL,
      apiKey: apiKey || "",
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "STYLY Agent",
      },
      // Add provider options for request body customization
      ...providerOptions,
    });
  }
  return _openrouterClient;
}

// Helper to get Kimi API key dynamically
function getKimiApiKey(): string | undefined {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
}

/**
 * Custom fetch wrapper for Kimi API.
 * Disables thinking mode and enforces required parameter values
 * per Kimi K2.5 docs (non-thinking mode requires specific fixed values).
 */
async function kimiCustomFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      // Disable thinking mode — reasoning outputs should not persist in history
      body.thinking = { type: "disabled" };
      // Non-thinking mode requires these fixed values per Kimi K2.5 docs
      body.temperature = 0.6;
      body.top_p = 0.95;
      body.n = 1;
      body.presence_penalty = 0.0;
      body.frequency_penalty = 0.0;
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // Not JSON, pass through unchanged
    }
  }
  return globalThis.fetch(url, init);
}

function getKimiClient() {
  const apiKey = getKimiApiKey();

  // Recreate client if API key changed
  if (_kimiClient && _kimiClientApiKey !== apiKey) {
    _kimiClient = null;
  }

  if (!_kimiClient) {
    _kimiClientApiKey = apiKey;
    _kimiClient = createOpenAICompatible({
      name: "kimi",
      baseURL: KIMI_CONFIG.BASE_URL,
      apiKey: apiKey || "",
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Seline Agent",
      },
      fetch: kimiCustomFetch,
    });
  }
  return _kimiClient;
}

/**
 * Ensure Antigravity token is valid, refreshing if needed.
 * Also fetches project ID if missing.
 * This should be called before making API requests with Antigravity.
 * Exported so it can be called from API routes before streaming.
 */
export async function ensureAntigravityTokenValid(): Promise<boolean> {
  // CRITICAL: Invalidate caches first to ensure we read fresh token state from disk
  // This prevents issues where cached stale token data causes auth failures
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { invalidateSettingsCache } = require("@/lib/settings/settings-manager");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { invalidateAntigravityAuthCache } = require("@/lib/auth/antigravity-auth");
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
 * Get Antigravity provider instance
 * Uses Google Generative AI SDK with custom fetch wrapper for Antigravity API
 */
function getAntigravityProvider(): ((modelId: string) => LanguageModel) {
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
 * Check if a model ID is an Antigravity model
 */
function isAntigravityModel(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase();
  return ANTIGRAVITY_MODEL_ID_SET.has(lowerModel);
}

function isCodexModel(modelId: string): boolean {
  const baseModel = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  const lower = baseModel.toLowerCase();
  if (CODEX_MODEL_ID_SET.has(lower)) {
    return true;
  }
  return lower.includes("codex") || lower.includes("gpt-5");
}

/**
 * Check if a model ID is a Kimi model (should use Moonshot provider)
 */
function isKimiModel(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase();
  return KIMI_MODEL_ID_SET.has(lowerModel) ||
         lowerModel.startsWith("kimi-") ||
         lowerModel.startsWith("moonshot-");
}

/**
 * Get the appropriate temperature for the current provider
 * Kimi K2.5 models require temperature=1 (fixed value)
 */
export function getProviderTemperature(requestedTemp: number): number {
  const provider = getConfiguredProvider();
  if (provider === "kimi") {
    return 1; // Kimi K2.5 fixed value; custom fetch overrides to 0.6 for non-thinking mode
  }
  return requestedTemp;
}

/**
 * Invalidate cached provider clients (call when settings change)
 */
export function invalidateProviderCache(): void {
  _openrouterClient = null;
  _openrouterClientApiKey = undefined;
  _antigravityProvider = null;
  _antigravityProviderToken = undefined;
  _codexProvider = null;
  _kimiClient = null;
  _kimiClientApiKey = undefined;
}

/**
 * Get the embedding model identifier to use for document indexing.
 * Reads directly from settings file to ensure latest configuration is used.
 * Defaults to OpenRouter unless local embeddings are configured.
 */
export function getEmbeddingModelId(): string {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const resolved = resolveEmbeddingModelConfig(settings);
  return resolved.storageId;
}

/**
 * Get the configured LLM provider.
 * Reads directly from settings file to ensure latest configuration is used.
 */
export function getConfiguredProvider(): LLMProvider {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = settings.llmProvider || process.env.LLM_PROVIDER?.toLowerCase();

  if (provider === "antigravity") {
    if (!isAntigravityAuthenticated()) {
      console.warn("[PROVIDERS] Antigravity selected but not authenticated, falling back to anthropic");
      return "anthropic";
    }
    return "antigravity";
  }

  if (provider === "codex") {
    if (!isCodexAuthenticated()) {
      console.warn("[PROVIDERS] Codex selected but not authenticated, falling back to anthropic");
      return "anthropic";
    }
    return "codex";
  }

  if (provider === "openrouter") {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      console.warn("[PROVIDERS] OpenRouter selected but OPENROUTER_API_KEY is not set, falling back to anthropic");
      return "anthropic";
    }
    return "openrouter";
  }

  if (provider === "kimi") {
    const apiKey = getKimiApiKey();
    if (!apiKey) {
      console.warn("[PROVIDERS] Kimi selected but KIMI_API_KEY is not set, falling back to anthropic");
      return "anthropic";
    }
    return "kimi";
  }

  // Default to anthropic
  return "anthropic";
}

/**
 * Get the configured model for the active provider.
 * Reads directly from settings file to ensure latest configuration is used.
 */
export function getConfiguredModel(): string {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const envModel = settings.chatModel || process.env.LLM_MODEL;

  // Use environment model if set, otherwise use default for provider
  const model = envModel || DEFAULT_MODELS[provider];

  return validateModelForProvider(model, provider, DEFAULT_MODELS[provider], "model") || DEFAULT_MODELS[provider];
}

/**
 * Get a language model instance for the configured provider and model
 */
export function getLanguageModel(modelOverride?: string): LanguageModel {
  const provider = getConfiguredProvider();
  const model = validateModelForProvider(
    modelOverride || getConfiguredModel(),
    provider,
    DEFAULT_MODELS[provider],
    "model",
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

    case "kimi": {
      const apiKey = getKimiApiKey();
      if (!apiKey) {
        throw new Error("KIMI_API_KEY environment variable is not configured");
      }
      return getKimiClient()(model);
    }

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
 * Check if a model ID is a Claude model (should use Anthropic provider)
 */
function isClaudeModel(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase();
  return CLAUDE_MODEL_PREFIXES.some(prefix => lowerModel.startsWith(prefix));
}

/**
 * Check if a model is compatible with the given provider.
 * Returns true if the model belongs to (or is valid for) that provider.
 */
  function isModelCompatibleWithProvider(model: string, provider: LLMProvider): boolean {
    switch (provider) {
      case "antigravity": return isAntigravityModel(model);
      case "codex": return isCodexModel(model);
      case "kimi": return isKimiModel(model);
      case "anthropic": return isClaudeModel(model);
      case "openrouter": {
        const trimmed = model.trim();
        if (trimmed.startsWith(OPENROUTER_MODEL_PREFIX) || trimmed.includes("/")) {
          return true;
        }
        // Avoid routing bare provider-specific IDs through OpenRouter.
        if (isAntigravityModel(trimmed) || isCodexModel(trimmed) || isKimiModel(trimmed) || isClaudeModel(trimmed)) {
          return false;
        }
        return true;
      }
    }
  }

/**
 * Validate that a model is compatible with the current provider.
 * If incompatible, logs a single warning and returns the fallback.
 * If the model is empty/null, returns null (caller decides the fallback behavior).
 */
function validateModelForProvider(
  model: string | null | undefined,
  provider: LLMProvider,
  fallback: string,
  fieldName: string,
): string | null {
  if (!model) return null;
  if (isModelCompatibleWithProvider(model, provider)) return model;

  console.warn(
    `[PROVIDERS] ${provider} selected but ${fieldName} "${model}" is incompatible, using ${fallback}`
  );
  return fallback;
}

/**
 * Get a language model instance for a specific model ID.
 * Automatically routes to the correct provider based on model ID:
 * - Antigravity models (gemini-3-*, claude-sonnet-4-5, etc.) -> Antigravity provider (if authenticated)
 * - Claude models (claude-*) -> Anthropic provider
 * - Other models (provider/model format) -> OpenRouter provider
 */
export function getModelByName(modelId: string): LanguageModel {
  // Check if model should use Antigravity (and user is authenticated)
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

  // Check if model should use Kimi (Moonshot)
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

  // For OpenRouter models (format: provider/model-name)
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not configured");
  }
  console.log(`[PROVIDERS] Using OpenRouter for model: ${modelId}`);
  return getOpenRouterClient()(modelId);
}

/**
 * Get the chat model for conversations.
 * Reads directly from settings file to ensure latest configuration is used.
 * Falls back to provider default if no chat model is configured.
 *
 * IMPORTANT: When using a specific provider (e.g., Antigravity), validates that
 * the saved model is compatible with that provider. If not, falls back to provider default.
 */
export function getChatModel(): LanguageModel {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const chatModel = validateModelForProvider(
    settings.chatModel || process.env.LLM_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "chatModel",
  );

  if (chatModel) {
    console.log(`[PROVIDERS] Using configured chat model: ${chatModel}`);
    return getModelByName(chatModel);
  }

  // Fall back to default provider behavior
  return getLanguageModel();
}

/**
 * Get the research model for Deep Research mode.
 * Reads directly from settings file to ensure latest configuration is used.
 * Falls back to chat model if no research model is configured.
 *
 * IMPORTANT: Validates that the saved model is compatible with the configured provider.
 */
export function getResearchModel(): LanguageModel {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const researchModel = validateModelForProvider(
    settings.researchModel || process.env.RESEARCH_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "researchModel",
  );

  if (researchModel) {
    console.log(`[PROVIDERS] Using configured research model: ${researchModel}`);
    return getModelByName(researchModel);
  }

  // Fall back to chat model
  return getChatModel();
}

/**
 * Get the vision model for image analysis.
 * Reads directly from settings file to ensure latest configuration is used.
 * Falls back to chat model if no vision model is configured.
 * Note: The fallback chat model (Claude) has native vision support.
 *
 * IMPORTANT: Validates that the saved model is compatible with the configured provider.
 */
export function getVisionModel(): LanguageModel {
  // Import settings dynamically to avoid circular dependencies
  // and ensure we always get the latest settings from disk
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const visionModel = validateModelForProvider(
    settings.visionModel || process.env.VISION_MODEL,
    provider,
    DEFAULT_MODELS[provider],
    "visionModel",
  );

  if (visionModel) {
    console.log(`[PROVIDERS] Using configured vision model: ${visionModel}`);
    return getModelByName(visionModel);
  }

  // Fall back to chat model - Claude has native vision support
  console.log(`[PROVIDERS] Using chat model for vision (has native vision support)`);
  return getChatModel();
}

/**
 * Get a utility model for background tasks (compaction, memory extraction, etc.).
 * Uses a fast/cheap model appropriate for the configured provider.
 * - Anthropic: Claude Haiku 4.5
 * - OpenRouter: Gemini 2.5 Flash
 * - Antigravity: Gemini 3 Flash (free)
 *
 * IMPORTANT: Validates that any override model is compatible with the configured provider.
 */
export function getUtilityModel(): LanguageModel {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const provider = getConfiguredProvider();
  const overrideModel = validateModelForProvider(
    settings.utilityModel || process.env.UTILITY_MODEL,
    provider,
    UTILITY_MODELS[provider],
    "utilityModel",
  );

  if (overrideModel) {
    console.log(`[PROVIDERS] Using configured utility model: ${overrideModel}`);
    return getModelByName(overrideModel);
  }
  const model = UTILITY_MODELS[provider];

  console.log(`[PROVIDERS] Using utility model: ${model} (provider: ${provider})`);

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

    case "kimi": {
      const apiKey = getKimiApiKey();
      if (!apiKey) {
        throw new Error("KIMI_API_KEY environment variable is not configured");
      }
      return getKimiClient()(model);
    }

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
 * Get an embedding model instance.
 *
 * Embeddings can be served via OpenRouter or a local Transformers.js model,
 * depending on settings and environment availability.
 */
export function getEmbeddingModel(modelOverride?: string): EmbeddingModel {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require("@/lib/settings/settings-manager");
  const settings = loadSettings();
  const resolved = resolveEmbeddingModelConfig(settings, modelOverride);

  if (resolved.provider === "local") {
    try {
      // Use EMBEDDING_MODEL_DIR set by Electron main process
      // The local-embeddings module handles path resolution internally
      const modelDir = process.env.EMBEDDING_MODEL_DIR;

      // Return cached instance if it exists and configuration matches
      if (
        _localEmbeddingModel &&
        _localEmbeddingModelId === resolved.modelId &&
        _localEmbeddingModelDir === modelDir
      ) {
        return _localEmbeddingModel;
      }

      console.log(`[PROVIDERS] Using local embedding model: ${resolved.modelId}`);
      const model = createLocalEmbeddingModel({
        modelId: resolved.modelId,
      });

      // Update cache
      _localEmbeddingModel = model;
      _localEmbeddingModelId = resolved.modelId;
      _localEmbeddingModelDir = modelDir;

      return model;
    } catch (error) {
      console.warn("[PROVIDERS] Local embedding model failed, falling back to OpenRouter:", error);
    }
  }

  return getOpenRouterEmbeddingModel(resolved.openRouterModelId);
}

function getOpenRouterEmbeddingModel(model: string): EmbeddingModel {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not configured. Embeddings currently require OpenRouter."
    );
  }

  console.log(`[PROVIDERS] Using OpenRouter embedding model: ${model}`);
  return getOpenRouterClient().embeddingModel(model);
}

function normalizeEmbeddingProvider(provider?: string): EmbeddingProvider {
  if (provider === "local") return "local";
  return DEFAULT_EMBEDDING_PROVIDER;
}

function resolveEmbeddingModelConfig(
  settings: { embeddingProvider?: string; embeddingModel?: string },
  modelOverride?: string,
): {
  provider: EmbeddingProvider;
  modelId: string;
  storageId: string;
  openRouterModelId: string;
} {
  let provider = normalizeEmbeddingProvider(settings.embeddingProvider || process.env.EMBEDDING_PROVIDER);
  let modelId = (modelOverride ?? settings.embeddingModel ?? process.env.EMBEDDING_MODEL ?? "").trim();

  if (modelId.startsWith(LOCAL_MODEL_PREFIX)) {
    provider = "local";
    modelId = modelId.slice(LOCAL_MODEL_PREFIX.length);
  } else if (modelId.startsWith(OPENROUTER_MODEL_PREFIX)) {
    provider = "openrouter";
    modelId = modelId.slice(OPENROUTER_MODEL_PREFIX.length);
  }

  if (!modelId) {
    modelId = provider === "local" ? DEFAULT_LOCAL_EMBEDDING_MODEL : DEFAULT_EMBEDDING_MODEL;
  }

  const openRouterModelId = provider === "openrouter" ? modelId : DEFAULT_EMBEDDING_MODEL;
  const storageId = provider === "local" ? `${LOCAL_MODEL_PREFIX}${modelId}` : modelId;

  if (provider === "local" && !canUseLocalEmbeddings()) {
    console.warn("[PROVIDERS] Local embeddings not available, falling back to OpenRouter");
    return {
      provider: "openrouter",
      modelId: openRouterModelId,
      storageId: openRouterModelId,
      openRouterModelId,
    };
  }

  return { provider, modelId, storageId, openRouterModelId };
}

/**
 * Check if local embeddings can be used.
 * Local embeddings are available when:
 * 1. Running in Electron (ELECTRON_USER_DATA_PATH is set by electron/main.ts)
 * 2. Or ALLOW_LOCAL_EMBEDDINGS=true is set for development
 * 3. Or EMBEDDING_MODEL_DIR is set and exists (user configured a model path)
 *
 * The model directory (EMBEDDING_MODEL_DIR) can be set by:
 * - User via environment variable
 */
let _hasLoggedLocalEmbeddings = false;

function canUseLocalEmbeddings(): boolean {
  const isElectronRuntime = Boolean(process.versions.electron || process.env.ELECTRON_USER_DATA_PATH);
  const allowLocalOverride = process.env.ALLOW_LOCAL_EMBEDDINGS === "true" || process.env.NODE_ENV === "development";
  const modelDir = process.env.EMBEDDING_MODEL_DIR;

  // If model directory is set and exists, allow local embeddings
  if (modelDir && existsSync(modelDir)) {
    if (!_hasLoggedLocalEmbeddings) {
      console.log(`[PROVIDERS] Local embeddings enabled via EMBEDDING_MODEL_DIR: ${modelDir}`);
      _hasLoggedLocalEmbeddings = true;
    }
    return true;
  }

  // Otherwise, require Electron runtime or development mode or explicit override
  if (!isElectronRuntime && !allowLocalOverride) {
    if (!_hasLoggedLocalEmbeddings) {
      console.log(`[PROVIDERS] Local embeddings not available (not in Electron, no ALLOW_LOCAL_EMBEDDINGS, no development mode)`);
      _hasLoggedLocalEmbeddings = true;
    }
    return false;
  }

  return true;
}

/**
 * Get provider display name for logging
 */
export function getProviderDisplayName(): string {
  const provider = getConfiguredProvider();
  const model = getConfiguredModel();

  switch (provider) {
    case "antigravity":
      return `Antigravity (${model}) [Free]`;
    case "codex":
      return `Codex (${model})`;
    case "kimi":
      return `Kimi (${model})`;
    case "openrouter":
      return `OpenRouter (${model})`;
    case "anthropic":
    default:
      return `Anthropic (${model})`;
  }
}

/**
 * Check if the current provider supports a specific feature
 */
export function providerSupportsFeature(feature: "tools" | "streaming" | "images"): boolean {
  const provider = getConfiguredProvider();

  // All supported providers currently support these features
  const featureSupport: Record<LLMProvider, Record<string, boolean>> = {
    anthropic: { tools: true, streaming: true, images: true },
    openrouter: { tools: true, streaming: true, images: true },
    antigravity: { tools: true, streaming: true, images: true },
    codex: { tools: true, streaming: true, images: true },
    kimi: { tools: true, streaming: true, images: true },
  };

  return featureSupport[provider]?.[feature] ?? false;
}
