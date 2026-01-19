/**
 * Scheduled Tasks Schema
 * 
 * Provides:
 * - scheduled_tasks: Schedule definitions with cron expressions, prompts, and settings
 * - scheduled_task_runs: Execution history and results
 */

import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions } from "./sqlite-schema";
import { characters } from "./sqlite-character-schema";

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
  
  // === Task Definition ===
  initialPrompt: text("initial_prompt").notNull(),
  promptVariables: text("prompt_variables", { mode: "json" }).default("{}").notNull(),
  contextSources: text("context_sources", { mode: "json" }).default("[]").notNull(),
  
  // === Execution Settings ===
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  timeoutMs: integer("timeout_ms").default(300000).notNull(), // 5 min default
  priority: text("priority", { enum: ["high", "normal", "low"] }).default("normal").notNull(),

  // === Pause/Resume ===
  pausedAt: text("paused_at"),       // When was it paused
  pausedUntil: text("paused_until"), // Auto-resume at this time (optional)
  pauseReason: text("pause_reason"), // User-provided reason

  // === Delivery Options ===
  deliveryMethod: text("delivery_method", {
    enum: ["session", "email", "slack", "webhook"]
  }).default("session").notNull(),
  deliveryConfig: text("delivery_config", { mode: "json" }).default("{}").notNull(),

  // === Result Handling ===
  resultSessionId: text("result_session_id").references(() => sessions.id),
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
  agentRunId: text("agent_run_id"),
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
  resultSummary: text("result_summary"),
  error: text("error"),
  
  // === Metadata ===
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
  injectAs?: "prepend" | "append" | "variable";
  variableName?: string;
}

// Built-in template variables
export type TemplateVariable =
  | "{{NOW}}"
  | "{{TODAY}}"
  | "{{YESTERDAY}}"
  | "{{LAST_7_DAYS}}"
  | "{{LAST_30_DAYS}}"
  | "{{WEEKDAY}}"
  | "{{MONTH}}"
  | string;

// Delivery configuration types
export type DeliveryMethod = "session" | "email" | "slack" | "webhook";

export interface EmailDeliveryConfig {
  recipients: string[];
  subject?: string;
  includeFullTranscript?: boolean;
}

export interface SlackDeliveryConfig {
  webhookUrl?: string;
  channelId?: string;
  mentionUsers?: string[];
}

export interface WebhookDeliveryConfig {
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  includeMetadata?: boolean;
}

export type DeliveryConfig = EmailDeliveryConfig | SlackDeliveryConfig | WebhookDeliveryConfig | Record<string, unknown>;
