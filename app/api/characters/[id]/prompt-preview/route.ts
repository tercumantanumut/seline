import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getCharacterFull } from "@/lib/characters/queries";
import { buildCharacterSystemPrompt } from "@/lib/ai/character-prompt";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Generate and return the current system prompt for a character
 * This shows what the auto-generated prompt looks like before any override
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    // Get full character data
    const character = await getCharacterFull(id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Check ownership
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Temporarily remove the override to generate the base prompt
    const originalMetadata = character.metadata;
    const metadataWithoutOverride = {
      ...(originalMetadata as Record<string, any>),
      systemPromptOverride: undefined,
    };
    const characterForPreview = {
      ...character,
      metadata: metadataWithoutOverride,
    };

    // Generate the prompt
    const prompt = buildCharacterSystemPrompt(characterForPreview, {
      toolLoadingMode: settings.toolLoadingMode || "deferred",
    });

    return NextResponse.json({
      prompt,
      hasOverride: !!(originalMetadata as any)?.systemPromptOverride,
    });
  } catch (error) {
    console.error("Get prompt preview error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate prompt preview" },
      { status: 500 }
    );
  }
}
