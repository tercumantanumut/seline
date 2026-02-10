/**
 * Schedule Task Tool
 *
 * AI tool that allows agents to schedule tasks for future execution.
 * Integrates with the existing scheduler-service.ts infrastructure.
 *
 * Enhanced for Issue #82:
 * - Timezone normalization (GMT+1, CET, etc. → IANA)
 * - Auto-detect delivery channel from originating session
 * - Optional Google Calendar mirroring via MCP
 * - Direct memorize tool support
 */

import { tool, jsonSchema } from "ai";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq } from "drizzle-orm";
import { CronJob } from "cron";
import { getScheduler } from "@/lib/scheduler/scheduler-service";
import { normalizeTimezone, isValidTimezone } from "@/lib/utils/timezone";
import {
  parseScheduledAtToUtcIso,
  isScheduledAtInFutureUtc,
} from "@/lib/ai/tools/schedule-task-helpers";

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
  deliveryChannel?: "app" | "telegram" | "slack" | "whatsapp" | "auto";
  mirrorToCalendar?: boolean;
  calendarDurationMinutes?: number;
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
        "Timezone for schedule execution (IANA format preferred). Default: user's device timezone or 'UTC'. Examples: 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'. Also accepts: 'GMT+1', 'CET', 'EST', 'Berlin', 'Tokyo' — these will be auto-converted to IANA format. IMPORTANT: Always ask the user to confirm their timezone/city if not explicitly stated.",
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
    deliveryChannel: {
      type: "string",
      enum: ["app", "telegram", "slack", "whatsapp", "auto"],
      description:
        "Where to deliver the task result. 'auto' (default) = deliver to the same channel this message was sent from (e.g., if user asks via Telegram, results go to Telegram). 'app' = in-app only. 'telegram'/'slack'/'whatsapp' = force a specific channel.",
    },
    mirrorToCalendar: {
      type: "boolean",
      description:
        "If true, attempt to create a corresponding Google Calendar event via the configured MCP calendar tool. Default: false. Only works if a calendar MCP server (e.g., Composio) is configured and connected.",
    },
    calendarDurationMinutes: {
      type: "number",
      description:
        "Duration in minutes for the mirrored calendar event (default: 15). Only used when mirrorToCalendar is true.",
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
- "0 8 * * 1,3,5" - 8:00 AM on Mon, Wed, Fri

**Timezone handling:**
- ALWAYS use IANA timezone format (e.g., "Europe/Berlin", "America/New_York")
- If user says "GMT+1" or "Berlin time", convert to "Europe/Berlin"
- If timezone is ambiguous, ASK the user to confirm their city before scheduling
- Default: user's device timezone if known, otherwise UTC

**Delivery channel:**
- By default ("auto"), results are delivered to the same channel the user is chatting from
- If chatting via Telegram, the reminder will be sent to Telegram automatically
- User can override with deliveryChannel: "app", "telegram", "slack", "whatsapp"

**Calendar mirroring:**
- Set mirrorToCalendar: true to also create a Google Calendar event (requires configured MCP)
- calendarDurationMinutes defaults to 15 minutes`,

    inputSchema: scheduleTaskSchema,

    execute: async (input: ScheduleTaskInput) => {
      const {
        name,
        description,
        scheduleType,
        cronExpression,
        intervalMinutes,
        scheduledAt,
        prompt,
        enabled = true,
        priority = "normal",
        deliveryChannel = "auto",
        mirrorToCalendar = false,
        calendarDurationMinutes = 15,
      } = input;

      // === Timezone normalization ===
      const rawTimezone = input.timezone || "UTC";
      const tzResult = normalizeTimezone(rawTimezone);
      const timezone = tzResult.timezone;

      // Validate the normalized timezone is actually valid
      if (!isValidTimezone(timezone)) {
        return {
          success: false,
          error: `Invalid timezone "${rawTimezone}". Please use an IANA timezone like "Europe/Berlin", "America/New_York", or "Asia/Tokyo". You can also use city names like "Berlin" or "Tokyo".`,
        };
      }

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

      // Validate cron expression with the normalized timezone
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

      // Validate scheduled time is in the future for one-time schedules.
      // IMPORTANT: avoid locale-dependent `new Date(string)` parsing.
      let scheduledAtUtcIso: string | null = null;
      if (scheduleType === "once" && scheduledAt) {
        const parsed = parseScheduledAtToUtcIso(scheduledAt, timezone);
        if (!parsed.ok) {
          return { success: false, error: parsed.error };
        }
        scheduledAtUtcIso = parsed.scheduledAtIsoUtc;
        if (!isScheduledAtInFutureUtc(scheduledAtUtcIso)) {
          return {
            success: false,
            error: "scheduledAt must be in the future for one-time schedules",
          };
        }
      }

      try {
        // === Resolve delivery channel from session metadata ===
        let deliveryMethod: "session" | "channel" = "session";
        let deliveryConfig: Record<string, unknown> = {};

        if (deliveryChannel !== "app") {
          const channelInfo = await resolveDeliveryChannel(
            sessionId,
            deliveryChannel
          );
          if (channelInfo) {
            deliveryMethod = "channel";
            deliveryConfig = channelInfo;
          } else if (deliveryChannel !== "auto") {
            // User explicitly requested a channel but we couldn't find it
            console.warn(
              `[scheduleTask] User requested delivery via "${deliveryChannel}" but no matching channel connection found. Falling back to in-app.`
            );
          }
        }

        // Calculate next run time
        let nextRunAt: string | null = null;

        if (scheduleType === "cron" && cronExpression) {
          const job = new CronJob(cronExpression, () => {}, null, false, timezone);
          const nextDate = job.nextDate();
          nextRunAt = nextDate.toISO();
        } else if (scheduleType === "once" && scheduledAt) {
          // Store canonical UTC ISO for deterministic comparisons/execution.
          nextRunAt = scheduledAtUtcIso ?? scheduledAt;
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
            scheduledAt: scheduledAtUtcIso ?? scheduledAt ?? null,
            timezone,
            initialPrompt: prompt,
            enabled,
            priority,
            status: "active",
            resultSessionId: sessionId, // Link to current session by default
            deliveryMethod,
            deliveryConfig,
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

        // === Calendar mirroring via MCP ===
        let calendarResult: { success: boolean; eventId?: string; error?: string } | null = null;
        if (mirrorToCalendar) {
          calendarResult = await mirrorToGoogleCalendar({
            name,
            description: description || prompt,
            scheduleType,
            cronExpression,
            scheduledAt,
            timezone,
            nextRunAt,
            durationMinutes: calendarDurationMinutes,
            characterId,
          });
        }

        // Format human-readable schedule description
        let scheduleDescription: string;
        if (scheduleType === "cron" && cronExpression) {
          scheduleDescription = `Cron: ${cronExpression} (${timezone})`;
        } else if (scheduleType === "interval" && intervalMinutes) {
          scheduleDescription = `Every ${intervalMinutes} minutes`;
        } else if (scheduleType === "once" && scheduledAt) {
          const displayIso = scheduledAtUtcIso ?? scheduledAt;
          scheduleDescription = `Once at ${new Date(displayIso).toLocaleString()} (${timezone})`;
        } else {
          scheduleDescription = "Unknown schedule type";
        }

        const deliveryDescription =
          deliveryMethod === "channel"
            ? `Channel (${(deliveryConfig as any).channelType || "auto-detected"})`
            : "In-app";

        console.log(
          `[scheduleTask] Created task "${name}" (${scheduleType}) - Next run: ${nextRunAt} - Delivery: ${deliveryDescription}`
        );

        const result: Record<string, unknown> = {
          success: true,
          taskId: task.id,
          message: `Task "${name}" scheduled successfully`,
          schedule: scheduleDescription,
          nextRunAt,
          timezone,
          priority,
          enabled,
          delivery: deliveryDescription,
        };

        // Include timezone normalization warning if applicable
        if (tzResult.normalized && tzResult.warning) {
          result.timezoneNote = tzResult.warning;
        }

        // Include calendar mirroring result
        if (calendarResult) {
          result.calendarMirror = calendarResult.success
            ? { status: "created", eventId: calendarResult.eventId }
            : { status: "failed", error: calendarResult.error };
        }

        return result;
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

// =============================================================================
// DELIVERY CHANNEL RESOLUTION
// =============================================================================

/**
 * Resolve the delivery channel configuration from the current session metadata.
 *
 * When deliveryChannel is "auto", we look at the session metadata to find
 * the channel connection info (connectionId, peerId, threadId) that was
 * stored when the session was created from an inbound channel message.
 *
 * When deliveryChannel is a specific channel type (telegram/slack/whatsapp),
 * we search for a matching active channel connection for this user.
 */
async function resolveDeliveryChannel(
  sessionId: string,
  deliveryChannel: string
): Promise<Record<string, unknown> | null> {
  try {
    const { getSession } = await import("@/lib/db/queries");
    const session = await getSession(sessionId);
    if (!session) return null;

    const metadata = (session.metadata || {}) as Record<string, unknown>;

    // Check if this session was created from a channel conversation
    const channelConnectionId = metadata.channelConnectionId as string | undefined;
    const channelPeerId = metadata.channelPeerId as string | undefined;
    const channelThreadId = metadata.channelThreadId as string | null | undefined;
    const channelType = metadata.channelType as string | undefined;

    if (deliveryChannel === "auto") {
      // Auto-detect: use the originating channel if available
      if (channelConnectionId && channelPeerId) {
        console.log(
          `[scheduleTask] Auto-detected delivery channel: ${channelType} (connection=${channelConnectionId})`
        );
        return {
          connectionId: channelConnectionId,
          peerId: channelPeerId,
          threadId: channelThreadId ?? null,
          channelType: channelType || "unknown",
        };
      }
      // No channel metadata on session — fall back to in-app
      return null;
    }

    // Specific channel requested — find a matching connection
    if (channelType === deliveryChannel && channelConnectionId && channelPeerId) {
      // Current session matches the requested channel
      return {
        connectionId: channelConnectionId,
        peerId: channelPeerId,
        threadId: channelThreadId ?? null,
        channelType,
      };
    }

    // Search for any active connection of the requested type
    const { findActiveChannelConnection } = await import("@/lib/db/queries");
    if (typeof findActiveChannelConnection === "function") {
      const connection = await findActiveChannelConnection(
        session.userId!,
        deliveryChannel
      );
      if (connection) {
        // We have a connection but need a peerId — use the most recent conversation
        const { findRecentChannelConversation } = await import("@/lib/db/queries");
        if (typeof findRecentChannelConversation === "function") {
          const recentConvo = await findRecentChannelConversation(connection.id);
          if (recentConvo) {
            return {
              connectionId: connection.id,
              peerId: recentConvo.peerId,
              threadId: recentConvo.threadId ?? null,
              channelType: deliveryChannel,
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.warn("[scheduleTask] Error resolving delivery channel:", error);
    return null;
  }
}

// =============================================================================
// GOOGLE CALENDAR MIRRORING VIA MCP
// =============================================================================

/**
 * Attempt to create a Google Calendar event via the configured MCP calendar tool.
 *
 * This is a best-effort operation — if MCP is not configured or the tool call
 * fails, we return an error but don't fail the schedule creation.
 */
async function mirrorToGoogleCalendar(params: {
  name: string;
  description: string;
  scheduleType: string;
  cronExpression?: string;
  scheduledAt?: string;
  timezone: string;
  nextRunAt: string | null;
  durationMinutes: number;
  characterId: string;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const { MCPClientManager } = await import("@/lib/mcp/client-manager");
    const manager = MCPClientManager.getInstance();

    // Find a calendar-related MCP tool
    const connectedServers = manager.getConnectedServers();
    let calendarTool: { serverName: string; toolName: string } | null = null;

    for (const serverName of connectedServers) {
      const tools = manager.getServerTools(serverName);
      if (!tools) continue;

      for (const tool of tools) {
        const toolNameLower = tool.name.toLowerCase();
        if (
          toolNameLower.includes("calendar") &&
          (toolNameLower.includes("create") || toolNameLower.includes("add") || toolNameLower.includes("insert"))
        ) {
          calendarTool = { serverName, toolName: tool.name };
          break;
        }
      }
      if (calendarTool) break;
    }

    if (!calendarTool) {
      return {
        success: false,
        error: "No calendar MCP tool found. Please configure a Google Calendar MCP server (e.g., Composio) in Settings → MCP.",
      };
    }

    // Calculate event start/end times
    const startTime = params.nextRunAt || new Date().toISOString();
    const endTime = new Date(
      new Date(startTime).getTime() + params.durationMinutes * 60 * 1000
    ).toISOString();

    // Build calendar event arguments
    // These are common across most calendar MCP tools (Composio, etc.)
    const eventArgs: Record<string, unknown> = {
      summary: params.name,
      title: params.name,
      description: params.description,
      start: startTime,
      end: endTime,
      startTime,
      endTime,
      timezone: params.timezone,
      timeZone: params.timezone,
    };

    // For recurring events, add recurrence rule if possible
    if (params.scheduleType === "cron" && params.cronExpression) {
      eventArgs.description = `${params.description}\n\n[Seline scheduled task — cron: ${params.cronExpression}]`;
    }

    console.log(
      `[scheduleTask] Mirroring to Google Calendar via MCP: ${calendarTool.serverName}/${calendarTool.toolName}`
    );

    const result = await manager.executeTool(
      calendarTool.serverName,
      calendarTool.toolName,
      eventArgs
    );

    // Try to extract event ID from result
    const resultData = result as Record<string, unknown>;
    const eventId =
      (resultData.eventId as string) ||
      (resultData.id as string) ||
      (resultData.event_id as string) ||
      undefined;

    return { success: true, eventId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.warn("[scheduleTask] Calendar mirroring failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
