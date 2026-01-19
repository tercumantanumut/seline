/**
 * Pause Schedule API
 * POST /api/schedules/[id]/pause
 *
 * Pauses a schedule with optional auto-resume time.
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
    const { until, reason } = await req.json().catch(() => ({}));

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

    // Pause the schedule
    await db.update(scheduledTasks)
      .set({
        enabled: false,
        pausedAt: new Date().toISOString(),
        pausedUntil: until || null,
        pauseReason: reason || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(scheduledTasks.id, id));

    // Reload in scheduler
    await getScheduler().reloadSchedule(id);

    return NextResponse.json({
      success: true,
      message: until
        ? `Schedule paused until ${new Date(until).toLocaleString()}`
        : "Schedule paused indefinitely",
    });
  } catch (error) {
    console.error("[API] Pause schedule error:", error);
    return NextResponse.json(
      { error: "Failed to pause schedule" },
      { status: 500 }
    );
  }
}

