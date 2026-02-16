import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTaskRuns, scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { skillTelemetryEvents, skills } from "@/lib/db/sqlite-skills-schema";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";

type WindowPreset = "24h" | "7d" | "30d";

function getWindowStart(window: WindowPreset): string {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (window === "24h") return new Date(now - day).toISOString();
  if (window === "7d") return new Date(now - 7 * day).toISOString();
  return new Date(now - 30 * day).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const startedAt = Date.now();
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const windowParam = req.nextUrl.searchParams.get("window");
    const window: WindowPreset = windowParam === "24h" || windowParam === "7d" || windowParam === "30d" ? windowParam : "7d";
    const sinceIso = getWindowStart(window);

    const [totals] = await db
      .select({
        totalRuns: sql<number>`COUNT(*)`,
        failures: sql<number>`SUM(CASE WHEN ${scheduledTaskRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(scheduledTaskRuns)
      .innerJoin(scheduledTasks, eq(scheduledTasks.id, scheduledTaskRuns.taskId))
      .where(and(eq(scheduledTasks.userId, dbUser.id), gte(scheduledTaskRuns.createdAt, sinceIso)));

    const topSkillRows = await db
      .select({
        skillId: skills.id,
        name: skills.name,
        runs: sql<number>`COUNT(*)`,
        failures: sql<number>`SUM(CASE WHEN ${scheduledTaskRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(scheduledTaskRuns)
      .innerJoin(scheduledTasks, eq(scheduledTasks.id, scheduledTaskRuns.taskId))
      .innerJoin(skills, eq(skills.id, scheduledTasks.skillId))
      .where(and(eq(scheduledTasks.userId, dbUser.id), gte(scheduledTaskRuns.createdAt, sinceIso)))
      .groupBy(skills.id, skills.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    const trendRows = await db
      .select({
        day: sql<string>`date(${scheduledTaskRuns.createdAt})`,
        runs: sql<number>`COUNT(*)`,
        failures: sql<number>`SUM(CASE WHEN ${scheduledTaskRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(scheduledTaskRuns)
      .innerJoin(scheduledTasks, eq(scheduledTasks.id, scheduledTaskRuns.taskId))
      .where(and(eq(scheduledTasks.userId, dbUser.id), gte(scheduledTaskRuns.createdAt, sinceIso)))
      .groupBy(sql`date(${scheduledTaskRuns.createdAt})`)
      .orderBy(sql`date(${scheduledTaskRuns.createdAt}) asc`)
      .limit(30);

    const nowIso = new Date().toISOString();
    const upcomingRuns = await db
      .select({
        taskId: scheduledTasks.id,
        taskName: scheduledTasks.name,
        nextRunAt: scheduledTasks.nextRunAt,
      })
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.userId, dbUser.id),
          eq(scheduledTasks.enabled, true),
          gte(scheduledTasks.nextRunAt, nowIso)
        )
      )
      .orderBy(asc(scheduledTasks.nextRunAt))
      .limit(8);

    const totalRuns = Number(totals?.totalRuns || 0);
    const failures = Number(totals?.failures || 0);
    const successRate = totalRuns > 0 ? Number((((totalRuns - failures) / totalRuns) * 100).toFixed(2)) : null;

    const topSkills = topSkillRows.map((row) => {
      const runs = Number(row.runs || 0);
      const failureCount = Number(row.failures || 0);
      return {
        skillId: row.skillId,
        name: row.name,
        runs,
        successRate: runs > 0 ? Number((((runs - failureCount) / runs) * 100).toFixed(2)) : null,
      };
    });

    const telemetryRows = await db
      .select({
        eventType: skillTelemetryEvents.eventType,
        count: sql<number>`COUNT(*)`,
      })
      .from(skillTelemetryEvents)
      .where(
        and(
          eq(skillTelemetryEvents.userId, dbUser.id),
          gte(skillTelemetryEvents.createdAt, sinceIso)
        )
      )
      .groupBy(skillTelemetryEvents.eventType);

    const eventCounts: Record<string, number> = {};
    for (const row of telemetryRows) {
      eventCounts[row.eventType] = Number(row.count || 0);
    }

    const autoTriggered = eventCounts.skill_auto_triggered || 0;
    const manualRuns = eventCounts.skill_manual_run || 0;
    const triggerTotal = autoTriggered + manualRuns;
    const copySuccess = eventCounts.skill_copy_succeeded || 0;
    const copyFailed = eventCounts.skill_copy_failed || 0;
    const copyTotal = copySuccess + copyFailed;
    const updateSuccess = eventCounts.skill_update_succeeded || 0;
    const updateStale = eventCounts.skill_update_stale || 0;
    const updateTotal = updateSuccess + updateStale;

    const telemetrySummary = {
      autoTriggerRate: triggerTotal > 0 ? Number((autoTriggered / triggerTotal).toFixed(4)) : null,
      manualRunCount: manualRuns,
      autoTriggeredCount: autoTriggered,
      copySuccessRate: copyTotal > 0 ? Number((copySuccess / copyTotal).toFixed(4)) : null,
      copyFailureRate: copyTotal > 0 ? Number((copyFailed / copyTotal).toFixed(4)) : null,
      copySuccessCount: copySuccess,
      copyFailureCount: copyFailed,
      staleUpdateRate: updateTotal > 0 ? Number((updateStale / updateTotal).toFixed(4)) : null,
      updateSuccessCount: updateSuccess,
      updateStaleCount: updateStale,
    };

    const queryLatencyMs = Date.now() - startedAt;

    await trackSkillTelemetryEvent({
      userId: dbUser.id,
      eventType: "skill_dashboard_loaded",
      metadata: { window, totalRuns, queryLatencyMs },
    });

    return NextResponse.json({
      asOf: new Date().toISOString(),
      window,
      totalRuns,
      successRate,
      topSkills,
      trend: trendRows.map((row) => ({ day: row.day, runs: Number(row.runs || 0), failures: Number(row.failures || 0) })),
      upcomingRuns: upcomingRuns.map((run) => ({
        taskId: run.taskId,
        taskName: run.taskName,
        nextRunAt: run.nextRunAt,
      })),
      telemetrySummary,
      queryLatencyMs,
    });
  } catch (error) {
    console.error("[Dashboard API] GET summary error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load dashboard summary" }, { status: 500 });
  }
}
