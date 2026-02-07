import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { loadConfigFromEnv } from "@/lib/config/vector-search";
import type { MCPConfig } from "@/lib/mcp/types";

export interface AppSettings {
    // AI Provider settings
    llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama";
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    kimiApiKey?: string;      // For Moonshot Kimi models
    openaiApiKey?: string;    // For OpenAI Whisper STT, TTS, and other OpenAI-direct services
    ollamaBaseUrl?: string;
    tavilyApiKey?: string;    // For Deep Research web search
    firecrawlApiKey?: string; // For web scraping with Firecrawl
    webScraperProvider?: "firecrawl" | "local"; // Web scraping provider selection
  huggingFaceToken?: string; // For downloading gated models from Hugging Face

    // MCP (Model Context Protocol) settings
    /**
     * Global MCP server configurations
     * These are available to all agents unless overridden
     */
    mcpServers?: MCPConfig;

    /**
     * Environment variables for MCP server URL/header substitution
     * e.g., { "SUPABASE_PROJECT_REF": "abc123", "SUPABASE_ACCESS_TOKEN": "..." }
     */
    mcpEnvironment?: Record<string, string>;

    // Antigravity OAuth authentication (free models via Google OAuth)
    antigravityAuth?: {
        isAuthenticated: boolean;
        email?: string;
        expiresAt?: number;
        lastRefresh?: number;
    };
    antigravityToken?: {
        type: "oauth";
        access_token: string;
        refresh_token: string;
        expires_at: number;
        token_type?: string;
        scope?: string;
        project_id?: string; // Antigravity project ID from loadCodeAssist
    };

    // OpenAI Codex OAuth authentication (ChatGPT Plus/Pro)
    codexAuth?: {
        isAuthenticated: boolean;
        email?: string;
        accountId?: string;
        expiresAt?: number;
        lastRefresh?: number;
    };
    codexToken?: {
        type: "oauth";
        access_token: string;
        refresh_token: string;
        expires_at: number;
    };

    // Model selection for different tasks
    // Format: Model ID string (e.g., "claude-sonnet-4-5-20250929" or "x-ai/grok-4.1-fast")
    // Empty string means use default for the provider
    chatModel?: string;       // Main chat model
    embeddingProvider?: "openrouter" | "local"; // Embedding provider selection
    embeddingModel?: string;  // Model for document embeddings
    embeddingModelDir?: string;  // Path to local embedding models (set by Electron)
    researchModel?: string;   // Model for Deep Research mode
    visionModel?: string;     // Model for image analysis/description (must support vision)
    utilityModel?: string;    // Fast/cheap model for background tasks
    embeddingReindexRequired?: boolean; // Flag to trigger reindex when embeddings change

    // OpenRouter advanced options (JSON string)
    // Example: { "quant": "q4_0", "thinkingBudget": 512, "includeThoughts": false }
    openrouterArgs?: string;  // JSON string for OpenRouter provider options

    // Image/Video generation
    stylyAiApiKey?: string;
    imageGenerationProvider?: "openrouter" | "local-comfyui"; // Image generation provider selection

    // ComfyUI Local Backend Settings (Z-Image)
    comfyuiEnabled?: boolean;        // Enable local ComfyUI for image generation
    comfyuiInstalled?: boolean;      // Whether Docker image is built
    comfyuiAutoStart?: boolean;      // Auto-start container on app launch
    comfyuiPort?: number;            // API port (default: 8000)
    comfyuiModelsDownloaded?: boolean; // Whether Z-Image models are downloaded
    comfyuiBackendPath?: string;     // Path to comfyui_backend folder
    comfyuiCustomHost?: string;      // Host for external ComfyUI instance
    comfyuiCustomPort?: number;      // Port for external ComfyUI instance
    comfyuiCustomUseHttps?: boolean; // Use HTTPS for external ComfyUI
    comfyuiCustomAutoDetect?: boolean; // Auto-detect external ComfyUI port
    comfyuiCustomBaseUrl?: string;   // Optional full base URL override

