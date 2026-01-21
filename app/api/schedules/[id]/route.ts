/**
 * Individual Schedule API Routes
 * 
 * GET /api/schedules/[id] - Get single schedule
 * PATCH /api/schedules/[id] - Update schedule
 * DELETE /api/schedules/[id] - Delete schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and, desc } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/schedules/[id] - Get single schedule
export async function GET(
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
      with: {
        character: true,
        runs: {
          limit: 20,
          orderBy: (runs, { desc }) => [desc(runs.createdAt)],
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("[Schedules API] GET [id] error:", error);
    return NextResponse.json(
      { error: "Failed to get schedule" },
      { status: 500 }
    );
  }
}

// PATCH /api/schedules/[id] - Update schedule
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    // Remove fields that shouldn't be updated directly
    const {
      id: _id,
      userId: _userId,
      createdAt: _createdAt,
      ...updateData
    } = body;

    const [updated] = await db.update(scheduledTasks)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(scheduledTasks.id, id),
        eq(scheduledTasks.userId, userId)
      ))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Reload in scheduler - only if active and enabled
    if (updated.status === "active" && updated.enabled) {
      await getScheduler().reloadSchedule(id);
    } else {
      // If it became draft, paused, or disabled, make sure it's removed from active jobs
      await getScheduler().reloadSchedule(id);
    }

    return NextResponse.json({ schedule: updated });
  } catch (error) {
    console.error("[Schedules API] PATCH [id] error:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

// DELETE /api/schedules/[id] - Delete schedule
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;

    const deleted = await db.delete(scheduledTasks)
      .where(and(
        eq(scheduledTasks.id, id),
        eq(scheduledTasks.userId, userId)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Unregister from scheduler
    await getScheduler().reloadSchedule(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Schedules API] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

