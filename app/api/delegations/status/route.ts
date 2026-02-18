import { NextRequest, NextResponse } from "next/server";
import { getActiveDelegationsForCharacter } from "@/lib/ai/tools/delegate-to-subagent-tool";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";

export async function GET(request: NextRequest) {
  const userId = await requireAuth(request);
  const settings = loadSettings();
  const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

  const characterId = request.nextUrl.searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json(
      { error: "characterId query parameter is required" },
      { status: 400 },
    );
  }

  const character = await getCharacter(characterId);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  if (character.userId !== dbUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const delegations = getActiveDelegationsForCharacter(characterId);

  return NextResponse.json({ delegations });
}
