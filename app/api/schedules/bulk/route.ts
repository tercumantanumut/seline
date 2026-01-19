/**
 * Bulk Schedule Operations API
 * POST /api/schedules/bulk
 *
 * Perform bulk actions on multiple schedules (enable, disable, delete, trigger).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and, inArray } from "drizzle-orm";
import { getScheduler, startScheduler } from "@/lib/scheduler";

type BulkAction = "enable" | "disable" | "delete" | "trigger";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { action, scheduleIds } = await req.json();

    if (!action || !scheduleIds || !Array.isArray(scheduleIds) || scheduleIds.length === 0) {
      return NextResponse.json(
        { error: "action and scheduleIds are required" },
        { status: 400 }
      );
    }

    if (!["enable", "disable", "delete", "trigger"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be: enable, disable, delete, or trigger" },
        { status: 400 }
      );
    }

    // Validate ownership for all schedules
    const schedules = await db.query.scheduledTasks.findMany({
      where: and(
        inArray(scheduledTasks.id, scheduleIds),
        eq(scheduledTasks.userId, dbUser.id)
      ),
    });

    if (schedules.length !== scheduleIds.length) {
      return NextResponse.json(
        { error: "One or more schedule IDs are invalid or not owned by you" },
        { status: 400 }
      );
    }

    const scheduler = getScheduler();
    await startScheduler();
    const now = new Date().toISOString();

    switch (action as BulkAction) {
      case "enable":
        await db.update(scheduledTasks)
          .set({
            enabled: true,
            pausedAt: null,
            pausedUntil: null,
            pauseReason: null,
            updatedAt: now,
          })
          .where(inArray(scheduledTasks.id, scheduleIds));
        break;

      case "disable":
        await db.update(scheduledTasks)
          .set({
            enabled: false,
            pausedAt: now,
            updatedAt: now,
          })
          .where(inArray(scheduledTasks.id, scheduleIds));
        break;

      case "delete":
        await db.delete(scheduledTasks)
          .where(inArray(scheduledTasks.id, scheduleIds));
        break;

      case "trigger":
        for (const id of scheduleIds) {
          await scheduler.triggerTask(id);
        }
        break;
    }

    // Reload all affected schedules
    for (const id of scheduleIds) {
      await scheduler.reloadSchedule(id);
    }

    return NextResponse.json({
      success: true,
      action,
      affected: scheduleIds.length,
    });
  } catch (error) {
    console.error("[API] Bulk schedule operation error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 }
    );
  }
}
