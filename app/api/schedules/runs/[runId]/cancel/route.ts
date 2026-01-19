/**
 * Cancel Run API
 * POST /api/schedules/runs/[runId]/cancel
 *
 * Cancels a running or queued scheduled task run.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTaskRuns } from "@/lib/db/sqlite-schedule-schema";
import { eq } from "drizzle-orm";
import { getScheduler, startScheduler } from "@/lib/scheduler/scheduler-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { runId } = await params;

    // Get run with task to verify ownership
    const run = await db.query.scheduledTaskRuns.findFirst({
      where: eq(scheduledTaskRuns.id, runId),
      with: { task: true },
    });

    if (!run || run.task.userId !== dbUser.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Check if run can be cancelled
    if (!["pending", "queued", "running"].includes(run.status)) {
      return NextResponse.json(
        { error: `Run cannot be cancelled (status: ${run.status})` },
        { status: 400 }
      );
    }

    await startScheduler();
    const scheduler = getScheduler();
    const cancelled = await scheduler.cancelRun(runId);

    if (!cancelled) {
      if (run.status === "pending") {
        await db.update(scheduledTaskRuns)
          .set({
            status: "cancelled",
            completedAt: new Date().toISOString(),
          })
          .where(eq(scheduledTaskRuns.id, runId));
      } else {
        return NextResponse.json(
          { error: "Run is no longer active" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Run cancelled",
    });
  } catch (error) {
    console.error("[API] Cancel run error:", error);
    return NextResponse.json(
      { error: "Failed to cancel run" },
      { status: 500 }
    );
  }
}
