import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings/settings-manager";

/**
 * GET /api/settings
 * Returns current application settings
 */
export async function GET() {
  try {
    const settings = loadSettings();
    // Don't expose full API keys - mask them for display
    const maskedSettings = {
      ...settings,
      anthropicApiKey: settings.anthropicApiKey ? maskApiKey(settings.anthropicApiKey) : undefined,
      openrouterApiKey: settings.openrouterApiKey ? maskApiKey(settings.openrouterApiKey) : undefined,
      kimiApiKey: settings.kimiApiKey ? maskApiKey(settings.kimiApiKey) : undefined,
      tavilyApiKey: settings.tavilyApiKey ? maskApiKey(settings.tavilyApiKey) : undefined,
      firecrawlApiKey: settings.firecrawlApiKey ? maskApiKey(settings.firecrawlApiKey) : undefined,
      stylyAiApiKey: settings.stylyAiApiKey ? maskApiKey(settings.stylyAiApiKey) : undefined,
      huggingFaceToken: settings.huggingFaceToken ? maskApiKey(settings.huggingFaceToken) : undefined,
    };
    return NextResponse.json(maskedSettings);
  } catch (error) {
    console.error("[Settings API] Error loading settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * Updates application settings
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentSettings = loadSettings();

    // Build updated settings, preserving API keys if not explicitly changed
    const updatedSettings: AppSettings = {
      ...currentSettings,
      llmProvider: body.llmProvider ?? currentSettings.llmProvider,
      theme: body.theme ?? currentSettings.theme,
      webScraperProvider: body.webScraperProvider ?? currentSettings.webScraperProvider,
      // Model settings - allow empty string to clear, undefined to keep current
      chatModel: body.chatModel !== undefined ? body.chatModel : currentSettings.chatModel,
      embeddingProvider: body.embeddingProvider !== undefined ? body.embeddingProvider : currentSettings.embeddingProvider,
      embeddingModel: body.embeddingModel !== undefined ? body.embeddingModel : currentSettings.embeddingModel,
      researchModel: body.researchModel !== undefined ? body.researchModel : currentSettings.researchModel,
      visionModel: body.visionModel !== undefined ? body.visionModel : currentSettings.visionModel,
      utilityModel: body.utilityModel !== undefined ? body.utilityModel : currentSettings.utilityModel,
      embeddingReindexRequired: body.embeddingReindexRequired !== undefined
        ? body.embeddingReindexRequired
        : currentSettings.embeddingReindexRequired,
      // Vector search settings - use explicit check for boolean
      vectorDBEnabled: body.vectorDBEnabled !== undefined ? body.vectorDBEnabled : currentSettings.vectorDBEnabled,
      vectorAutoSyncEnabled: body.vectorAutoSyncEnabled !== undefined ? body.vectorAutoSyncEnabled : currentSettings.vectorAutoSyncEnabled,
      vectorSyncIntervalMinutes: body.vectorSyncIntervalMinutes !== undefined ? body.vectorSyncIntervalMinutes : currentSettings.vectorSyncIntervalMinutes,
      vectorSearchHybridEnabled: body.vectorSearchHybridEnabled !== undefined ? body.vectorSearchHybridEnabled : currentSettings.vectorSearchHybridEnabled,
      vectorSearchTokenChunkingEnabled: body.vectorSearchTokenChunkingEnabled !== undefined ? body.vectorSearchTokenChunkingEnabled : currentSettings.vectorSearchTokenChunkingEnabled,
      vectorSearchRerankingEnabled: body.vectorSearchRerankingEnabled !== undefined ? body.vectorSearchRerankingEnabled : currentSettings.vectorSearchRerankingEnabled,
      vectorSearchQueryExpansionEnabled: body.vectorSearchQueryExpansionEnabled !== undefined ? body.vectorSearchQueryExpansionEnabled : currentSettings.vectorSearchQueryExpansionEnabled,
      vectorSearchLlmSynthesisEnabled: body.vectorSearchLlmSynthesisEnabled !== undefined ? body.vectorSearchLlmSynthesisEnabled : currentSettings.vectorSearchLlmSynthesisEnabled,

      vectorSearchRrfK: body.vectorSearchRrfK !== undefined ? body.vectorSearchRrfK : currentSettings.vectorSearchRrfK,
      vectorSearchDenseWeight: body.vectorSearchDenseWeight !== undefined ? body.vectorSearchDenseWeight : currentSettings.vectorSearchDenseWeight,
      vectorSearchLexicalWeight: body.vectorSearchLexicalWeight !== undefined ? body.vectorSearchLexicalWeight : currentSettings.vectorSearchLexicalWeight,
      vectorSearchRerankModel: body.vectorSearchRerankModel !== undefined ? body.vectorSearchRerankModel : currentSettings.vectorSearchRerankModel,
      vectorSearchRerankTopK: body.vectorSearchRerankTopK !== undefined ? body.vectorSearchRerankTopK : currentSettings.vectorSearchRerankTopK,
      vectorSearchTokenChunkSize: body.vectorSearchTokenChunkSize !== undefined ? body.vectorSearchTokenChunkSize : currentSettings.vectorSearchTokenChunkSize,
      vectorSearchTokenChunkStride: body.vectorSearchTokenChunkStride !== undefined ? body.vectorSearchTokenChunkStride : currentSettings.vectorSearchTokenChunkStride,
      vectorSearchMaxFileLines: body.vectorSearchMaxFileLines !== undefined ? body.vectorSearchMaxFileLines : currentSettings.vectorSearchMaxFileLines,
      vectorSearchMaxLineLength: body.vectorSearchMaxLineLength !== undefined ? body.vectorSearchMaxLineLength : currentSettings.vectorSearchMaxLineLength,
      // Preferences
      toolLoadingMode: body.toolLoadingMode !== undefined ? body.toolLoadingMode : currentSettings.toolLoadingMode,
      promptCachingEnabled: body.promptCachingEnabled !== undefined ? body.promptCachingEnabled : currentSettings.promptCachingEnabled,
      promptCachingTtl: body.promptCachingTtl !== undefined ? body.promptCachingTtl : currentSettings.promptCachingTtl,
      // ComfyUI / Local Image Generation
      comfyuiEnabled: body.comfyuiEnabled !== undefined ? body.comfyuiEnabled : currentSettings.comfyuiEnabled,
      comfyuiBackendPath: body.comfyuiBackendPath !== undefined ? body.comfyuiBackendPath : currentSettings.comfyuiBackendPath,
      comfyuiCustomHost: body.comfyuiCustomHost !== undefined ? body.comfyuiCustomHost : currentSettings.comfyuiCustomHost,
      comfyuiCustomPort: body.comfyuiCustomPort !== undefined ? body.comfyuiCustomPort : currentSettings.comfyuiCustomPort,
      comfyuiCustomUseHttps: body.comfyuiCustomUseHttps !== undefined ? body.comfyuiCustomUseHttps : currentSettings.comfyuiCustomUseHttps,
      comfyuiCustomAutoDetect: body.comfyuiCustomAutoDetect !== undefined ? body.comfyuiCustomAutoDetect : currentSettings.comfyuiCustomAutoDetect,
      comfyuiCustomBaseUrl: body.comfyuiCustomBaseUrl !== undefined ? body.comfyuiCustomBaseUrl : currentSettings.comfyuiCustomBaseUrl,
      // FLUX.2 Klein 4B
      flux2Klein4bEnabled: body.flux2Klein4bEnabled !== undefined ? body.flux2Klein4bEnabled : currentSettings.flux2Klein4bEnabled,
      flux2Klein4bBackendPath: body.flux2Klein4bBackendPath !== undefined ? body.flux2Klein4bBackendPath : currentSettings.flux2Klein4bBackendPath,
      // FLUX.2 Klein 9B
      flux2Klein9bEnabled: body.flux2Klein9bEnabled !== undefined ? body.flux2Klein9bEnabled : currentSettings.flux2Klein9bEnabled,
      flux2Klein9bBackendPath: body.flux2Klein9bBackendPath !== undefined ? body.flux2Klein9bBackendPath : currentSettings.flux2Klein9bBackendPath,
    };

    // Only update API keys if they're provided and not masked
    if (body.anthropicApiKey && !body.anthropicApiKey.includes("•")) {
      updatedSettings.anthropicApiKey = body.anthropicApiKey;
    }

    if (body.openrouterApiKey && !body.openrouterApiKey.includes("•")) {
      updatedSettings.openrouterApiKey = body.openrouterApiKey;
    }
    if (body.kimiApiKey && !body.kimiApiKey.includes("•")) {
      updatedSettings.kimiApiKey = body.kimiApiKey;
    }
    if (body.tavilyApiKey && !body.tavilyApiKey.includes("•")) {
      updatedSettings.tavilyApiKey = body.tavilyApiKey;
    }
    if (body.firecrawlApiKey && !body.firecrawlApiKey.includes("•")) {
      updatedSettings.firecrawlApiKey = body.firecrawlApiKey;
    }
    if (body.stylyAiApiKey && !body.stylyAiApiKey.includes("•")) {
      updatedSettings.stylyAiApiKey = body.stylyAiApiKey;
    }
    if (body.huggingFaceToken && !body.huggingFaceToken.includes("•")) {
      updatedSettings.huggingFaceToken = body.huggingFaceToken;
    }

    const embeddingConfigChanged = (
      (currentSettings.embeddingProvider || "openrouter") !== (updatedSettings.embeddingProvider || "openrouter") ||
      (currentSettings.embeddingModel || "") !== (updatedSettings.embeddingModel || "")
    );

    if (embeddingConfigChanged) {
      updatedSettings.embeddingReindexRequired = true;
    }

    saveSettings(updatedSettings);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings API] Error saving settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

