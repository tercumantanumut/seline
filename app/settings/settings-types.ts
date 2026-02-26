import { DEFAULT_WHISPER_MODEL } from "@/lib/config/whisper-models";

export interface AppSettings {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode";
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  kimiApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  tavilyApiKey?: string;
  firecrawlApiKey?: string;
  webScraperProvider?: "firecrawl" | "local";
  webSearchProvider?: "tavily" | "duckduckgo" | "auto";
  stylyAiApiKey?: string;
  huggingFaceToken?: string;
  chatModel?: string;
  embeddingProvider?: "openrouter" | "local";
  embeddingModel?: string;
  researchModel?: string;
  visionModel?: string;
  utilityModel?: string;
  embeddingReindexRequired?: boolean;
  theme: "dark" | "light" | "system";
  localUserId: string;
  localUserEmail: string;
  promptCachingEnabled?: boolean;
  postEditHooksPreset?: "off" | "fast" | "strict";
  postEditHooksEnabled?: boolean;
  postEditTypecheckEnabled?: boolean;
  postEditLintEnabled?: boolean;
  postEditTypecheckScope?: "auto" | "app" | "lib" | "electron" | "tooling" | "all";
  postEditRunInPatchTool?: boolean;
  rtkEnabled?: boolean;
  rtkInstalled?: boolean;
  rtkVerbosity?: 0 | 1 | 2 | 3;
  rtkUltraCompact?: boolean;
  vectorDBEnabled?: boolean;
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
  comfyuiCustomHost?: string;
  comfyuiCustomPort?: number;
  comfyuiCustomUseHttps?: boolean;
  comfyuiCustomAutoDetect?: boolean;
  comfyuiCustomBaseUrl?: string;
  // Antigravity auth state (read-only, managed via OAuth)
  antigravityAuth?: {
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  };
  codexAuth?: {
    isAuthenticated: boolean;
    email?: string;
    accountId?: string;
    expiresAt?: number;
  };
}

export type SettingsSection = "api-keys" | "models" | "vector-search" | "comfyui" | "preferences" | "memory" | "mcp" | "plugins" | "voice";

export interface FormState {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode";
  anthropicApiKey: string;
  openrouterApiKey: string;
  kimiApiKey: string;
  openaiApiKey: string;
  ollamaBaseUrl: string;
  tavilyApiKey: string;
  firecrawlApiKey: string;
  webScraperProvider: "firecrawl" | "local";
  webSearchProvider: "tavily" | "duckduckgo" | "auto";
  stylyAiApiKey: string;
  huggingFaceToken: string;
  chatModel: string;
  embeddingProvider: "openrouter" | "local";
  embeddingModel: string;
  researchModel: string;
  visionModel: string;
  utilityModel: string;
  openrouterArgs: string;
  theme: "dark" | "light" | "system";
  toolLoadingMode: "deferred" | "always";
  postEditHooksPreset: "off" | "fast" | "strict";
  postEditHooksEnabled: boolean;
  postEditTypecheckEnabled: boolean;
  postEditLintEnabled: boolean;
  postEditTypecheckScope: "auto" | "app" | "lib" | "electron" | "tooling" | "all";
  postEditRunInPatchTool: boolean;
  promptCachingEnabled: boolean;
  rtkEnabled: boolean;
  rtkVerbosity: 0 | 1 | 2 | 3;
  rtkUltraCompact: boolean;
  devWorkspaceEnabled: boolean;
  devWorkspaceAutoCleanup: boolean;
  devWorkspaceAutoCleanupDays: number;
  embeddingReindexRequired: boolean;
  vectorDBEnabled: boolean;
  vectorSearchHybridEnabled: boolean;
  vectorSearchTokenChunkingEnabled: boolean;
  vectorSearchRerankingEnabled: boolean;
  vectorSearchQueryExpansionEnabled: boolean;
  vectorSearchLlmSynthesisEnabled: boolean;

  vectorSearchRrfK: number;
  vectorSearchDenseWeight: number;
  vectorSearchLexicalWeight: number;
  vectorSearchRerankModel: string;
  vectorSearchRerankTopK: number;
  vectorSearchTokenChunkSize: number;
  vectorSearchTokenChunkStride: number;
  vectorSearchMaxFileLines: number;
  vectorSearchMaxLineLength: number;
  // Local Grep settings
  localGrepEnabled: boolean;
  localGrepMaxResults: number;
  localGrepContextLines: number;
  localGrepRespectGitignore: boolean;
  // Local image generation settings
  comfyuiEnabled: boolean;
  comfyuiBackendPath: string;
  flux2Klein4bEnabled: boolean;
  flux2Klein4bBackendPath: string;
  flux2Klein9bEnabled: boolean;
  flux2Klein9bBackendPath: string;
  comfyuiCustomHost: string;
  comfyuiCustomPort: number;
  comfyuiCustomUseHttps: boolean;
  comfyuiCustomAutoDetect: boolean;
  comfyuiCustomBaseUrl: string;
  // Voice & Audio settings
  ttsEnabled: boolean;
  ttsProvider: "elevenlabs" | "openai" | "edge";
  ttsAutoMode: "off" | "always" | "channels-only";
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  openaiTtsVoice: string;
  ttsSummarizeThreshold: number;
  sttEnabled: boolean;
  sttProvider: "openai" | "local";
  sttLocalModel: string;
}

