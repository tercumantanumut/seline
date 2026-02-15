import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { createSkill, listSkillLibrary, listSkillsForUser, assertCharacterOwnership } from "@/lib/skills/queries";
import { getSkillsRolloutState } from "@/lib/skills/rollout";
import { ENABLE_PUBLIC_LIBRARY } from "@/lib/flags";
import { createSkillSchema, listSkillsQuerySchema } from "@/lib/skills/validation";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const parsedQuery = listSkillsQuerySchema.safeParse({
      characterId: req.nextUrl.searchParams.get("characterId") || undefined,
      status: req.nextUrl.searchParams.get("status") || undefined,
      all: req.nextUrl.searchParams.get("all") || undefined,
      category: req.nextUrl.searchParams.get("category") || undefined,
      query: req.nextUrl.searchParams.get("query") || undefined,
      usageBucket: req.nextUrl.searchParams.get("usageBucket") || undefined,
      successBucket: req.nextUrl.searchParams.get("successBucket") || undefined,
      updatedFrom: req.nextUrl.searchParams.get("updatedFrom") || undefined,
      updatedTo: req.nextUrl.searchParams.get("updatedTo") || undefined,
      sort: req.nextUrl.searchParams.get("sort") || undefined,
      cursor: req.nextUrl.searchParams.get("cursor") || undefined,
      limit: req.nextUrl.searchParams.get("limit") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query", details: parsedQuery.error.flatten() }, { status: 400 });
    }

    const filters = parsedQuery.data;
    const trackB = getSkillsRolloutState("B", dbUser.id);

    if (filters.characterId && !filters.all) {
      const ownsCharacter = await assertCharacterOwnership(filters.characterId, dbUser.id);
      if (!ownsCharacter) {
        return NextResponse.json({ error: "Character not found" }, { status: 404 });
      }
    }

    if (filters.all) {
      if (!ENABLE_PUBLIC_LIBRARY || !trackB.enabled || !trackB.inCohort) {
        return NextResponse.json(
          {
            error: "Cross-agent skill library is not available for this rollout cohort.",
            feature: trackB,
          },
          { status: 403 }
        );
      }

      const library = await listSkillLibrary(dbUser.id, filters);
      return NextResponse.json({ items: library.items, nextCursor: library.nextCursor, feature: trackB });
    }

    const skills = await listSkillsForUser(dbUser.id, filters);
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
      triggerExamples: parsedBody.data.triggerExamples,
      category: parsedBody.data.category,
      copiedFromSkillId: parsedBody.data.copiedFromSkillId,
      copiedFromCharacterId: parsedBody.data.copiedFromCharacterId,
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
