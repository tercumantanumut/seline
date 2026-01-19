/**
 * Resume Schedule API
 * POST /api/schedules/[id]/resume
 *
 * Resumes a paused schedule.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    // Verify ownership
    const task = await db.query.scheduledTasks.findFirst({
      where: and(
        eq(scheduledTasks.id, id),
        eq(scheduledTasks.userId, dbUser.id)
      ),
    });

    if (!task) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Resume the schedule
    await db.update(scheduledTasks)
      .set({
        enabled: true,
        pausedAt: null,
        pausedUntil: null,
        pauseReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(scheduledTasks.id, id));

    // Reload in scheduler
    await getScheduler().reloadSchedule(id);

    return NextResponse.json({
      success: true,
      message: "Schedule resumed",
    });
  } catch (error) {
    console.error("[API] Resume schedule error:", error);
    return NextResponse.json(
      { error: "Failed to resume schedule" },
      { status: 500 }
    );
  }
}

