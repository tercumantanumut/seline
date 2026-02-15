import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { createSkill, listSkillsForUser, assertCharacterOwnership } from "@/lib/skills/queries";
import { createSkillSchema, listSkillsQuerySchema } from "@/lib/skills/validation";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const parsedQuery = listSkillsQuerySchema.safeParse({
      characterId: req.nextUrl.searchParams.get("characterId") || undefined,
      status: req.nextUrl.searchParams.get("status") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query", details: parsedQuery.error.flatten() }, { status: 400 });
    }

    const { characterId, status } = parsedQuery.data;
    if (characterId) {
      const ownsCharacter = await assertCharacterOwnership(characterId, dbUser.id);
      if (!ownsCharacter) {
        return NextResponse.json({ error: "Character not found" }, { status: 404 });
      }
    }

    const skills = await listSkillsForUser(dbUser.id, { characterId, status });
    return NextResponse.json({ skills });
  } catch (error) {
    console.error("[Skills API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list skills" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const body = await req.json();
    const parsedBody = createSkillSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsedBody.error.flatten() }, { status: 400 });
    }

    const ownsCharacter = await assertCharacterOwnership(parsedBody.data.characterId, dbUser.id);
    if (!ownsCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const skill = await createSkill({
      userId: dbUser.id,
      characterId: parsedBody.data.characterId,
      name: parsedBody.data.name,
      description: parsedBody.data.description,
      icon: parsedBody.data.icon,
      promptTemplate: parsedBody.data.promptTemplate,
      inputParameters: parsedBody.data.inputParameters,
      toolHints: parsedBody.data.toolHints,
      sourceType: parsedBody.data.sourceType,
      sourceSessionId: parsedBody.data.sourceSessionId,
      status: parsedBody.data.status,
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    console.error("[Skills API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create skill" },
      { status: 500 }
    );
  }
}
