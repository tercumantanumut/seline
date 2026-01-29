/**
 * Schedule Task Tool
 *
 * AI tool that allows agents to schedule tasks for future execution.
 * Integrates with the existing scheduler-service.ts infrastructure.
 */

import { tool, jsonSchema } from "ai";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq } from "drizzle-orm";
import { CronJob } from "cron";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

/**
 * Input schema for the scheduleTask tool
 */
interface ScheduleTaskInput {
  name: string;
  description?: string;
  scheduleType: "cron" | "interval" | "once";
  cronExpression?: string;
  intervalMinutes?: number;
  scheduledAt?: string;
  timezone?: string;
  prompt: string;
  enabled?: boolean;
  priority?: "high" | "normal" | "low";
}

/**
 * Options for creating the scheduleTask tool
 */
export interface ScheduleTaskToolOptions {
  sessionId: string;
  userId: string;
  characterId: string;
}

/**
 * JSON Schema definition for the scheduleTask tool input
 */
const scheduleTaskSchema = jsonSchema<ScheduleTaskInput>({
  type: "object",
  title: "ScheduleTaskInput",
  description: "Input schema for scheduling a task for future execution",
  properties: {
    name: {
      type: "string",
      description: "Human-readable name for the scheduled task (e.g., 'Daily Standup Reminder')",
    },
    description: {
      type: "string",
      description: "Optional description of what this task does",
    },
    scheduleType: {
      type: "string",
      enum: ["cron", "interval", "once"],
      description:
        "Type of schedule: 'cron' for cron expressions (e.g., daily at 9am), 'interval' for periodic execution (every N minutes), 'once' for one-time execution at a specific time",
    },
    cronExpression: {
      type: "string",
      description:
        "Cron expression (required if scheduleType is 'cron'). Examples: '0 9 * * 1-5' (9am weekdays), '0 0 * * *' (midnight daily), '*/30 * * * *' (every 30 minutes)",
    },
    intervalMinutes: {
      type: "number",
      description:
        "Interval in minutes (required if scheduleType is 'interval'). Example: 60 for hourly execution",
    },
    scheduledAt: {
      type: "string",
      description:
        "ISO timestamp for one-time execution (required if scheduleType is 'once'). Example: '2026-01-29T10:00:00Z'",
    },
    timezone: {
      type: "string",
      description:
        "Timezone for schedule execution. Default: 'UTC'. Examples: 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Europe/Istanbul'",
    },
    prompt: {
      type: "string",
      description:
        "The prompt/instruction to execute when the task runs. Can include template variables: {{NOW}}, {{TODAY}}, {{YESTERDAY}}, {{WEEKDAY}}, {{MONTH}}, {{LAST_7_DAYS}}, {{LAST_30_DAYS}}",
    },
    enabled: {
      type: "boolean",
      description: "Whether the task is enabled (default: true)",
    },
    priority: {
      type: "string",
      enum: ["high", "normal", "low"],
      description:
        "Execution priority when multiple tasks are due (default: 'normal'). High priority tasks run first.",
    },
  },
  required: ["name", "scheduleType", "prompt"],
  additionalProperties: false,
});

/**
 * Create the scheduleTask AI tool
 */
