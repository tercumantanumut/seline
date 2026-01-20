/**
 * Scheduler Service
 *
 * Cron-based job scheduling with timezone support.
 * Manages scheduled tasks and queues them for execution.
 */

import { CronJob } from "cron";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks, scheduledTaskRuns, type ScheduledTask, type ContextSource } from "@/lib/db/sqlite-schedule-schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { TaskQueue } from "./task-queue";
import { resolveTimezone } from "@/lib/utils/timezone";

interface SchedulerConfig {
  checkIntervalMs?: number;  // How often to check for due tasks (default: 60s)
  maxConcurrentTasks?: number;
  enabled?: boolean;
}

export class SchedulerService {
  private jobs: Map<string, CronJob> = new Map();
  private taskQueue: TaskQueue;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: Required<SchedulerConfig>;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60_000,
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
      enabled: config.enabled ?? true,
    };
    this.taskQueue = new TaskQueue({
      maxConcurrent: this.config.maxConcurrentTasks,
    });
  }

  /**
   * Start the scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning || !this.config.enabled) return;
    this.isRunning = true;

    console.log("[Scheduler] Starting scheduler service");

    // Load all enabled schedules
    await this.loadSchedules();

    // Start periodic check for due tasks (catches missed runs)
    this.checkInterval = setInterval(
      () => this.checkAndQueueDueTasks(),
      this.config.checkIntervalMs
    );

    // Start the task queue processor
    this.taskQueue.start();
  }

  /**
   * Stop the scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log("[Scheduler] Stopping scheduler service");

    // Stop all cron jobs
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();

    // Stop periodic check
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop task queue
    await this.taskQueue.stop();

    this.isRunning = false;
  }

  /**
   * Load and register all enabled schedules from database
   */
  async loadSchedules(): Promise<void> {
    const schedules = await db.query.scheduledTasks.findMany({
      where: eq(scheduledTasks.enabled, true),
    });

    for (const schedule of schedules) {
      this.registerSchedule(schedule);
    }

    console.log(`[Scheduler] Loaded ${schedules.length} active schedules`);
  }

  /**
   * Register a single schedule as a cron job
   */
  registerSchedule(schedule: ScheduledTask): void {
    // Remove existing job if any
    if (this.jobs.has(schedule.id)) {
      this.jobs.get(schedule.id)?.stop();
      this.jobs.delete(schedule.id);
    }

    if (!schedule.enabled) return;

    // Resolve timezone - handles "local::America/New_York" format
    // This extracts the concrete timezone for server-side execution
    const concreteTimezone = resolveTimezone(schedule.timezone);

    if (schedule.scheduleType === "cron" && schedule.cronExpression) {
      try {
        const job = new CronJob(
          schedule.cronExpression,
          () => this.triggerTask(schedule.id),
          null,
          true,
          concreteTimezone
        );
        this.jobs.set(schedule.id, job);

        // Update next run time
        const nextRun = job.nextDate().toISO();
        if (nextRun) {
          void this.updateNextRunTime(schedule.id, nextRun);
        }

        console.log(`[Scheduler] Registered cron job for "${schedule.name}" (${schedule.cronExpression}) in ${concreteTimezone}`);
      } catch (error) {
        console.error(`[Scheduler] Failed to register cron job for "${schedule.name}":`, error);
      }
    } else if (schedule.scheduleType === "once" && schedule.scheduledAt) {
      // One-time schedule - only register if in the future
      const scheduledTime = new Date(schedule.scheduledAt);
      if (scheduledTime > new Date()) {
        try {
          const job = new CronJob(
            scheduledTime,
            () => this.triggerTask(schedule.id),
            null,
            true,
            concreteTimezone
          );
          this.jobs.set(schedule.id, job);
          console.log(`[Scheduler] Registered one-time job for "${schedule.name}" at ${schedule.scheduledAt} in ${concreteTimezone}`);
        } catch (error) {
          console.error(`[Scheduler] Failed to register one-time job for "${schedule.name}":`, error);
        }
      }
    }
    // Interval-based schedules are handled by checkAndQueueDueTasks
  }

  /**
   * Trigger a scheduled task (queue it for execution)
   */
  async triggerTask(taskId: string): Promise<void> {
    const task = await db.query.scheduledTasks.findFirst({
      where: eq(scheduledTasks.id, taskId),
      with: {
        character: true,
      },
    });

    if (!task || !task.enabled) {
      console.log(`[Scheduler] Task ${taskId} not found or disabled, skipping`);
      return;
    }

    console.log(`[Scheduler] Triggering task "${task.name}"`);

    // Create a run record
    const [run] = await db.insert(scheduledTaskRuns).values({
      taskId: task.id,
      status: "pending",
      scheduledFor: new Date().toISOString(),
      resolvedPrompt: this.resolvePromptVariables(
        task.initialPrompt,
        (task.promptVariables as Record<string, string>) || {},
        {
          agentName: task.character?.name || task.character?.displayName || "Agent",
          lastRunAt: task.lastRunAt || undefined,
        }
      ),
    }).returning();

    // Queue for execution
    this.taskQueue.enqueue({
      runId: run.id,
      taskId: task.id,
      taskName: task.name,
      characterId: task.characterId,
      userId: task.userId,
      prompt: run.resolvedPrompt!,
      contextSources: (task.contextSources as ContextSource[]) || [],
      timeoutMs: task.timeoutMs,
      maxRetries: task.maxRetries,
      priority: task.priority,
      createNewSession: task.createNewSessionPerRun,
      existingSessionId: task.resultSessionId || undefined,
    });

    // Update last run time
    await db.update(scheduledTasks)
      .set({ lastRunAt: new Date().toISOString() })
      .where(eq(scheduledTasks.id, taskId));
  }

  /**
   * Resolve template variables in prompt
   */
  private resolvePromptVariables(
    prompt: string,
    variables: Record<string, string>,
    context: { agentName?: string; lastRunAt?: string } = {}
  ): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const builtInVars: Record<string, string> = {
      "{{NOW}}": now.toISOString(),
      "{{TODAY}}": now.toISOString().split("T")[0],
      "{{YESTERDAY}}": yesterday.toISOString().split("T")[0],
      "{{LAST_7_DAYS}}": `${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
      "{{LAST_30_DAYS}}": `${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
      "{{WEEKDAY}}": now.toLocaleDateString("en-US", { weekday: "long" }),
      "{{MONTH}}": now.toLocaleDateString("en-US", { month: "long" }),
      "{{AGENT_NAME}}": context.agentName || "Agent",
      "{{LAST_RUN}}": context.lastRunAt || "Never",
    };

    let resolved = prompt;

    // Replace built-in variables
    for (const [key, value] of Object.entries(builtInVars)) {
      resolved = resolved.replaceAll(key, value);
    }

    // Replace custom variables
    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replaceAll(`{{${key}}}`, value);
    }

    return resolved;
  }

  /**
   * Check for due tasks and queue them (handles interval-based + missed runs)
   */
  private async checkAndQueueDueTasks(): Promise<void> {
    const now = new Date().toISOString();

    // Check for paused schedules that should auto-resume
    await this.checkPausedSchedules(now);

    // Find interval-based tasks that are due
    const dueTasks = await db.query.scheduledTasks.findMany({
      where: and(
        eq(scheduledTasks.enabled, true),
        eq(scheduledTasks.scheduleType, "interval"),
        or(
          isNull(scheduledTasks.nextRunAt),
          lte(scheduledTasks.nextRunAt, now)
        )
      ),
    });

    for (const task of dueTasks) {
      await this.triggerTask(task.id);

      // Calculate next run time for interval-based tasks
      if (task.intervalMinutes) {
        const nextRun = new Date(Date.now() + task.intervalMinutes * 60 * 1000);
        await this.updateNextRunTime(task.id, nextRun.toISOString());
      }
    }
  }

  /**
   * Check for paused schedules that should auto-resume
   */
  private async checkPausedSchedules(now: string): Promise<void> {
    try {
      // Find schedules that are paused but should auto-resume
      const toResume = await db.query.scheduledTasks.findMany({
        where: and(
          eq(scheduledTasks.enabled, false),
          lte(scheduledTasks.pausedUntil, now)
        ),
      });

      for (const task of toResume) {
        // Only auto-resume if pausedUntil is set (not indefinite pause)
        if (task.pausedUntil) {
          await db.update(scheduledTasks)
            .set({
              enabled: true,
              pausedAt: null,
              pausedUntil: null,
              pauseReason: null,
              updatedAt: now,
            })
            .where(eq(scheduledTasks.id, task.id));

          this.registerSchedule({ ...task, enabled: true, pausedAt: null, pausedUntil: null, pauseReason: null });
          console.log(`[Scheduler] Auto-resumed "${task.name}"`);
        }
      }
    } catch (error) {
      console.error("[Scheduler] Error checking paused schedules:", error);
    }
  }

  private async updateNextRunTime(taskId: string, nextRunAt: string): Promise<void> {
    await db.update(scheduledTasks)
      .set({ nextRunAt, updatedAt: new Date().toISOString() })
      .where(eq(scheduledTasks.id, taskId));
  }

  /**
   * Reload a specific schedule (called after updates)
   */
  async reloadSchedule(taskId: string): Promise<void> {
    const task = await db.query.scheduledTasks.findFirst({
      where: eq(scheduledTasks.id, taskId),
    });

    if (task) {
      this.registerSchedule(task);
    } else {
      // Task was deleted, remove job
      this.jobs.get(taskId)?.stop();
      this.jobs.delete(taskId);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; activeJobs: number; queueSize: number } {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      queueSize: this.taskQueue.getQueueSize(),
    };
  }

  /**
   * Cancel a queued or running run by ID
   */
  cancelRun(runId: string): Promise<boolean> {
    return this.taskQueue.cancel(runId);
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

export function getScheduler(): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService();
  }
  return schedulerInstance;
}

export function startScheduler(): Promise<void> {
  return getScheduler().start();
}

export function stopScheduler(): Promise<void> {
  return getScheduler().stop();
}