    // FLUX.2 Klein 4B Local Backend Settings
    flux2Klein4bEnabled?: boolean;        // Enable FLUX.2 Klein 4B for image generation
    flux2Klein4bInstalled?: boolean;      // Whether Docker image is built
    flux2Klein4bAutoStart?: boolean;      // Auto-start container on app launch
    flux2Klein4bModelsDownloaded?: boolean; // Whether models are downloaded
    flux2Klein4bBackendPath?: string;     // Path to flux2-klein-4b folder

    // FLUX.2 Klein 9B Local Backend Settings
    flux2Klein9bEnabled?: boolean;        // Enable FLUX.2 Klein 9B for image generation
    flux2Klein9bInstalled?: boolean;      // Whether Docker image is built
    flux2Klein9bAutoStart?: boolean;      // Auto-start container on app launch
    flux2Klein9bModelsDownloaded?: boolean; // Whether models are downloaded
    flux2Klein9bBackendPath?: string;     // Path to flux2-klein-9b folder

    // Vector Database (LanceDB) - Advanced Semantic Search
    vectorDBEnabled?: boolean;  // Enable/disable LanceDB integration
    vectorAutoSyncEnabled?: boolean;  // Enable/disable periodic background sync (default: true)
    vectorSyncIntervalMinutes?: number;  // Interval between background syncs in minutes (default: 60)
    vectorSearchHybridEnabled?: boolean;
    vectorSearchTokenChunkingEnabled?: boolean;
    vectorSearchRerankingEnabled?: boolean;
    vectorSearchQueryExpansionEnabled?: boolean;
    vectorSearchLlmSynthesisEnabled?: boolean;

    vectorSearchRrfK?: number;
    vectorSearchDenseWeight?: number;
    vectorSearchLexicalWeight?: number;
    vectorSearchRerankModel?: string;
    vectorSearchRerankTopK?: number;
    vectorSearchTokenChunkSize?: number;
    vectorSearchTokenChunkStride?: number;
    vectorSearchMaxFileLines?: number;
    vectorSearchMaxLineLength?: number;

    // Local Grep (ripgrep) settings
    localGrepEnabled?: boolean;           // Enable/disable local grep tool (default: true)
    localGrepMaxResults?: number;         // Maximum results (default: 100)
    localGrepContextLines?: number;       // Context lines before/after match (default: 2)
    localGrepRespectGitignore?: boolean;  // Respect .gitignore files (default: true)

    // Local user info (for offline mode)
    localUserId: string;
    localUserEmail: string;

    // App preferences
    theme: "dark" | "light" | "system";
    toolLoadingMode?: "deferred" | "always";  // Tool loading strategy: deferred saves tokens, always loads all upfront
    dataPath?: string;

    // Prompt Caching (Anthropic only)
    promptCachingEnabled?: boolean;           // Enable/disable prompt caching (default: true)
    promptCachingTtl?: "5m" | "1h";          // Cache TTL: 5m (standard) or 1h (premium) (default: 5m)

    // Onboarding state
    onboardingComplete?: boolean;
    onboardingCompletedAt?: string; // ISO timestamp
    onboardingVersion?: number;      // For future migrations

    // Global memory preferences (applied to new agents and synced to existing)
    globalMemoryDefaults?: {
        visual_preferences?: string[];    // e.g., ["Prefer dark mode", "16:9 aspect ratio"]
        communication_style?: string[];   // e.g., ["Concise responses", "Use code blocks"]
        workflow_patterns?: string[];
    };

    // Settings UI preferences
    settingsExpandedSections?: string[]; // Remember which sections are expanded

    // TTS (Text-to-Speech) settings
    ttsEnabled?: boolean;
    ttsProvider?: "elevenlabs" | "openai" | "edge";
    ttsAutoMode?: "off" | "always" | "channels-only";
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    openaiTtsVoice?: string;
    openaiTtsModel?: string;
    ttsSummarizeThreshold?: number; // Chars above which to summarize before TTS

