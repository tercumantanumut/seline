import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  createCharacter,
  getUserCharacters,
  createCharacterImage,
} from "@/lib/characters/queries";
import { ensureDefaultAgentExists } from "@/lib/characters/templates";
import {
  createCharacterSchema,
  agentMetadataSchema,
} from "@/lib/characters/validation";
import { z } from "zod";

// Full character creation schema - includes optional previewImageUrl and metadata
const fullCharacterSchema = z.object({
  character: createCharacterSchema,
  // B2B agent metadata (enabledTools, purpose, etc.)
  metadata: agentMetadataSchema.optional(),
  // Optional image URL/path from character creation flow
  previewImageUrl: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageSeed: z.number().optional(),
});

// GET - List user's characters
export async function GET(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    await ensureDefaultAgentExists(dbUser.id);
    const characterList = await getUserCharacters(dbUser.id);

    return NextResponse.json({ characters: characterList });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get characters";
    // Return 401 for auth errors so frontend can handle them properly
    if (message === "Unauthorized" || message === "Invalid session") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("Get characters error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Create a new character with all related data
export async function POST(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const body = await req.json();

    // Validate input
    const parseResult = fullCharacterSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      character: charData,
      metadata,
      previewImageUrl,
      imagePrompt,
      imageSeed,
    } = parseResult.data;

    // Create the main character with optional metadata
    const character = await createCharacter({
      ...charData,
      userId: dbUser.id,
      status: "active",
      metadata: metadata ?? {},
    });

    // Create related data
    const promises: Promise<unknown>[] = [];

    // Save the preview image if provided
    if (previewImageUrl) {
      let localPath = previewImageUrl;
      if (previewImageUrl.startsWith("/api/media/")) {
        localPath = previewImageUrl.replace("/api/media/", "");
      } else if (previewImageUrl.startsWith("local-media://")) {
        localPath = previewImageUrl.replace("local-media://", "").replace(/^\/+/, "");
      } else if (previewImageUrl.startsWith("http")) {
        const urlParts = new URL(previewImageUrl);
        localPath = urlParts.pathname.slice(1);
      }

      promises.push(createCharacterImage({
        characterId: character.id,
        imageType: "portrait",
        isPrimary: true,
        localPath,
        url: previewImageUrl,
        prompt: imagePrompt,
        seed: imageSeed,
        generationModel: "flux2",
      }));
    }

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      character,
    });
  } catch (error) {
    console.error("Create character error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create character" },
      { status: 500 }
    );
  }
}
