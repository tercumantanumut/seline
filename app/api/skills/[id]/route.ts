import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { deleteSkill, getSkillById, listSkillRunHistory, listSkillVersions, updateSkill } from "@/lib/skills/queries";
import { updateSkillSchema } from "@/lib/skills/validation";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const skill = await getSkillById(id, dbUser.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const includeHistory = req.nextUrl.searchParams.get("includeHistory") === "true";
    const includeRuns = req.nextUrl.searchParams.get("includeRuns") === "true";

    if (!includeHistory && !includeRuns) {
      return NextResponse.json({ skill });
    }

    const [versions, runs] = await Promise.all([
      includeHistory ? listSkillVersions(id, dbUser.id) : Promise.resolve([]),
      includeRuns ? listSkillRunHistory(id, dbUser.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({ skill, versions, runs });
  } catch (error) {
    console.error("[Skills API] GET [id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch skill" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const body = await req.json();
    const parsed = updateSkillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await updateSkill(id, dbUser.id, parsed.data);
    if (!updated.skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if (updated.stale) {
      await trackSkillTelemetryEvent({
        userId: dbUser.id,
        eventType: "skill_update_stale",
        skillId: id,
      });
      return NextResponse.json(
        {
          error: "Skill version conflict",
          stale: true,
          staleVersion: updated.staleVersion,
          warnings: updated.warnings,
          skill: updated.skill,
        },
        { status: 409 }
      );
    }

    await trackSkillTelemetryEvent({
      userId: dbUser.id,
      eventType: "skill_update_succeeded",
      skillId: id,
      characterId: updated.skill.characterId,
      metadata: { changedFields: updated.changedFields, noChanges: updated.noChanges },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Skills API] PATCH [id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update skill" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const deleted = await deleteSkill(id, dbUser.id);
    if (!deleted) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Skills API] DELETE [id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete skill" },
      { status: 500 }
    );
  }
}
