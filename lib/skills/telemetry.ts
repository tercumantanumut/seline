import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import { skillTelemetryEvents } from "@/lib/db/sqlite-skills-schema";

export type SkillTelemetryEventType =
  | "skill_auto_triggered"
  | "skill_manual_run"
  | "skill_copy_succeeded"
  | "skill_copy_failed"
  | "skill_library_opened"
  | "skill_library_filtered"
  | "skill_library_zero_results"
  | "skill_detail_viewed"
  | "skill_update_succeeded"
  | "skill_update_stale"
  | "skill_dashboard_loaded";

export async function trackSkillTelemetryEvent(input: {
  userId: string;
  eventType: SkillTelemetryEventType;
  characterId?: string | null;
  skillId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(skillTelemetryEvents).values({
      userId: input.userId,
      characterId: input.characterId ?? null,
      skillId: input.skillId ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.warn("[Skills Telemetry] Failed to record event", { eventType: input.eventType, error });
  }
}

export async function getSkillTelemetryCounters(userId: string, hours = 24): Promise<{
  windowHours: number;
  events: Record<string, number>;
}> {
  const since = new Date(Date.now() - Math.max(hours, 1) * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      eventType: skillTelemetryEvents.eventType,
      count: sql<number>`COUNT(*)`,
    })
    .from(skillTelemetryEvents)
    .where(and(eq(skillTelemetryEvents.userId, userId), gte(skillTelemetryEvents.createdAt, since)))
    .groupBy(skillTelemetryEvents.eventType);

  const events: Record<string, number> = {};
  for (const row of rows) {
    events[row.eventType] = Number(row.count || 0);
  }

  return { windowHours: hours, events };
}