    // Audio Transcription (STT) settings
    sttEnabled?: boolean;
    sttProvider?: "openai" | "local";
    sttLocalModel?: string;          // Selected whisper.cpp model ID (default: "ggml-tiny.en")
    whisperCppPath?: string;         // Custom path to whisper-cli binary (auto-detected if empty)
}

const DEFAULT_SETTINGS: AppSettings = {
    llmProvider: "anthropic",
    ollamaBaseUrl: "http://localhost:11434/v1",
    localUserId: crypto.randomUUID(),
    localUserEmail: "local@zlutty.ai",
    theme: "dark",
    toolLoadingMode: "deferred",  // Default to token-efficient deferred loading
    webScraperProvider: "firecrawl",
    embeddingProvider: "openrouter",
    vectorDBEnabled: false,
    vectorSearchHybridEnabled: true,
    vectorSearchTokenChunkingEnabled: true,
    vectorSearchRerankingEnabled: false,
    vectorSearchQueryExpansionEnabled: true,
    vectorSearchLlmSynthesisEnabled: true,
    vectorSearchRrfK: 50,
    vectorSearchDenseWeight: 1.0,
    vectorSearchLexicalWeight: 2.0,
    vectorSearchRerankModel: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    vectorSearchRerankTopK: 20,
    vectorSearchTokenChunkSize: 96,
    vectorSearchTokenChunkStride: 48,
    vectorSearchMaxFileLines: 3000,
    vectorSearchMaxLineLength: 1000,
    // Local Grep defaults
    localGrepEnabled: true,
    localGrepMaxResults: 100,
    localGrepContextLines: 2,
    localGrepRespectGitignore: true,
    // ComfyUI defaults (Z-Image)
    imageGenerationProvider: "openrouter",
    comfyuiEnabled: false,
    comfyuiInstalled: false,
    comfyuiAutoStart: false,
    comfyuiPort: 8000,
    comfyuiModelsDownloaded: false,
    comfyuiBackendPath: "",
    comfyuiCustomHost: "127.0.0.1",
    comfyuiCustomPort: 8188,
    comfyuiCustomUseHttps: false,
    comfyuiCustomAutoDetect: true,
    comfyuiCustomBaseUrl: "",
    // FLUX.2 Klein 4B defaults
    flux2Klein4bEnabled: false,
    flux2Klein4bInstalled: false,
    flux2Klein4bAutoStart: false,
    flux2Klein4bModelsDownloaded: false,
    flux2Klein4bBackendPath: "",
    // FLUX.2 Klein 9B defaults
    flux2Klein9bEnabled: false,
    flux2Klein9bInstalled: false,
    flux2Klein9bAutoStart: false,
    flux2Klein9bModelsDownloaded: false,
    flux2Klein9bBackendPath: "",
    // TTS defaults
    ttsEnabled: false,
    ttsProvider: "edge",
    ttsAutoMode: "off",
    ttsSummarizeThreshold: 1500,
    openaiTtsVoice: "alloy",
    openaiTtsModel: "gpt-4o-mini-tts",
    // STT defaults
    sttEnabled: true,
    sttProvider: "openai",
    sttLocalModel: "ggml-tiny.en",
};

function getSettingsPath(): string {
    // In Electron, LOCAL_DATA_PATH is set to userDataPath/data
    if (process.env.LOCAL_DATA_PATH) {
        return join(process.env.LOCAL_DATA_PATH, "settings.json");
    }
    const dataDir = join(process.cwd(), ".local-data");
    return join(dataDir, "settings.json");
}

// Prefix-based compatibility check to clear stale model values after a provider switch.
// Uses simple prefixes to avoid circular dependencies with providers.ts.
const MODEL_PREFIXES: Record<string, string[]> = {
  anthropic: ["claude-", "claude3", "claude4"],
  kimi: ["kimi-", "moonshot-"],
  codex: ["gpt-5", "codex"],
  antigravity: ["gemini-3", "claude-sonnet-4-5", "claude-haiku-4-5"],
  ollama: [], // accepts any model name
  openrouter: [], // accepts anything
};

