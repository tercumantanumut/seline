import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { getSkillById } from "@/lib/skills/queries";
import { scheduleSkillSchema } from "@/lib/skills/validation";
import { renderSkillPrompt } from "@/lib/skills/runtime";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const skill = await getSkillById(id, dbUser.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = scheduleSkillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const rendered = renderSkillPrompt(skill, parsed.data.promptVariables || {});
    if (rendered.missingParameters.length > 0) {
      return NextResponse.json({ error: "Missing required parameters", missingParameters: rendered.missingParameters }, { status: 400 });
    }

    const [schedule] = await db
      .insert(scheduledTasks)
      .values({
        userId: dbUser.id,
        characterId: skill.characterId,
        skillId: skill.id,
        name: parsed.data.name,
        scheduleType: parsed.data.scheduleType,
        cronExpression: parsed.data.cronExpression || null,
        intervalMinutes: parsed.data.intervalMinutes || null,
        scheduledAt: parsed.data.scheduledAt || null,
        timezone: parsed.data.timezone || "UTC",
        initialPrompt: rendered.prompt,
        promptVariables: parsed.data.promptVariables || {},
        enabled: true,
        status: "active",
        deliveryMethod: parsed.data.deliveryMethod || "session",
        deliveryConfig: parsed.data.deliveryConfig || {},
        createNewSessionPerRun: parsed.data.createNewSessionPerRun ?? true,
      })
      .returning();

    await getScheduler().reloadSchedule(schedule.id);

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error("[Skills API] POST [id]/schedule error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to schedule skill" },
      { status: 500 }
    );
  }
}
