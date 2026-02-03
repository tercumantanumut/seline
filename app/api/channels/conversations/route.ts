import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { db } from "@/lib/db/sqlite-client";
import { channelConversations } from "@/lib/db/sqlite-character-schema";
import { eq, desc, and } from "drizzle-orm";
import { getCharacter } from "@/lib/characters/queries";

export async function GET(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");
    const channelType = searchParams.get("channelType") || undefined;

    if (!characterId) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    const character = await getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const conditions = channelType
      ? and(eq(channelConversations.characterId, characterId), eq(channelConversations.channelType, channelType as any))
      : eq(channelConversations.characterId, characterId);

    const conversations = await db.query.channelConversations.findMany({
      where: conditions,
      with: {
        connection: true,
      },
      orderBy: desc(channelConversations.updatedAt),
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("List channel conversations error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list conversations" },
      { status: 500 }
    );
  }
}