export const DEFAULT_FORM_STATE: FormState = {
  llmProvider: "anthropic",
  anthropicApiKey: "",
  openrouterApiKey: "",
  kimiApiKey: "",
  openaiApiKey: "",
  ollamaBaseUrl: "http://localhost:11434/v1",
  tavilyApiKey: "",
  firecrawlApiKey: "",
  webScraperProvider: "local",
  webSearchProvider: "auto",
  stylyAiApiKey: "",
  huggingFaceToken: "",
  chatModel: "",
  embeddingProvider: "openrouter",
  embeddingModel: "",
  researchModel: "",
  visionModel: "",
  utilityModel: "",
  openrouterArgs: "{}",
  theme: "dark",
  toolLoadingMode: "deferred",
  postEditHooksPreset: "off",
  postEditHooksEnabled: false,
  postEditTypecheckEnabled: false,
  postEditLintEnabled: false,
  postEditTypecheckScope: "auto",
  postEditRunInPatchTool: false,
  promptCachingEnabled: true,
  rtkEnabled: false,
  rtkVerbosity: 0,
  rtkUltraCompact: false,
  devWorkspaceEnabled: false,
  devWorkspaceAutoCleanup: true,
  devWorkspaceAutoCleanupDays: 7,
  embeddingReindexRequired: false,
  vectorDBEnabled: false,
  vectorSearchHybridEnabled: false,
  vectorSearchTokenChunkingEnabled: false,
  vectorSearchRerankingEnabled: false,
  vectorSearchQueryExpansionEnabled: false,
  vectorSearchLlmSynthesisEnabled: true,
  vectorSearchRrfK: 30,
  vectorSearchDenseWeight: 1.5,
  vectorSearchLexicalWeight: 0.2,
  vectorSearchRerankModel: "cross-encoder/ms-marco-MiniLM-L-6-v2",
  vectorSearchRerankTopK: 20,
  vectorSearchTokenChunkSize: 16,
  vectorSearchTokenChunkStride: 8,
  vectorSearchMaxFileLines: 3000,
  vectorSearchMaxLineLength: 1000,
  localGrepEnabled: true,
  localGrepMaxResults: 20,
  localGrepContextLines: 2,
  localGrepRespectGitignore: true,
  comfyuiEnabled: false,
  comfyuiBackendPath: "",
  flux2Klein4bEnabled: false,
  flux2Klein4bBackendPath: "",
  flux2Klein9bEnabled: false,
  flux2Klein9bBackendPath: "",
  comfyuiCustomHost: "127.0.0.1",
  comfyuiCustomPort: 8188,
  comfyuiCustomUseHttps: false,
  comfyuiCustomAutoDetect: true,
  comfyuiCustomBaseUrl: "",
  ttsEnabled: true,
  ttsProvider: "edge",
  ttsAutoMode: "off",
  elevenLabsApiKey: "",
  elevenLabsVoiceId: "",
  openaiTtsVoice: "alloy",
  ttsSummarizeThreshold: 500,
  sttEnabled: true,
  sttProvider: "local",
  sttLocalModel: DEFAULT_WHISPER_MODEL,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFormStateFromData(data: Record<string, any>): FormState {
  return {
    llmProvider: data.llmProvider || "anthropic",
    anthropicApiKey: data.anthropicApiKey || "",
    openrouterApiKey: data.openrouterApiKey || "",
    kimiApiKey: data.kimiApiKey || "",
    openaiApiKey: data.openaiApiKey || "",
    ollamaBaseUrl: data.ollamaBaseUrl || "http://localhost:11434/v1",
    tavilyApiKey: data.tavilyApiKey || "",
    firecrawlApiKey: data.firecrawlApiKey || "",
    webScraperProvider: data.webScraperProvider || "local",
    webSearchProvider: data.webSearchProvider || "auto",
    stylyAiApiKey: data.stylyAiApiKey || "",
    huggingFaceToken: data.huggingFaceToken || "",
    chatModel: data.chatModel || "",
    embeddingProvider: data.embeddingProvider || "openrouter",
    embeddingModel: data.embeddingModel || "",
    researchModel: data.researchModel || "",
    visionModel: data.visionModel || "",
    utilityModel: data.utilityModel || "",
    openrouterArgs: data.openrouterArgs || "{}",
    theme: data.theme || "dark",
    toolLoadingMode: data.toolLoadingMode || "deferred",
    postEditHooksPreset: data.postEditHooksPreset ?? "off",
    postEditHooksEnabled: data.postEditHooksEnabled ?? false,
    postEditTypecheckEnabled: data.postEditTypecheckEnabled ?? false,
    postEditLintEnabled: data.postEditLintEnabled ?? false,
    postEditTypecheckScope: data.postEditTypecheckScope ?? "auto",
    postEditRunInPatchTool: data.postEditRunInPatchTool ?? false,
    promptCachingEnabled: data.promptCachingEnabled ?? true,
    rtkEnabled: data.rtkEnabled ?? false,
    rtkVerbosity: data.rtkVerbosity ?? 0,
    rtkUltraCompact: data.rtkUltraCompact ?? false,
    devWorkspaceEnabled: data.devWorkspaceEnabled ?? false,
    devWorkspaceAutoCleanup: data.devWorkspaceAutoCleanup ?? true,
    devWorkspaceAutoCleanupDays: data.devWorkspaceAutoCleanupDays ?? 7,
    embeddingReindexRequired: data.embeddingReindexRequired ?? false,
    vectorDBEnabled: data.vectorDBEnabled || false,
    vectorSearchHybridEnabled: data.vectorSearchHybridEnabled ?? false,
    vectorSearchTokenChunkingEnabled: data.vectorSearchTokenChunkingEnabled ?? false,
    vectorSearchRerankingEnabled: data.vectorSearchRerankingEnabled ?? false,
    vectorSearchQueryExpansionEnabled: data.vectorSearchQueryExpansionEnabled ?? false,
    vectorSearchLlmSynthesisEnabled: data.vectorSearchLlmSynthesisEnabled ?? true,
    vectorSearchRrfK: data.vectorSearchRrfK ?? 30,
    vectorSearchDenseWeight: data.vectorSearchDenseWeight ?? 1.5,
    vectorSearchLexicalWeight: data.vectorSearchLexicalWeight ?? 0.2,
    vectorSearchRerankModel: data.vectorSearchRerankModel ?? "cross-encoder/ms-marco-MiniLM-L-6-v2",
    vectorSearchRerankTopK: data.vectorSearchRerankTopK ?? 20,
    vectorSearchTokenChunkSize: data.vectorSearchTokenChunkSize ?? 16,
    vectorSearchTokenChunkStride: data.vectorSearchTokenChunkStride ?? 8,
    vectorSearchMaxFileLines: data.vectorSearchMaxFileLines ?? 3000,
    vectorSearchMaxLineLength: data.vectorSearchMaxLineLength ?? 1000,
    localGrepEnabled: data.localGrepEnabled ?? true,
    localGrepMaxResults: data.localGrepMaxResults ?? 20,
    localGrepContextLines: data.localGrepContextLines ?? 2,
    localGrepRespectGitignore: data.localGrepRespectGitignore ?? true,
    comfyuiEnabled: data.comfyuiEnabled ?? false,
    comfyuiBackendPath: data.comfyuiBackendPath ?? "",
    flux2Klein4bEnabled: data.flux2Klein4bEnabled ?? false,
    flux2Klein4bBackendPath: data.flux2Klein4bBackendPath ?? "",
    flux2Klein9bEnabled: data.flux2Klein9bEnabled ?? false,
    flux2Klein9bBackendPath: data.flux2Klein9bBackendPath ?? "",
    comfyuiCustomHost: data.comfyuiCustomHost ?? "127.0.0.1",
    comfyuiCustomPort: data.comfyuiCustomPort ?? 8188,
    comfyuiCustomUseHttps: data.comfyuiCustomUseHttps ?? false,
    comfyuiCustomAutoDetect: data.comfyuiCustomAutoDetect ?? true,
    comfyuiCustomBaseUrl: data.comfyuiCustomBaseUrl ?? "",
    ttsEnabled: data.ttsEnabled ?? true,
    ttsProvider: data.ttsProvider ?? "edge",
    ttsAutoMode: data.ttsAutoMode ?? "off",
    elevenLabsApiKey: data.elevenLabsApiKey ?? "",
    elevenLabsVoiceId: data.elevenLabsVoiceId ?? "",
    openaiTtsVoice: data.openaiTtsVoice ?? "alloy",
    ttsSummarizeThreshold: data.ttsSummarizeThreshold ?? 500,
    sttEnabled: data.sttEnabled ?? true,
    sttProvider: data.sttProvider ?? "local",
    sttLocalModel: data.sttLocalModel ?? DEFAULT_WHISPER_MODEL,
  };
}
