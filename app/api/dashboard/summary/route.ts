import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTaskRuns, scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { skills } from "@/lib/db/sqlite-skills-schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

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
    const userId = await requireAuth(req);
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
      .where(and(eq(scheduledTasks.userId, userId), gte(scheduledTaskRuns.createdAt, sinceIso)));

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
      .where(and(eq(scheduledTasks.userId, userId), gte(scheduledTaskRuns.createdAt, sinceIso)))
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
      .where(and(eq(scheduledTasks.userId, userId), gte(scheduledTaskRuns.createdAt, sinceIso)))
      .groupBy(sql`date(${scheduledTaskRuns.createdAt})`)
      .orderBy(sql`date(${scheduledTaskRuns.createdAt}) asc`)
      .limit(30);

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

    return NextResponse.json({
      asOf: new Date().toISOString(),
      window,
      totalRuns,
      successRate,
      topSkills,
      trend: trendRows.map((row) => ({ day: row.day, runs: Number(row.runs || 0), failures: Number(row.failures || 0) })),
    });
  } catch (error) {
    console.error("[Dashboard API] GET summary error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load dashboard summary" }, { status: 500 });
  }
}
