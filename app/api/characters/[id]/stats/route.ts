import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getCharacterStats } from "@/lib/characters/queries";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const stats = await getCharacterStats(dbUser.id, id);
    if (!stats) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[Characters API] GET [id]/stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get character stats" },
      { status: 500 }
    );
  }
}