function normalizeModelsForProvider(settings: AppSettings): void {
  const provider = settings.llmProvider;
  if (!provider || provider === "openrouter") return;

  const prefixes = MODEL_PREFIXES[provider];
  if (!prefixes || prefixes.length === 0) return;

  const isCompatible = (model: string) =>
    prefixes.some((p) => model.toLowerCase().startsWith(p));

  const fields: (keyof AppSettings)[] = ["chatModel", "researchModel", "visionModel", "utilityModel"];
  for (const field of fields) {
    const val = settings[field];
    if (typeof val === "string" && val && !isCompatible(val)) {
      (settings as unknown as Record<string, unknown>)[field] = "";
    }
  }
}

let cachedSettings: AppSettings | null = null;
let cachedSettingsTimestamp: number = 0;
// Cache settings for 1 second to reduce disk reads while ensuring changes propagate quickly
const SETTINGS_CACHE_TTL_MS = 1000;

/**
 * Load settings from disk.
 * Uses a short-lived cache (1 second) to balance performance with responsiveness to changes.
 * The cache is automatically invalidated when saveSettings() is called.
 */
export function loadSettings(): AppSettings {
    const now = Date.now();
    const cacheValid = cachedSettings !== null && (now - cachedSettingsTimestamp) < SETTINGS_CACHE_TTL_MS;

    if (cacheValid && cachedSettings) {
        // Always update env vars even when returning cached settings
        // This ensures API keys are available in process.env across all modules
        updateEnvFromSettings(cachedSettings);
        return cachedSettings;
    }

    const settingsPath = getSettingsPath();

    if (existsSync(settingsPath)) {
        try {
            const data = readFileSync(settingsPath, "utf-8");
            const loaded: AppSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
            // Clear model fields that are incompatible with the current provider
            // This prevents stale values from a previous provider from causing fallback warnings
            normalizeModelsForProvider(loaded);
            cachedSettings = loaded;
            cachedSettingsTimestamp = now;
            // Update environment variables so providers pick up the configured API keys
            updateEnvFromSettings(loaded);
            return loaded;
        } catch (error) {
            console.error("[Settings] Error loading settings:", error);
        }
    }

    // Return defaults and save them
    const defaults: AppSettings = { ...DEFAULT_SETTINGS };
    cachedSettings = defaults;
    cachedSettingsTimestamp = now;
    saveSettings(defaults);
    return defaults;
}

/**
 * Save settings to disk
 */
export function saveSettings(settings: AppSettings): void {
    const settingsPath = getSettingsPath();

    // Ensure directory exists
    const dir = dirname(settingsPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    cachedSettings = settings;
    cachedSettingsTimestamp = Date.now();

    // Update environment variables for immediate use
    updateEnvFromSettings(settings);
}

/**
 * Update a single setting
 */
export function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
): AppSettings {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
    return settings;
}

/**
 * Get a single setting value
 */
export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    const settings = loadSettings();
    return settings[key];
}

/**
 * Update environment variables from settings
 * This allows the app to use settings values as if they were env vars
 */
