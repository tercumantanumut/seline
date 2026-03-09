import { NextResponse } from "next/server";
import {
    loadSettings,
    saveSettings,
    hasRequiredApiKeys,
} from "@/lib/settings/settings-manager";
import { invalidateProviderCache } from "@/lib/ai/providers";
import { getClaudeCodeAuthState, getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";

const VALID_LLM_PROVIDERS = new Set([
    "anthropic",
    "openrouter",
    "antigravity",
    "codex",
    "kimi",
    "ollama",
    "claudecode",
] as const);

function isValidLlmProvider(provider: unknown): provider is "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode" {
    return typeof provider === "string" && VALID_LLM_PROVIDERS.has(provider as never);
}

function clearProviderBoundModels(settings: ReturnType<typeof loadSettings>) {
    settings.chatModel = "";
    settings.researchModel = "";
    settings.visionModel = "";
    settings.utilityModel = "";
}

async function detectMissingProvider(settings: ReturnType<typeof loadSettings>): Promise<"anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "claudecode" | null> {
    if (settings.llmProvider === "claudecode") {
        const cachedState = getClaudeCodeAuthState();
        if (cachedState.isAuthenticated || settings.claudecodeAuth?.isAuthenticated) {
            return null;
        }

        const status = await getClaudeCodeAuthStatus();
        if (status.authenticated) {
            return null;
        }
    }

    if (!hasRequiredApiKeys()) {
        if (settings.llmProvider === "anthropic") return "anthropic";
        if (settings.llmProvider === "openrouter") return "openrouter";
        if (settings.llmProvider === "antigravity") return "antigravity";
        if (settings.llmProvider === "codex") return "codex";
        if (settings.llmProvider === "kimi") return "kimi";
        if (settings.llmProvider === "claudecode") return "claudecode";
    }

    return null;
}

function applyOnboardingProviderSelection(settings: ReturnType<typeof loadSettings>, provider: unknown) {
    if (!isValidLlmProvider(provider)) {
        return false;
    }

    const providerIsChanging = settings.llmProvider !== provider;
    if (!providerIsChanging) {
        return false;
    }

    settings.llmProvider = provider;
    clearProviderBoundModels(settings);
    invalidateProviderCache();
    return true;
}

function applyOnboardingPreferences(settings: ReturnType<typeof loadSettings>, body: Record<string, unknown>) {
    if (body.tavilyApiKey && typeof body.tavilyApiKey === "string") {
        settings.tavilyApiKey = body.tavilyApiKey.trim();
    }

    if (body.webScraperProvider === "firecrawl" || body.webScraperProvider === "local") {
        settings.webScraperProvider = body.webScraperProvider;
    }

    if (body.firecrawlApiKey && typeof body.firecrawlApiKey === "string") {
        settings.firecrawlApiKey = body.firecrawlApiKey.trim();
    }

    // Apply path selection from onboarding
    if (body.selectedPath === "dev" || body.selectedPath === "fun") {
        settings.seleneMode = body.selectedPath;
    }

    const pathConfig = body.pathConfig as Record<string, unknown> | undefined;
    if (pathConfig) {
        // Dev path settings
        if (typeof pathConfig.devWorkspaceEnabled === "boolean") {
            settings.devWorkspaceEnabled = pathConfig.devWorkspaceEnabled;
        }
        if (pathConfig.browserAutomationEnabled === true) {
            settings.chromiumBrowserMode = "standalone";
        }
        if (
            pathConfig.postEditHooksPreset === "off" ||
            pathConfig.postEditHooksPreset === "fast" ||
            pathConfig.postEditHooksPreset === "strict"
        ) {
            settings.postEditHooksPreset = pathConfig.postEditHooksPreset;
            settings.postEditHooksEnabled = pathConfig.postEditHooksPreset !== "off";
            settings.postEditTypecheckEnabled = pathConfig.postEditHooksPreset !== "off";
            settings.postEditLintEnabled = pathConfig.postEditHooksPreset === "strict";
            settings.postEditTypecheckScope = pathConfig.postEditHooksPreset === "strict" ? "all" : "auto";
            settings.postEditRunInPatchTool = pathConfig.postEditHooksPreset === "strict";
        }
        if (typeof pathConfig.rtkEnabled === "boolean") {
            settings.rtkEnabled = pathConfig.rtkEnabled;
        }

        // Fun path settings
        if (
            pathConfig.sttProvider === "openai" ||
            pathConfig.sttProvider === "local" ||
            pathConfig.sttProvider === "parakeet"
        ) {
            settings.sttProvider = pathConfig.sttProvider;
            settings.sttEnabled = true;
        }
        if (
            pathConfig.ttsProvider === "elevenlabs" ||
            pathConfig.ttsProvider === "openai" ||
            pathConfig.ttsProvider === "edge"
        ) {
            settings.ttsProvider = pathConfig.ttsProvider;
            settings.ttsEnabled = true;
        }
        if (typeof pathConfig.edgeTtsVoice === "string" && pathConfig.edgeTtsVoice) {
            settings.edgeTtsVoice = pathConfig.edgeTtsVoice;
        }
        if (typeof pathConfig.avatar3dEnabled === "boolean") {
            settings.avatar3dEnabled = pathConfig.avatar3dEnabled;
        }
        if (typeof pathConfig.emotionDetectionEnabled === "boolean") {
            settings.emotionDetectionEnabled = pathConfig.emotionDetectionEnabled;
        }
        if (typeof pathConfig.ttsAutoReply === "boolean") {
            settings.ttsAutoMode = pathConfig.ttsAutoReply ? "always" : "off";
        }
    }
}

/**
 * GET /api/onboarding - Check onboarding state
 */
export async function GET() {
    const settings = loadSettings();
    const missingProvider = await detectMissingProvider(settings);

    return NextResponse.json({
        isComplete: settings.onboardingComplete === true,
        hasRequiredKeys: missingProvider === null,
        missingProvider,
        onboardingVersion: settings.onboardingVersion,
    });
}

/**
 * POST /api/onboarding - Complete onboarding with optional preferences
 */
export async function POST(request: Request) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const settings = loadSettings();

        applyOnboardingProviderSelection(settings, body.llmProvider);
        applyOnboardingPreferences(settings, body);

        settings.onboardingComplete = true;
        settings.onboardingCompletedAt = new Date().toISOString();
        settings.onboardingVersion = 1;

        saveSettings(settings);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Onboarding] Failed to complete onboarding:", error);
        return NextResponse.json(
            { error: "Failed to complete onboarding" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/onboarding - Reset onboarding (for testing/re-running wizard)
 */
export async function DELETE() {
    try {
        const settings = loadSettings();

        settings.onboardingComplete = false;
        settings.onboardingCompletedAt = undefined;
        settings.onboardingVersion = undefined;

        saveSettings(settings);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Onboarding] Failed to reset onboarding:", error);
        return NextResponse.json(
            { error: "Failed to reset onboarding" },
            { status: 500 }
        );
    }
}
