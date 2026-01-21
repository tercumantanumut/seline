/**
 * Schedules API Routes
 * 
 * GET /api/schedules - List all schedules for user
 * POST /api/schedules - Create new schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and, desc } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

// GET /api/schedules - List all schedules for user
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);

    const characterId = req.nextUrl.searchParams.get("characterId");

    const conditions = characterId
      ? and(eq(scheduledTasks.userId, userId), eq(scheduledTasks.characterId, characterId))
      : eq(scheduledTasks.userId, userId);

    const schedules = await db.query.scheduledTasks.findMany({
      where: conditions,
      with: {
        character: true,
        runs: {
          limit: 5,
          orderBy: (runs, { desc }) => [desc(runs.createdAt)],
        },
      },
      orderBy: [desc(scheduledTasks.createdAt)],
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("[Schedules API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to list schedules" },
      { status: 500 }
    );
  }
}

// POST /api/schedules - Create new schedule
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();

    const {
      characterId,
      name,
      description,
      scheduleType,
      cronExpression,
      intervalMinutes,
      scheduledAt,
      timezone,
      initialPrompt,
      promptVariables,
      contextSources,
      enabled,
      maxRetries,
      timeoutMs,
      priority,
      status,
      createNewSessionPerRun,
    } = body;

    // Validate required fields
    if (!characterId || !name || !initialPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: characterId, name, initialPrompt" },
        { status: 400 }
      );
    }

    // Validate schedule configuration
    if (scheduleType === "cron" && !cronExpression) {
      return NextResponse.json(
        { error: "cronExpression required for cron schedule type" },
        { status: 400 }
      );
    }

    if (scheduleType === "interval" && !intervalMinutes) {
      return NextResponse.json(
        { error: "intervalMinutes required for interval schedule type" },
        { status: 400 }
      );
    }

    if (scheduleType === "once" && !scheduledAt) {
      return NextResponse.json(
        { error: "scheduledAt required for once schedule type" },
        { status: 400 }
      );
    }

    const [schedule] = await db.insert(scheduledTasks).values({
      userId,
      characterId,
      name,
      description,
      scheduleType: scheduleType || "cron",
      cronExpression,
      intervalMinutes,
      scheduledAt,
      timezone: timezone || "UTC",
      initialPrompt,
      promptVariables: promptVariables || {},
      contextSources: contextSources || [],
      enabled: enabled ?? true,
      maxRetries: maxRetries ?? 3,
      timeoutMs: timeoutMs ?? 300000,
      priority,
      status: status || "active",
      createNewSessionPerRun: createNewSessionPerRun ?? true,
    }).returning();

    // Register with scheduler - only if active and enabled
    if (schedule.status === "active" && schedule.enabled) {
      await getScheduler().reloadSchedule(schedule.id);
    }

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    console.error("[Schedules API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}