export function createScheduleTaskTool(options: ScheduleTaskToolOptions) {
  const { sessionId, userId, characterId } = options;

  return tool({
    description: `Schedule a task to be executed at a future time. You can schedule:
- **One-time tasks**: Execute once at a specific date/time (scheduleType: "once")
- **Recurring tasks**: Execute on a cron schedule (scheduleType: "cron") - e.g., "0 9 * * 1-5" for 9am on weekdays
- **Interval tasks**: Execute every N minutes (scheduleType: "interval")

The task will execute with the agent's full context and tools. Use template variables in prompts:
- {{NOW}}: Current ISO timestamp
- {{TODAY}}: Today's date (YYYY-MM-DD)
- {{YESTERDAY}}: Yesterday's date
- {{WEEKDAY}}: Current day name (Monday, Tuesday, etc.)
- {{MONTH}}: Current month name

**Common cron patterns:**
- "0 9 * * 1-5" - 9:00 AM on weekdays (Mon-Fri)
- "0 0 * * *" - Midnight daily
- "0 17 * * 2,3,4,5" - 5:00 PM on Tue-Fri
- "*/30 * * * *" - Every 30 minutes
- "0 8 * * 1,3,5" - 8:00 AM on Mon, Wed, Fri`,

    inputSchema: scheduleTaskSchema,

    execute: async (input: ScheduleTaskInput) => {
      const {
        name,
        description,
        scheduleType,
        cronExpression,
        intervalMinutes,
        scheduledAt,
        timezone = "UTC",
        prompt,
        enabled = true,
        priority = "normal",
      } = input;

      // Validate required fields based on schedule type
      if (scheduleType === "cron" && !cronExpression) {
        return {
          success: false,
          error: "cronExpression is required when scheduleType is 'cron'. Example: '0 9 * * 1-5' for 9am weekdays",
        };
      }

      if (scheduleType === "interval" && !intervalMinutes) {
        return {
          success: false,
          error: "intervalMinutes is required when scheduleType is 'interval'. Example: 60 for hourly execution",
        };
      }

      if (scheduleType === "once" && !scheduledAt) {
        return {
          success: false,
          error: "scheduledAt is required when scheduleType is 'once'. Use ISO format: '2026-01-29T10:00:00Z'",
        };
      }

      // Validate cron expression
      if (cronExpression) {
        try {
          new CronJob(cronExpression, () => {}, null, false, timezone);
        } catch (error) {
          return {
            success: false,
            error: `Invalid cron expression "${cronExpression}": ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }

      // Validate scheduled time is in the future for one-time schedules
      if (scheduleType === "once" && scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        if (isNaN(scheduledDate.getTime())) {
          return {
            success: false,
            error: `Invalid scheduledAt timestamp "${scheduledAt}". Use ISO format: '2026-01-29T10:00:00Z'`,
          };
        }
        if (scheduledDate <= new Date()) {
          return {
            success: false,
            error: "scheduledAt must be in the future for one-time schedules",
          };
        }
      }

      try {
        // Calculate next run time
        let nextRunAt: string | null = null;

        if (scheduleType === "cron" && cronExpression) {
          const job = new CronJob(cronExpression, () => {}, null, false, timezone);
          const nextDate = job.nextDate();
          nextRunAt = nextDate.toISO();
        } else if (scheduleType === "once" && scheduledAt) {
          nextRunAt = scheduledAt;
        } else if (scheduleType === "interval" && intervalMinutes) {
          const next = new Date(Date.now() + intervalMinutes * 60 * 1000);
          nextRunAt = next.toISOString();
        }

        // Insert scheduled task
        const [task] = await db
          .insert(scheduledTasks)
          .values({
            userId,
            characterId,
            name,
            description: description || null,
            scheduleType,
            cronExpression: cronExpression || null,
            intervalMinutes: intervalMinutes || null,
            scheduledAt: scheduledAt || null,
            timezone,
            initialPrompt: prompt,
            enabled,
            priority,
            status: "active",
            resultSessionId: sessionId, // Link to current session by default
            nextRunAt,
          })
          .returning();

        // Register the schedule with the scheduler service
        try {
          const scheduler = getScheduler();
          scheduler.reloadSchedule(task.id);
        } catch (schedulerError) {
          console.warn("[scheduleTask] Failed to register with scheduler:", schedulerError);
          // Don't fail the tool - the task is saved and will be picked up on next scheduler load
        }

        // Format human-readable schedule description
        let scheduleDescription: string;
        if (scheduleType === "cron" && cronExpression) {
          scheduleDescription = `Cron: ${cronExpression} (${timezone})`;
        } else if (scheduleType === "interval" && intervalMinutes) {
          scheduleDescription = `Every ${intervalMinutes} minutes`;
        } else if (scheduleType === "once" && scheduledAt) {
          scheduleDescription = `Once at ${new Date(scheduledAt).toLocaleString()} (${timezone})`;
        } else {
          scheduleDescription = "Unknown schedule type";
        }

        console.log(
          `[scheduleTask] Created task "${name}" (${scheduleType}) - Next run: ${nextRunAt}`
        );

        return {
          success: true,
          taskId: task.id,
          message: `Task "${name}" scheduled successfully`,
          schedule: scheduleDescription,
          nextRunAt,
          timezone,
          priority,
          enabled,
        };
      } catch (error) {
        console.error("[scheduleTask] Failed to create task:", error);
        return {
          success: false,
          error: `Failed to create scheduled task: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });
}
