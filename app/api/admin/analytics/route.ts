/**
 * Admin Analytics API
 * Provides aggregate metrics for the observability dashboard
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/sqlite-client";
import { agentRuns, agentRunEvents } from "@/lib/db/sqlite-observability-schema";
import { sql, eq, count, avg, desc, and, gte } from "drizzle-orm";

// Skip auth in development
const isDev = process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  // In production, add proper auth check here
  if (!isDev) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7");
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    // Get overview metrics
    const [totalRunsResult] = await db
      .select({ count: count() })
      .from(agentRuns)
      .where(gte(agentRuns.startedAt, startDateStr));

    const [succeededResult] = await db
      .select({ count: count() })
      .from(agentRuns)
      .where(and(gte(agentRuns.startedAt, startDateStr), eq(agentRuns.status, "succeeded")));

    const [failedResult] = await db
      .select({ count: count() })
      .from(agentRuns)
      .where(and(gte(agentRuns.startedAt, startDateStr), eq(agentRuns.status, "failed")));

    const [avgDurationResult] = await db
      .select({ avg: avg(agentRuns.durationMs) })
      .from(agentRuns)
      .where(and(gte(agentRuns.startedAt, startDateStr), eq(agentRuns.status, "succeeded")));

    const [cacheMetricsResult] = await db
      .select({
        cacheReadTokens: sql<number>`sum(coalesce(json_extract(${agentRuns.metadata}, '$.cache.cacheReadTokens'), 0))`.as("cacheReadTokens"),
        cacheWriteTokens: sql<number>`sum(coalesce(json_extract(${agentRuns.metadata}, '$.cache.cacheWriteTokens'), 0))`.as("cacheWriteTokens"),
        estimatedSavingsUsd: sql<number>`sum(coalesce(json_extract(${agentRuns.metadata}, '$.cache.estimatedSavingsUsd'), 0))`.as("estimatedSavingsUsd"),
      })
      .from(agentRuns)
      .where(gte(agentRuns.startedAt, startDateStr));

    // Get runs by pipeline
    const runsByPipeline = await db
      .select({
        pipeline: agentRuns.pipelineName,
        count: count(),
      })
      .from(agentRuns)
      .where(gte(agentRuns.startedAt, startDateStr))
      .groupBy(agentRuns.pipelineName)
      .orderBy(desc(count()));

    // Get tool usage stats from events
    const toolStats = await db
      .select({
        toolName: agentRunEvents.toolName,
        count: count(),
        avgDuration: avg(agentRunEvents.durationMs),
      })
      .from(agentRunEvents)
      .where(and(
        gte(agentRunEvents.timestamp, startDateStr),
        eq(agentRunEvents.eventType, "tool_completed")
      ))
      .groupBy(agentRunEvents.toolName)
      .orderBy(desc(count()));

    // Get error stats
    const errorStats = await db
      .select({
        toolName: agentRunEvents.toolName,
        count: count(),
      })
      .from(agentRunEvents)
      .where(and(
        gte(agentRunEvents.timestamp, startDateStr),
        eq(agentRunEvents.eventType, "tool_failed")
      ))
      .groupBy(agentRunEvents.toolName)
      .orderBy(desc(count()));

    // Get daily run counts for trend chart
    const dailyRuns = await db
      .select({
        date: sql<string>`date(${agentRuns.startedAt})`.as("date"),
        total: count(),
        succeeded: sql<number>`sum(case when ${agentRuns.status} = 'succeeded' then 1 else 0 end)`.as("succeeded"),
        failed: sql<number>`sum(case when ${agentRuns.status} = 'failed' then 1 else 0 end)`.as("failed"),
      })
      .from(agentRuns)
      .where(gte(agentRuns.startedAt, startDateStr))
      .groupBy(sql`date(${agentRuns.startedAt})`)
      .orderBy(sql`date(${agentRuns.startedAt})`);

    const totalRuns = totalRunsResult?.count || 0;
    const succeeded = succeededResult?.count || 0;
    const failed = failedResult?.count || 0;
    const successRate = totalRuns > 0 ? ((succeeded / totalRuns) * 100).toFixed(1) : "0";

    return NextResponse.json({
      overview: {
        totalRuns,
        succeeded,
        failed,
        successRate: parseFloat(successRate),
        avgDurationMs: avgDurationResult?.avg ? Math.round(Number(avgDurationResult.avg)) : 0,
        periodDays: days,
      },
      cacheMetrics: {
        cacheReadTokens: Number(cacheMetricsResult?.cacheReadTokens) || 0,
        cacheWriteTokens: Number(cacheMetricsResult?.cacheWriteTokens) || 0,
        estimatedSavingsUsd: Number(cacheMetricsResult?.estimatedSavingsUsd) || 0,
      },
      runsByPipeline: runsByPipeline.map(r => ({
        pipeline: r.pipeline,
        count: r.count,
      })),
      toolStats: toolStats.filter(t => t.toolName).map(t => ({
        toolName: t.toolName,
        callCount: t.count,
        avgDurationMs: t.avgDuration ? Math.round(Number(t.avgDuration)) : 0,
      })),
      errorStats: errorStats.filter(e => e.toolName).map(e => ({
        toolName: e.toolName,
        errorCount: e.count,
      })),
      dailyTrends: dailyRuns.map(d => ({
        date: d.date,
        total: d.total,
        succeeded: Number(d.succeeded) || 0,
        failed: Number(d.failed) || 0,
      })),
    });
  } catch (error) {
    console.error("[Admin Analytics] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
