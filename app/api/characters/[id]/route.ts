import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getCharacter,
  getCharacterFull,
  updateCharacter,
  deleteCharacter,
} from "@/lib/characters/queries";
import {
  updateCharacterSchema,
  agentMetadataSchema,
} from "@/lib/characters/validation";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

// GET - Get a single character with all related data
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const character = await getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Check ownership
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get full character with all related data
    const fullCharacter = await getCharacterFull(id);

    return NextResponse.json({ character: fullCharacter });
  } catch (error) {
    console.error("Get character error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get character" },
      { status: 500 }
    );
  }
}

// Update schema for PATCH - includes metadata for B2B agent configuration
const updateSchema = z.object({
  character: updateCharacterSchema.optional(),
  // B2B agent metadata (enabledTools, purpose, etc.)
  metadata: agentMetadataSchema.optional(),
});

// PATCH - Update a character
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    // Check ownership
    const existing = await getCharacter(id);
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (existing.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.isDefault) {
      return NextResponse.json({ error: "Default agent cannot be deleted" }, { status: 400 });
    }

    const body = await req.json();
    const parseResult = updateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { character: charData, metadata } = parseResult.data;

    // Update in parallel
    const promises: Promise<unknown>[] = [];

    // Handle character data and metadata updates
    if (charData || metadata) {
      const updateData: Parameters<typeof updateCharacter>[1] = { ...charData };
      if (metadata) {
        // Merge metadata with existing metadata
        const existingMetadata = (existing.metadata as Record<string, unknown>) ?? {};
        (updateData as { metadata?: Record<string, unknown> }).metadata = { ...existingMetadata, ...metadata };
      }
      promises.push(updateCharacter(id, updateData));
    }

    await Promise.all(promises);

    const updated = await getCharacterFull(id);
    return NextResponse.json({ success: true, character: updated });
  } catch (error) {
    console.error("Update character error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update character" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a character
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const existing = await getCharacter(id);
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (existing.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteCharacter(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete character error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete character" },
      { status: 500 }
    );
  }
}
