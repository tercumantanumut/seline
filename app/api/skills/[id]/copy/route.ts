import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { copySkill } from "@/lib/skills/queries";
import { getSkillsRolloutState } from "@/lib/skills/rollout";
import { ENABLE_CROSS_AGENT_COPY } from "@/lib/flags";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const copySkillSchema = z.object({
  targetCharacterId: z.string().uuid(),
  targetName: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const trackB = getSkillsRolloutState("B", dbUser.id);
    if (!ENABLE_CROSS_AGENT_COPY || !trackB.enabled || !trackB.inCohort) {
      return NextResponse.json(
        {
          error: "Skill copy is not available for this rollout cohort.",
          feature: trackB,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = copySkillSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const copied = await copySkill(
      {
        skillId: id,
        targetCharacterId: parsed.data.targetCharacterId,
        targetName: parsed.data.targetName,
      },
      dbUser.id
    );

    if (!copied) {
      await trackSkillTelemetryEvent({
        userId: dbUser.id,
        eventType: "skill_copy_failed",
        skillId: id,
        characterId: parsed.data.targetCharacterId,
      });
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    await trackSkillTelemetryEvent({
      userId: dbUser.id,
      eventType: "skill_copy_succeeded",
      skillId: id,
      characterId: parsed.data.targetCharacterId,
      metadata: { copiedSkillId: copied.id },
    });

    return NextResponse.json({ success: true, skill: copied }, { status: 201 });
  } catch (error) {
    console.error("[Skills API] POST [id]/copy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to copy skill" },
      { status: 500 }
    );
  }
}