function updateEnvFromSettings(settings: AppSettings): void {
    if (settings.anthropicApiKey) {
        process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
    }
    if (settings.openrouterApiKey) {
        process.env.OPENROUTER_API_KEY = settings.openrouterApiKey;
    }
    if (settings.kimiApiKey) {
        process.env.KIMI_API_KEY = settings.kimiApiKey;
    }
    if (settings.ollamaBaseUrl !== undefined) {
        process.env.OLLAMA_BASE_URL = settings.ollamaBaseUrl;
    } else {
        delete process.env.OLLAMA_BASE_URL;
    }
    if (settings.tavilyApiKey) {
        process.env.TAVILY_API_KEY = settings.tavilyApiKey;
    }
    if (settings.firecrawlApiKey) {
        process.env.FIRECRAWL_API_KEY = settings.firecrawlApiKey;
    }
    if (settings.webScraperProvider) {
        process.env.WEB_SCRAPER_PROVIDER = settings.webScraperProvider;
    }
    if (settings.stylyAiApiKey) {
        process.env.STYLY_AI_API_KEY = settings.stylyAiApiKey;
    }
    if (settings.huggingFaceToken) {
        process.env.HF_TOKEN = settings.huggingFaceToken;
    }
    if (settings.openaiApiKey) {
        process.env.OPENAI_API_KEY = settings.openaiApiKey;
    }
    process.env.LLM_PROVIDER = settings.llmProvider;

    // Model settings
    if (settings.chatModel) {
        process.env.LLM_MODEL = settings.chatModel;
    }
    if (settings.embeddingModel) {
        process.env.EMBEDDING_MODEL = settings.embeddingModel;
    }
    if (settings.embeddingProvider) {
        process.env.EMBEDDING_PROVIDER = settings.embeddingProvider;
    }
    if (settings.embeddingModelDir) {
        process.env.EMBEDDING_MODEL_DIR = settings.embeddingModelDir;
    }
    if (settings.researchModel) {
        process.env.RESEARCH_MODEL = settings.researchModel;
    }
    if (settings.visionModel) {
        process.env.VISION_MODEL = settings.visionModel;
    }
    if (settings.utilityModel) {
        process.env.UTILITY_MODEL = settings.utilityModel;
    }

    if (settings.vectorSearchHybridEnabled !== undefined) {
        process.env.VECTOR_SEARCH_HYBRID = settings.vectorSearchHybridEnabled ? "true" : "false";
    }
    if (settings.vectorSearchTokenChunkingEnabled !== undefined) {
        process.env.VECTOR_SEARCH_TOKEN_CHUNKING = settings.vectorSearchTokenChunkingEnabled ? "true" : "false";
    }
    if (settings.vectorSearchRerankingEnabled !== undefined) {
        process.env.VECTOR_SEARCH_RERANKING = settings.vectorSearchRerankingEnabled ? "true" : "false";
    }
    if (settings.vectorSearchQueryExpansionEnabled !== undefined) {
        process.env.VECTOR_SEARCH_QUERY_EXPANSION = settings.vectorSearchQueryExpansionEnabled ? "true" : "false";
    }
    if (settings.vectorSearchLlmSynthesisEnabled !== undefined) {
        process.env.VECTOR_SEARCH_LLM_SYNTHESIS = settings.vectorSearchLlmSynthesisEnabled ? "true" : "false";
    }

    if (settings.vectorSearchRrfK !== undefined) {
        process.env.VECTOR_SEARCH_RRF_K = String(settings.vectorSearchRrfK);
    }
    if (settings.vectorSearchDenseWeight !== undefined) {
        process.env.VECTOR_SEARCH_DENSE_WEIGHT = String(settings.vectorSearchDenseWeight);
    }
    if (settings.vectorSearchLexicalWeight !== undefined) {
        process.env.VECTOR_SEARCH_LEXICAL_WEIGHT = String(settings.vectorSearchLexicalWeight);
    }
    if (settings.vectorSearchRerankModel) {
        process.env.VECTOR_SEARCH_RERANK_MODEL = settings.vectorSearchRerankModel;
    }
    if (settings.vectorSearchRerankTopK !== undefined) {
        process.env.VECTOR_SEARCH_RERANK_TOPK = String(settings.vectorSearchRerankTopK);
    }
    if (settings.vectorSearchTokenChunkSize !== undefined) {
        process.env.VECTOR_SEARCH_TOKEN_CHUNK_SIZE = String(settings.vectorSearchTokenChunkSize);
    }
    if (settings.vectorSearchTokenChunkStride !== undefined) {
        process.env.VECTOR_SEARCH_TOKEN_CHUNK_STRIDE = String(settings.vectorSearchTokenChunkStride);
    }
    if (settings.vectorSearchMaxFileLines !== undefined) {
        process.env.VECTOR_SEARCH_MAX_FILE_LINES = String(settings.vectorSearchMaxFileLines);
    }
    if (settings.vectorSearchMaxLineLength !== undefined) {
        process.env.VECTOR_SEARCH_MAX_LINE_LENGTH = String(settings.vectorSearchMaxLineLength);
    }

    // ComfyUI settings
    if (settings.imageGenerationProvider) {
        process.env.IMAGE_GENERATION_PROVIDER = settings.imageGenerationProvider;
    }
    if (settings.comfyuiEnabled) {
        process.env.COMFYUI_LOCAL_ENABLED = "true";
    } else {
        delete process.env.COMFYUI_LOCAL_ENABLED;
    }
    if (settings.comfyuiPort) {
        process.env.COMFYUI_PORT = String(settings.comfyuiPort);
    }
    if (settings.comfyuiBackendPath) {
        process.env.COMFYUI_BACKEND_PATH = settings.comfyuiBackendPath;
    }
    if (settings.comfyuiCustomHost) {
        process.env.COMFYUI_CUSTOM_HOST = settings.comfyuiCustomHost;
    }
    if (settings.comfyuiCustomPort !== undefined) {
        process.env.COMFYUI_CUSTOM_PORT = String(settings.comfyuiCustomPort);
    }
    if (settings.comfyuiCustomUseHttps !== undefined) {
        process.env.COMFYUI_CUSTOM_HTTPS = settings.comfyuiCustomUseHttps ? "true" : "false";
    }
    if (settings.comfyuiCustomAutoDetect !== undefined) {
        process.env.COMFYUI_CUSTOM_AUTODETECT = settings.comfyuiCustomAutoDetect ? "true" : "false";
    }
    if (settings.comfyuiCustomBaseUrl) {
        process.env.COMFYUI_CUSTOM_BASE_URL = settings.comfyuiCustomBaseUrl;
    }

    // TTS/STT settings
    if (settings.elevenLabsApiKey) {
        process.env.ELEVENLABS_API_KEY = settings.elevenLabsApiKey;
    }

    loadConfigFromEnv();
}

