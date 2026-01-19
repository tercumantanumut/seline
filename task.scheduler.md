task.scheduler.md implementation plan

Comprehensive Implementation Plan: Generic Scheduled Agent Tasks for Seline
Executive Summary
This plan outlines a flexible, chat-based scheduled task system that treats scheduled tasks as configurable chat sessions rather than hardcoded workflows. The system leverages existing chat infrastructure to enable ANY type of agent task (Linear tickets, email summaries, data aggregation, etc.) to be scheduled and executed dynamically.

1. Architecture Overview
1.1 Core Design Philosophy
Key Insight: Scheduled tasks should be chat sessions with a pre-configured initial prompt, not separate execution paths. This:

Reuses 100% of existing chat infrastructure
Gives agents full access to all their tools
Stores results as regular messages for observability
Requires no changes to agent execution logic
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GENERIC SCHEDULED TASK ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐ │
│  │   Scheduler    │────▶│  Task Executor  │────▶│   Chat API Route        │ │
│  │  (Cron-based)  │     │  (Queue-based)  │     │  (Existing /api/chat)   │ │
│  └────────────────┘     └─────────────────┘     └─────────────────────────┘ │
│         │                      │                          │                  │
│         ▼                      ▼                          ▼                  │
│  ┌────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐ │
│  │   Schedule     │     │  Task Queue     │     │   Agent + Tools         │ │
│  │   Definitions  │     │  (SQLite)       │     │   (Full capabilities)   │ │
│  │   (DB Table)   │     │                 │     │                         │ │
│  └────────────────┘     └─────────────────┘     └─────────────────────────┘ │
│         │                      │                          │                  │
│         ▼                      ▼                          ▼                  │
│  ┌────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐ │
│  │  Observability │◀────│  Agent Runs     │◀────│   Session + Messages    │ │
│  │  (index.ts)    │     │  (triggerType:  │     │   (Results stored as    │ │
│  │                │     │   "cron")       │     │    regular chat)        │ │
│  └────────────────┘     └─────────────────┘     └─────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
1.2 Key Components
Component	Location	Purpose
Scheduler Service	lib/scheduler/scheduler-service.ts (new)	Cron-like job scheduling with timezone support
Task Queue	lib/scheduler/task-queue.ts (new)	SQLite-backed persistent queue (inspired by task_queue.py)
Task Executor	lib/scheduler/task-executor.ts (new)	Execute tasks via internal chat API call
Schedule Schema	lib/db/sqlite-schedule-schema.ts (new)	Database tables for schedules
API Routes	app/api/schedules/* (new)	CRUD for schedule management
UI Components	components/schedules/* (new)	Schedule configuration UI
2. Database Schema Design
2.1 New Tables (Following Existing Patterns)
// lib/db/sqlite-schedule-schema.ts

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, characters, sessions } from "./sqlite-schema";

// ============================================================================
// SCHEDULED TASKS TABLE
// ============================================================================

export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  characterId: text("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),
  
  // === Basic Info ===
  name: text("name").notNull(),
  description: text("description"),
  
  // === Schedule Configuration ===
  scheduleType: text("schedule_type", { 
    enum: ["cron", "interval", "once"] 
  }).default("cron").notNull(),
  cronExpression: text("cron_expression"), // e.g., "0 9 * * 1-5" (9am weekdays)
  intervalMinutes: integer("interval_minutes"), // For interval-based schedules
  scheduledAt: text("scheduled_at"), // For one-time schedules (ISO timestamp)
  timezone: text("timezone").default("UTC").notNull(),
  
  // === Task Definition (THE KEY PART) ===
  // The initial prompt that kicks off the agent conversation
  initialPrompt: text("initial_prompt").notNull(),
  // Optional: Template variables that get substituted at runtime
  // e.g., { "date_range": "{{LAST_7_DAYS}}", "team": "engineering" }
  promptVariables: text("prompt_variables", { mode: "json" }).default("{}").notNull(),
  // Optional: Context sources to inject before the prompt
  contextSources: text("context_sources", { mode: "json" }).default("[]").notNull(),
  
  // === Execution Settings ===
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  timeoutMs: integer("timeout_ms").default(300000).notNull(), // 5 min default
  priority: text("priority", { enum: ["high", "normal", "low"] }).default("normal").notNull(),
  
  // === Result Handling ===
  // Where to deliver results (creates a dedicated session by default)
  resultSessionId: text("result_session_id").references(() => sessions.id),
  // Create new session per run vs append to existing
  createNewSessionPerRun: integer("create_new_session_per_run", { mode: "boolean" }).default(true).notNull(),
  
  // === Timestamps ===
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
});

// ============================================================================
// SCHEDULED TASK RUNS TABLE (execution history)
// ============================================================================

export const scheduledTaskRuns = sqliteTable("scheduled_task_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .references(() => scheduledTasks.id, { onDelete: "cascade" })
    .notNull(),
  
  // Link to observability
  agentRunId: text("agent_run_id"), // Links to agentRuns table
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  
  // === Execution State ===
  status: text("status", { 
    enum: ["pending", "queued", "running", "succeeded", "failed", "cancelled", "timeout"] 
  }).default("pending").notNull(),
  
  // === Timing ===
  scheduledFor: text("scheduled_for").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  
  // === Retry Tracking ===
  attemptNumber: integer("attempt_number").default(1).notNull(),
  
  // === Results ===
  // Summary of what the agent produced (extracted from final message)
  resultSummary: text("result_summary"),
  error: text("error"),
  
  // === Metadata ===
  // The actual prompt sent (after variable substitution)
  resolvedPrompt: text("resolved_prompt"),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const scheduledTasksRelations = relations(scheduledTasks, ({ one, many }) => ({
  user: one(users, {
    fields: [scheduledTasks.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [scheduledTasks.characterId],
    references: [characters.id],
  }),
  resultSession: one(sessions, {
    fields: [scheduledTasks.resultSessionId],
    references: [sessions.id],
  }),
  runs: many(scheduledTaskRuns),
}));

export const scheduledTaskRunsRelations = relations(scheduledTaskRuns, ({ one }) => ({
  task: one(scheduledTasks, {
    fields: [scheduledTaskRuns.taskId],
    references: [scheduledTasks.id],
  }),
  session: one(sessions, {
    fields: [scheduledTaskRuns.sessionId],
    references: [sessions.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
export type ScheduledTaskRun = typeof scheduledTaskRuns.$inferSelect;
export type NewScheduledTaskRun = typeof scheduledTaskRuns.$inferInsert;

// Context source types for dynamic data injection
export interface ContextSource {
  type: "linear" | "github" | "database" | "api" | "file";
  config: Record<string, unknown>;
  // e.g., { type: "linear", config: { teamId: "...", projectIds: ["..."] } }
}

// Built-in template variables
export type TemplateVariable = 
  | "{{NOW}}"           // Current ISO timestamp
  | "{{TODAY}}"         // Today's date (YYYY-MM-DD)
  | "{{YESTERDAY}}"     // Yesterday's date
  | "{{LAST_7_DAYS}}"   // Date range for last 7 days
  | "{{LAST_30_DAYS}}"  // Date range for last 30 days
  | "{{WEEKDAY}}"       // Current day name
  | "{{MONTH}}"         // Current month name
  | string;             // Custom variables
2.2 Integration with Existing Schema
The new tables integrate seamlessly with:

agentRuns - Links scheduled runs to observability (triggerType: "cron" already exists!)
sessions - Results stored as regular chat sessions
characters - Each schedule belongs to an agent
users - User ownership for multi-tenancy
3. Scheduler Service Design
3.1 Core Scheduler (Cron-based)
// lib/scheduler/scheduler-service.ts

import { CronJob } from "cron";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks, scheduledTaskRuns } from "@/lib/db/sqlite-schedule-schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { TaskQueue, type QueuedTask } from "./task-queue";
import { getTemporalContextBlock } from "@/lib/ai/datetime-context";

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
    for (const [id, job] of this.jobs) {
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

    if (schedule.scheduleType === "cron" && schedule.cronExpression) {
      const job = new CronJob(
        schedule.cronExpression,
        () => this.triggerTask(schedule.id),
        null,
        true,
        schedule.timezone
      );
      this.jobs.set(schedule.id, job);

      // Update next run time
      const nextRun = job.nextDate().toISO();
      this.updateNextRunTime(schedule.id, nextRun);

      console.log(`[Scheduler] Registered cron job for "${schedule.name}" (${schedule.cronExpression})`);
    } else if (schedule.scheduleType === "once" && schedule.scheduledAt) {
      // One-time schedule - only register if in the future
      const scheduledTime = new Date(schedule.scheduledAt);
      if (scheduledTime > new Date()) {
        const job = new CronJob(
          scheduledTime,
          () => this.triggerTask(schedule.id),
          null,
          true,
          schedule.timezone
        );
        this.jobs.set(schedule.id, job);
        console.log(`[Scheduler] Registered one-time job for "${schedule.name}" at ${schedule.scheduledAt}`);
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
      resolvedPrompt: this.resolvePromptVariables(task.initialPrompt, task.promptVariables as Record<string, string>),
    }).returning();

    // Queue for execution
    this.taskQueue.enqueue({
      runId: run.id,
      taskId: task.id,
      characterId: task.characterId,
      userId: task.userId,
      prompt: run.resolvedPrompt!,
      contextSources: task.contextSources as ContextSource[],
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
    variables: Record<string, string>
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
3.2 Task Queue (Inspired by task_queue.py)
// lib/scheduler/task-queue.ts

import { db } from "@/lib/db/sqlite-client";
import { scheduledTaskRuns } from "@/lib/db/sqlite-schedule-schema";
import { eq } from "drizzle-orm";

export interface QueuedTask {
  runId: string;
  taskId: string;
  characterId: string;
  userId: string;
  prompt: string;
  contextSources: ContextSource[];
  timeoutMs: number;
  maxRetries: number;
  priority: "high" | "normal" | "low";
  createNewSession: boolean;
  existingSessionId?: string;
  attemptNumber?: number;
}

interface TaskQueueConfig {
  maxConcurrent?: number;
  retryDelayMs?: number;
}

export class TaskQueue {
  private queue: QueuedTask[] = [];
  private processing: Map<string, QueuedTask> = new Map();
  private config: Required<TaskQueueConfig>;
  private isRunning = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor(config: TaskQueueConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      retryDelayMs: config.retryDelayMs ?? 5000,
    };
  }

  /**
   * Add task to queue
   */
  enqueue(task: QueuedTask): void {
    // Insert based on priority
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const insertIndex = this.queue.findIndex(
      (t) => priorityOrder[t.priority] > priorityOrder[task.priority]
    );
    
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    // Update run status
    this.updateRunStatus(task.runId, "queued");
    
    console.log(`[TaskQueue] Enqueued task ${task.runId} (priority: ${task.priority}, queue size: ${this.queue.length})`);
  }

  /**
   * Start processing queue
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Process queue every second
    this.processInterval = setInterval(() => this.processQueue(), 1000);
    console.log("[TaskQueue] Started processing");
  }

  /**
   * Stop processing queue
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Wait for in-flight tasks to complete
    while (this.processing.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("[TaskQueue] Stopped processing");
  }

  /**
   * Process next tasks in queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    // Check if we can process more tasks
    while (
      this.queue.length > 0 && 
      this.processing.size < this.config.maxConcurrent
    ) {
      const task = this.queue.shift();
      if (!task) break;

      this.processing.set(task.runId, task);
      this.executeTask(task).catch(console.error);
    }
  }

  /**
   * Execute a single task via the chat API
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.updateRunStatus(task.runId, "running", { startedAt: new Date().toISOString() });

      console.log(`[TaskQueue] Executing task ${task.runId}`);

      // Execute via internal chat API call
      const result = await this.callChatAPI(task);

      // Success
      const durationMs = Date.now() - startTime;
      await this.updateRunStatus(task.runId, "succeeded", {
        completedAt: new Date().toISOString(),
        durationMs,
        resultSummary: result.summary,
        sessionId: result.sessionId,
        agentRunId: result.agentRunId,
      });

      console.log(`[TaskQueue] Task ${task.runId} completed in ${durationMs}ms`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const attemptNumber = task.attemptNumber ?? 1;

      if (attemptNumber < task.maxRetries) {
        // Retry with exponential backoff
        const retryDelay = this.config.retryDelayMs * Math.pow(2, attemptNumber - 1);
        console.log(`[TaskQueue] Task ${task.runId} failed, retrying in ${retryDelay}ms (attempt ${attemptNumber}/${task.maxRetries})`);

        await this.updateRunStatus(task.runId, "pending", {
          error: errorMessage,
          attemptNumber: attemptNumber + 1,
        });

        setTimeout(() => {
          this.enqueue({ ...task, attemptNumber: attemptNumber + 1 });
        }, retryDelay);

      } else {
        // Final failure
        await this.updateRunStatus(task.runId, "failed", {
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          error: errorMessage,
        });

        console.error(`[TaskQueue] Task ${task.runId} failed permanently: ${errorMessage}`);
      }

    } finally {
      this.processing.delete(task.runId);
    }
  }

  /**
   * Call the chat API internally to execute the task
   * This is the key integration point - we reuse the existing chat infrastructure
   */
  private async callChatAPI(task: QueuedTask): Promise<{
    sessionId: string;
    agentRunId?: string;
    summary?: string;
  }> {
    // Import dynamically to avoid circular dependencies
    const { createSession, createMessage, getSession } = await import("@/lib/db/queries");
    const { getCharacterFull } = await import("@/lib/characters/queries");
    
    // Get or create session
    let sessionId: string;
    if (task.existingSessionId && !task.createNewSession) {
      sessionId = task.existingSessionId;
    } else {
      const character = await getCharacterFull(task.characterId);
      const session = await createSession({
        title: `Scheduled: ${character?.name || "Agent"} - ${new Date().toLocaleDateString()}`,
        userId: task.userId,
        metadata: {
          characterId: task.characterId,
          scheduledTaskId: task.taskId,
          scheduledRunId: task.runId,
          isScheduledRun: true,
        },
      });
      sessionId = session.id;
    }

    // Create the user message (the scheduled prompt)
    await createMessage({
      sessionId,
      role: "user",
      content: [{ type: "text", text: task.prompt }],
      metadata: {
        isScheduledPrompt: true,
        scheduledTaskId: task.taskId,
      },
    });

    // Make internal API call to chat endpoint
    // This triggers the full agent execution with all tools
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
        "X-Character-Id": task.characterId,
        "X-Scheduled-Run": "true",
        // Internal auth bypass for scheduled tasks
        "X-Internal-Auth": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: task.prompt,
          },
        ],
        sessionId,
      }),
      signal: AbortSignal.timeout(task.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Chat API returned ${response.status}: ${await response.text()}`);
    }

    // Consume the streaming response (we don't need to parse it, just wait for completion)
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // Get the session to extract the agent run ID and summary
    const updatedSession = await getSession(sessionId);
    const agentRunId = (updatedSession?.metadata as Record<string, unknown>)?.lastAgentRunId as string | undefined;

    // Extract summary from last assistant message
    const { getMessages } = await import("@/lib/db/queries");
    const messages = await getMessages(sessionId);
    const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
    let summary: string | undefined;
    
    if (lastAssistantMessage?.content) {
      const content = lastAssistantMessage.content as Array<{ type: string; text?: string }>;
      const textParts = content.filter(p => p.type === "text" && p.text);
      summary = textParts.map(p => p.text).join("\n").slice(0, 500);
    }

    return {
      sessionId,
      agentRunId,
      summary,
    };
  }

  private async updateRunStatus(
    runId: string, 
    status: string, 
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await db.update(scheduledTaskRuns)
      .set({ status, ...data })
      .where(eq(scheduledTaskRuns.id, runId));
  }
}
4. API Routes
4.1 Schedule CRUD API
// app/api/schedules/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

// GET /api/schedules - List all schedules for user
export async function GET(req: NextRequest) {
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
    orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
  });

  return NextResponse.json({ schedules });
}

// POST /api/schedules - Create new schedule
export async function POST(req: NextRequest) {
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
    priority: priority || "normal",
    createNewSessionPerRun: createNewSessionPerRun ?? true,
  }).returning();

  // Register with scheduler
  await getScheduler().reloadSchedule(schedule.id);

  return NextResponse.json({ schedule }, { status: 201 });
}
// app/api/schedules/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

// GET /api/schedules/[id] - Get single schedule
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth(req);
  
  const schedule = await db.query.scheduledTasks.findFirst({
    where: and(
      eq(scheduledTasks.id, params.id),
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
}

// PATCH /api/schedules/[id] - Update schedule
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth(req);
  const body = await req.json();

  const [updated] = await db.update(scheduledTasks)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(scheduledTasks.id, params.id),
      eq(scheduledTasks.userId, userId)
    ))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  // Reload in scheduler
  await getScheduler().reloadSchedule(params.id);

  return NextResponse.json({ schedule: updated });
}

// DELETE /api/schedules/[id] - Delete schedule
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth(req);

  await db.delete(scheduledTasks)
    .where(and(
      eq(scheduledTasks.id, params.id),
      eq(scheduledTasks.userId, userId)
    ));

  // Unregister from scheduler
  await getScheduler().reloadSchedule(params.id);

  return NextResponse.json({ success: true });
}
// app/api/schedules/[id]/trigger/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { eq, and } from "drizzle-orm";
import { getScheduler } from "@/lib/scheduler/scheduler-service";

// POST /api/schedules/[id]/trigger - Manually trigger a schedule
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth(req);

  const schedule = await db.query.scheduledTasks.findFirst({
    where: and(
      eq(scheduledTasks.id, params.id),
      eq(scheduledTasks.userId, userId)
    ),
  });

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  // Trigger immediately
  await getScheduler().triggerTask(params.id);

  return NextResponse.json({ 
    success: true, 
    message: `Task "${schedule.name}" triggered` 
  });
}
5. UI/UX Design
5.1 New Locale Strings
// locales/en.json (additions)

{
  "schedules": {
    "title": "Scheduled Tasks",
    "subtitle": "Automate recurring agent tasks",
    "create": "Create Schedule",
    "empty": {
      "title": "No Scheduled Tasks",
      "description": "Set up automated tasks for your agents to run on a schedule.",
      "cta": "Create Your First Schedule"
    },
    "form": {
      "name": "Task Name",
      "namePlaceholder": "e.g., Daily Linear Summary",
      "description": "Description (optional)",
      "descriptionPlaceholder": "What this task does...",
      "agent": "Agent",
      "agentPlaceholder": "Select an agent to run this task",
      "scheduleType": "Schedule Type",
      "scheduleTypes": {
        "cron": "Cron Expression",
        "interval": "Repeat Interval",
        "once": "Run Once"
      },
      "cronExpression": "Cron Expression",
      "cronPlaceholder": "0 9 * * 1-5 (9am weekdays)",
      "cronHelp": "Use cron syntax: minute hour day month weekday",
      "intervalMinutes": "Interval (minutes)",
      "scheduledAt": "Run At",
      "timezone": "Timezone",
      "prompt": "Task Prompt",
      "promptPlaceholder": "What should the agent do? Use {{TODAY}}, {{LAST_7_DAYS}} for dynamic dates.",
      "promptHelp": "This prompt will be sent to the agent when the schedule triggers.",
      "variables": "Custom Variables",
      "variablesHelp": "Define custom {{VARIABLE}} placeholders for your prompt",
      "priority": "Priority",
      "priorities": {
        "high": "High",
        "normal": "Normal",
        "low": "Low"
      },
      "enabled": "Enabled",
      "advanced": "Advanced Settings",
      "maxRetries": "Max Retries",
      "timeoutMinutes": "Timeout (minutes)",
      "createNewSession": "Create new chat session per run",
      "existingSession": "Append to existing session"
    },
    "card": {
      "lastRun": "Last run: {time}",
      "nextRun": "Next run: {time}",
      "neverRun": "Never run",
      "runs": "{count} runs",
      "enabled": "Enabled",
      "disabled": "Disabled",
      "trigger": "Run Now",
      "edit": "Edit",
      "delete": "Delete",
      "viewHistory": "View History"
    },
    "history": {
      "title": "Run History",
      "status": {
        "pending": "Pending",
        "queued": "Queued",
        "running": "Running",
        "succeeded": "Succeeded",
        "failed": "Failed",
        "cancelled": "Cancelled",
        "timeout": "Timed Out"
      },
      "duration": "Duration: {duration}",
      "viewSession": "View Chat",
      "error": "Error: {message}"
    },
    "presets": {
      "title": "Quick Presets",
      "linearSummary": {
        "name": "Daily Linear Summary",
        "description": "Summarize Linear tickets and status each morning",
        "prompt": "Please summarize all Linear tickets updated in the last 24 hours. Group by status (In Progress, Done, Backlog) and highlight any blockers or items needing attention. Include assignee information."
      },
      "weeklyDigest": {
        "name": "Weekly Progress Digest",
        "description": "Weekly summary of project progress",
        "prompt": "Generate a weekly progress report for {{LAST_7_DAYS}}. Include: completed items, ongoing work, upcoming deadlines, and any risks or blockers identified."
      },
      "codeReview": {
        "name": "Daily Code Review",
        "description": "Review recent code changes",
        "prompt": "Review the code changes from {{YESTERDAY}}. Identify any potential issues, suggest improvements, and highlight notable patterns or concerns."
      }
    },
    "cronPresets": {
      "daily9am": "Daily at 9am",
      "weekdays9am": "Weekdays at 9am",
      "monday9am": "Mondays at 9am",
      "hourly": "Every hour",
      "custom": "Custom"
    },
    "toast": {
      "created": "Schedule created successfully",
      "updated": "Schedule updated",
      "deleted": "Schedule deleted",
      "triggered": "Task triggered - check the chat for results",
      "error": "Failed to save schedule"
    }
  }
}
5.2 UI Component Structure
components/schedules/
├── schedule-list.tsx         # List all schedules with status
├── schedule-card.tsx         # Individual schedule card
├── schedule-form.tsx         # Create/edit schedule form
├── schedule-history.tsx      # Run history table
├── cron-builder.tsx          # Visual cron expression builder
├── prompt-editor.tsx         # Prompt editor with variable hints
└── preset-selector.tsx       # Quick preset templates
5.3 Navigation Integration
Add to the agent sidebar (following existing patterns in locales/en.json):

// In the agent detail page sidebar
<SidebarItem
  icon={<ClockIcon />}
  label={t("chat.sidebar.schedules")}
  href={`/agents/${characterId}/schedules`}
/>
6. Data Flow Diagram
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SCHEDULED TASK EXECUTION FLOW                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. SCHEDULE TRIGGER                                                             │
│  ┌──────────────────┐                                                            │
│  │  Cron Job fires  │──────────────────────────────────────────────┐             │
│  │  (or manual)     │                                              │             │
│  └──────────────────┘                                              ▼             │
│                                                          ┌─────────────────────┐ │
│  2. TASK QUEUEING                                        │  scheduledTaskRuns  │ │
│  ┌──────────────────┐                                    │  (status: pending)  │ │
│  │  Resolve prompt  │◀───────────────────────────────────┤                     │ │
│  │  variables       │                                    └─────────────────────┘ │
│  │  ({{TODAY}}, etc)│                                                            │
│  └────────┬─────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐       │
│  │  TaskQueue       │────▶│  Priority Queue  │────▶│  status: queued     │       │
│  │  .enqueue()      │     │  (high/normal/   │     │                     │       │
│  │                  │     │   low)           │     └─────────────────────┘       │
│  └──────────────────┘     └──────────────────┘                                   │
│                                                                                  │
│  3. TASK EXECUTION (via existing chat infrastructure)                            │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐       │
│  │  TaskQueue       │────▶│  Create/Get      │────▶│  sessions table     │       │
│  │  .executeTask()  │     │  Session         │     │  (new or existing)  │       │
│  └────────┬─────────┘     └──────────────────┘     └─────────────────────┘       │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐       │
│  │  POST /api/chat  │────▶│  Chat API Route  │────▶│  messages table     │       │
│  │  (internal call) │     │  (full agent     │     │  (user + assistant) │       │
│  │                  │     │   execution)     │     │                     │       │
│  └──────────────────┘     └────────┬─────────┘     └─────────────────────┘       │
│                                    │                                             │
│                                    ▼                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐       │
│  │  Agent uses ALL  │────▶│  Tool Execution  │────▶│  toolRuns table     │       │
│  │  configured tools│     │  (Linear, web,   │     │  (observability)    │       │
│  │  (MCP, built-in) │     │   vectorSearch)  │     │                     │       │
│  └──────────────────┘     └──────────────────┘     └─────────────────────┘       │
│                                                                                  │
│  4. COMPLETION & OBSERVABILITY                                                   │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────┐       │
│  │  onFinish        │────▶│  agentRuns       │────▶│  triggerType: cron  │       │
│  │  callback        │     │  (observability) │     │  status: succeeded  │       │
│  └────────┬─────────┘     └──────────────────┘     └─────────────────────┘       │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                                   │
│  │  Update run      │────▶│  scheduledTask-  │                                   │
│  │  status + summary│     │  Runs (succeeded)│                                   │
│  └──────────────────┘     └──────────────────┘                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
7. Phased Rollout Plan
Phase 1: Foundation (Week 1-2)
Goal: Core scheduling infrastructure

Task	Priority	Effort
Create sqlite-schedule-schema.ts with migrations	High	2d
Implement SchedulerService with cron support	High	3d
Implement TaskQueue with priority and retry	High	2d
Add internal auth bypass for scheduled tasks	Medium	1d
Basic API routes (CRUD)	High	2d
Deliverable: Schedules can be created via API and execute via chat

Phase 2: UI/UX (Week 3-4)
Goal: User-friendly schedule management

Task	Priority	Effort
Schedule list page	High	2d
Schedule create/edit form	High	3d
Cron expression builder	Medium	2d
Run history view	High	2d
Locale strings (en, tr)	Medium	1d
Agent sidebar integration	Medium	1d
Deliverable: Users can create and manage schedules through UI

Phase 3: Enhancements (Week 5-6)
Goal: Advanced features and reliability

Task	Priority	Effort
Preset templates (Linear, weekly digest)	Medium	2d
Context source injection (Linear, GitHub)	Medium	3d
Email/Slack delivery options	Low	3d
Schedule pause/resume	Medium	1d
Bulk operations	Low	1d
Run cancellation	Medium	1d
Deliverable: Full-featured scheduling system

Phase 4: Observability & Polish (Week 7-8)
Goal: Production readiness

Task	Priority	Effort
Admin dashboard for schedules	Medium	2d
Metrics and alerting	Medium	2d
Documentation	High	2d
Performance optimization	Medium	2d
Error handling improvements	High	2d
Deliverable: Production-ready scheduled tasks

8. Testing Strategy
8.1 Unit Tests
// lib/scheduler/__tests__/scheduler-service.test.ts

describe("SchedulerService", () => {
  describe("resolvePromptVariables", () => {
    it("replaces {{TODAY}} with current date", () => {
      const result = service.resolvePromptVariables(
        "Report for {{TODAY}}",
        {}
      );
      expect(result).toMatch(/Report for \d{4}-\d{2}-\d{2}/);
    });

    it("replaces custom variables", () => {
      const result = service.resolvePromptVariables(
        "Team: {{TEAM}}",
        { TEAM: "engineering" }
      );
      expect(result).toBe("Team: engineering");
    });
  });

  describe("cron scheduling", () => {
    it("calculates correct next run time", () => {
      // Test cron expression parsing
    });
  });
});

describe("TaskQueue", () => {
  describe("priority ordering", () => {
    it("processes high priority tasks first", async () => {
      queue.enqueue({ ...task, priority: "low" });
      queue.enqueue({ ...task, priority: "high" });
      
      const first = await queue.dequeue();
      expect(first.priority).toBe("high");
    });
  });

  describe("retry logic", () => {
    it("retries failed tasks with exponential backoff", async () => {
      // Test retry behavior
    });
  });
});
8.2 Integration Tests
// app/api/schedules/__tests__/route.test.ts

describe("POST /api/schedules", () => {
  it("creates a schedule and registers with scheduler", async () => {
    const response = await fetch("/api/schedules", {
      method: "POST",
      body: JSON.stringify({
        characterId: testCharacter.id,
        name: "Test Schedule",
        cronExpression: "0 9 * * *",
        initialPrompt: "Test prompt",
      }),
    });

    expect(response.status).toBe(201);
    const { schedule } = await response.json();
    expect(schedule.name).toBe("Test Schedule");
  });
});

describe("POST /api/schedules/[id]/trigger", () => {
  it("manually triggers a schedule and creates a run", async () => {
    const response = await fetch(`/api/schedules/${schedule.id}/trigger`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    
    // Verify run was created
    const runs = await db.query.scheduledTaskRuns.findMany({
      where: eq(scheduledTaskRuns.taskId, schedule.id),
    });
    expect(runs.length).toBe(1);
  });
});
8.3 E2E Tests
// e2e/schedules.spec.ts

test("create and trigger a scheduled task", async ({ page }) => {
  // Navigate to schedules
  await page.goto("/agents/test-agent/schedules");
  
  // Create new schedule
  await page.click("text=Create Schedule");
  await page.fill('[name="name"]', "Daily Summary");
  await page.fill('[name="cronExpression"]', "0 9 * * *");
  await page.fill('[name="initialPrompt"]', "Summarize today's tasks");
  await page.click("text=Save");
  
  // Verify schedule appears
  await expect(page.locator("text=Daily Summary")).toBeVisible();
  
  // Trigger manually
  await page.click("text=Run Now");
  
  // Verify run started
  await expect(page.locator("text=Running")).toBeVisible();
});
9. Observability Integration
The system integrates with existing observability infrastructure:

9.1 Agent Run Tracking
// In task-executor.ts, when calling chat API:
const agentRun = await createAgentRun({
  sessionId,
  userId: task.userId,
  characterId: task.characterId,
  pipelineName: "scheduled-task",
  triggerType: "cron",  // Already supported in schema!
  metadata: {
    scheduledTaskId: task.taskId,
    scheduledRunId: task.runId,
    scheduleName: task.name,
  },
});
9.2 Event Logging
// Log schedule-specific events
await appendRunEvent({
  runId: agentRun.id,
  eventType: "step_started",
  stepName: "scheduled_task_execution",
  data: {
    taskId: task.taskId,
    prompt: task.prompt,
    attemptNumber: task.attemptNumber,
  },
});
10. Open Questions & Decisions Needed
10.1 Technical Decisions
Question	Options	Recommendation
Where to run scheduler?	A) In Next.js server (API route init), B) Separate Node process, C) Electron main process	A for web, C for desktop - Start simple, can extract later
Internal API auth?	A) Shared secret, B) Service account, C) Skip auth for internal calls	A (shared secret) - Simple and secure enough for local/internal
Session per run vs shared?	A) Always new session, B) Always shared, C) User choice	C (user choice) - Default to new, option to append
10.2 Product Decisions
Question	Options	Recommendation
Delivery options?	A) Chat only, B) Chat + Email, C) Chat + Email + Slack	A initially - Add B/C in Phase 3
Run limits?	A) Unlimited, B) Per-user limits, C) Per-plan limits	B (per-user) - Prevent runaway costs
Concurrent task limit?	A) 1, B) 3, C) Configurable	B (3 default) - Good balance
10.3 Required Changes to Existing Code
app/api/chat/route.ts - Add X-Scheduled-Run header handling and internal auth bypass
lib/observability/queries.ts - Already supports triggerType: "cron" ✓
lib/db/sqlite-schema.ts - Export schedule schema
App initialization - Start scheduler service on boot
11. Example Usage
11.1 Creating a Daily Linear Summary
// Via API
const schedule = await fetch("/api/schedules", {
  method: "POST",
  body: JSON.stringify({
    characterId: "my-architect-agent",
    name: "Daily Linear Summary",
    scheduleType: "cron",
    cronExpression: "0 9 * * 1-5", // 9am weekdays
    timezone: "America/New_York",
    initialPrompt: `
      Please analyze Linear tickets updated since {{YESTERDAY}}.
      
      For each ticket:
      1. Summarize the current status
      2. Identify the assignee
      3. Note any blockers or dependencies
      
      Group the summary by:
      - In Progress
      - Completed Yesterday
      - Blocked/Needs Attention
      
      If you find any tickets that seem stalled or at risk, 
      highlight them at the top of your summary.
    `,
    promptVariables: {},
    enabled: true,
  }),
});
11.2 Weekly Code Review Digest
const schedule = await fetch("/api/schedules", {
  method: "POST",
  body: JSON.stringify({
    characterId: "code-reviewer-agent",
    name: "Weekly Code Review",
    scheduleType: "cron",
    cronExpression: "0 10 * * 1", // Monday 10am
    timezone: "UTC",
    initialPrompt: `
      Review the codebase changes from {{LAST_7_DAYS}}.
      
      Use vectorSearch and localGrep to find:
      1. New files added
      2. Significant changes to existing files
      3. Any TODO or FIXME comments added
      
      Provide a summary of:
      - Key architectural changes
      - Potential code quality issues
      - Suggested improvements
      - Notable patterns (good or concerning)
    `,
    enabled: true,
  }),
});
Summary
This implementation plan provides a flexible, generic scheduled task system that:

Treats tasks as chat sessions - Reuses 100% of existing infrastructure
Supports any task type - Linear, email, code review, custom workflows
Uses familiar patterns - Follows existing codebase conventions
Integrates with observability - Full tracking via agentRuns with triggerType: "cron"
Provides great UX - Visual schedule builder, presets, run history
The key insight is that scheduled tasks are just automated chat sessions with a pre-configured prompt. This approach is simpler, more flexible, and requires far less new code than building a separate execution engine.