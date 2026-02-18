import { NextRequest, NextResponse } from "next/server";
import { getActiveDelegationsForCharacter } from "@/lib/ai/tools/delegate-to-subagent-tool";

export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json(
      { error: "characterId query parameter is required" },
      { status: 400 },
    );
  }

  const delegations = getActiveDelegationsForCharacter(characterId);

  return NextResponse.json({ delegations });
}
