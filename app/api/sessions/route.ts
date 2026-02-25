import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  listSessions,
  listSessionsByCharacterId,
  listSessionsPaginated,
  getOrCreateLocalUser,
  getOrCreateCharacterSession,
} from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";

export async function GET(req: NextRequest) {
  try {
    // Get local user for offline mode
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    // Check for characterId filter in query params
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search")?.trim() || undefined;
    const channelType = (searchParams.get("channelType") as "app" | "whatsapp" | "telegram" | "slack" | "discord" | null) ?? undefined;
    const dateRange = (searchParams.get("dateRange") as "today" | "week" | "month" | "all" | null) ?? undefined;
    const statusParam = (searchParams.get("status") as "active" | "archived" | null) ?? undefined;
    const wantsPagination =
      searchParams.has("cursor") ||
      searchParams.has("search") ||
      searchParams.has("channelType") ||
      searchParams.has("dateRange") ||
      searchParams.has("limit") ||
      searchParams.has("status");

    if (wantsPagination) {
      const result = await listSessionsPaginated({
        userId: dbUser.id,
        characterId: characterId ?? undefined,
        cursor,
        limit: Number.isFinite(limit) ? limit : 20,
        search,
        channelType,
        dateRange,
        status: statusParam,
      });
      return NextResponse.json(result);
    }

    if (characterId) {
      // List sessions for a specific character
      const sessions = await listSessionsByCharacterId(dbUser.id, characterId, 100);
      return NextResponse.json({ sessions });
    }

    // List all sessions belonging to this user
    const sessions = await listSessions(dbUser.id, 100);

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to list sessions:", error);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Get local user for offline mode
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const body = await req.json();
    const { title, metadata, findOrCreate, forceNew } = body as {
      title?: string;
      metadata?: { characterId?: string; characterName?: string } & Record<string, unknown>;
      findOrCreate?: boolean;
      forceNew?: boolean; // Force creation of a new session even if one exists
    };

    // If forceNew is true, always create a new session (used for "New Chat" button)
    if (forceNew && metadata?.characterId && metadata?.characterName) {
      const session = await createSession({
        title: title || `Chat with ${metadata.characterName}`,
        userId: dbUser.id,
        metadata,
      });
      console.log(`[SESSIONS API] Force created new session ${session.id} for character ${metadata.characterId}`);
      return NextResponse.json({ session, isNew: true });
    }

    // If findOrCreate is true and we have a characterId, try to find existing session
    if (findOrCreate && metadata?.characterId && metadata?.characterName) {
      const { session, isNew } = await getOrCreateCharacterSession(
        dbUser.id,
        metadata.characterId,
        metadata.characterName
      );
      console.log(`[SESSIONS API] ${isNew ? 'Created new' : 'Found existing'} session ${session.id} for character ${metadata.characterId}`);
      return NextResponse.json({ session, isNew });
    }

    // Default behavior: always create a new session
    const session = await createSession({
      title: title || "New Design Session",
      userId: dbUser.id,
      metadata: metadata || {},
    });

    return NextResponse.json({ session, isNew: true });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
