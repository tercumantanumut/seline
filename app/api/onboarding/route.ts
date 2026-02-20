import { NextResponse } from "next/server";
import {
    loadSettings,
    saveSettings,
    hasRequiredApiKeys,
} from "@/lib/settings/settings-manager";
import { invalidateProviderCache } from "@/lib/ai/providers";

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

function detectMissingProvider(settings: ReturnType<typeof loadSettings>): "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "claudecode" | null {
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
    if (body.globalMemoryDefaults) {
        settings.globalMemoryDefaults = body.globalMemoryDefaults as typeof settings.globalMemoryDefaults;
    }

    if (body.tavilyApiKey && typeof body.tavilyApiKey === "string") {
        settings.tavilyApiKey = body.tavilyApiKey.trim();
    }

    if (body.webScraperProvider === "firecrawl" || body.webScraperProvider === "local") {
        settings.webScraperProvider = body.webScraperProvider;
    }

    if (body.firecrawlApiKey && typeof body.firecrawlApiKey === "string") {
        settings.firecrawlApiKey = body.firecrawlApiKey.trim();
    }
}

/**
 * GET /api/onboarding - Check onboarding state
 */
export async function GET() {
    const settings = loadSettings();
    const missingProvider = detectMissingProvider(settings);

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
