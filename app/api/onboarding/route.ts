import { NextResponse } from "next/server";
import {
    loadSettings,
    saveSettings,
    hasRequiredApiKeys
} from "@/lib/settings/settings-manager";

/**
 * GET /api/onboarding - Check onboarding state
 */
export async function GET() {
    const settings = loadSettings();

    let missingProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | null = null;

    if (settings.llmProvider === "anthropic" && !settings.anthropicApiKey) {
        missingProvider = "anthropic";
    } else if (settings.llmProvider === "openrouter" && !settings.openrouterApiKey) {
        missingProvider = "openrouter";
    } else if (settings.llmProvider === "antigravity" && !settings.antigravityAuth?.isAuthenticated) {
        missingProvider = "antigravity";
    } else if (settings.llmProvider === "codex" && !settings.codexAuth?.isAuthenticated) {
        missingProvider = "codex";
    } else if (settings.llmProvider === "kimi" && !settings.kimiApiKey) {
        missingProvider = "kimi";
    } else if (settings.llmProvider === "ollama") {
        missingProvider = null;
    }

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
        const body = await request.json();
        const settings = loadSettings();

        // Apply any initial preferences from onboarding
        if (body.globalMemoryDefaults) {
            settings.globalMemoryDefaults = body.globalMemoryDefaults;
        }

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