/**
 * Check if required API keys are configured
 */
export function hasRequiredApiKeys(): boolean {
    const settings = loadSettings();

    // Need at least one LLM provider key
    if (settings.llmProvider === "anthropic" && !settings.anthropicApiKey) {
        return false;
    }
    if (settings.llmProvider === "openrouter" && !settings.openrouterApiKey) {
        return false;
    }
    // Antigravity requires OAuth authentication, not an API key
    if (settings.llmProvider === "antigravity" && !settings.antigravityAuth?.isAuthenticated) {
        return false;
    }
    // Codex requires OAuth authentication, not an API key
    if (settings.llmProvider === "codex" && !settings.codexAuth?.isAuthenticated) {
        return false;
    }
    // Kimi requires an API key from Moonshot
    if (settings.llmProvider === "kimi" && !settings.kimiApiKey) {
        return false;
    }
    // Ollama runs locally and does not require an API key
    if (settings.llmProvider === "ollama") {
        return true;
    }

    return true;
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): AppSettings {
    cachedSettings = null;
    const settings = { ...DEFAULT_SETTINGS, localUserId: crypto.randomUUID() };
    saveSettings(settings);
    return settings;
}

/**
 * Invalidate the settings cache to force a fresh read from disk.
 * Call this when settings may have been modified by another process or request.
 */
export function invalidateSettingsCache(): void {
    cachedSettings = null;
    cachedSettingsTimestamp = 0;
}

/**
 * Initialize settings on app startup
 */
export function initializeSettings(): void {
    const settings = loadSettings();
    updateEnvFromSettings(settings);
    console.log("[Settings] Initialized with provider:", settings.llmProvider);
}
