/**
 * Trigger Schedule API Route
 * 
 * POST /api/schedules/[id]/trigger - Manually trigger a schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and } from "drizzle-orm";
import { getScheduler, startScheduler } from "@/lib/scheduler/scheduler-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/schedules/[id]/trigger - Manually trigger a schedule
export async function POST(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;

    const schedule = await db.query.scheduledTasks.findFirst({
      where: and(
        eq(scheduledTasks.id, id),
        eq(scheduledTasks.userId, userId)
      ),
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Ensure scheduler/task queue are running before triggering
    await startScheduler();
    await getScheduler().triggerTask(id);

    return NextResponse.json({ 
      success: true, 
      message: `Task "${schedule.name}" triggered` 
    });
  } catch (error) {
    console.error("[Schedules API] Trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger schedule" },
      { status: 500 }
    );
  }
}
