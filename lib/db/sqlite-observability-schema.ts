/**
 * Observability Schema - Agent Runs, Events, and Prompt Versioning
 * 
 * Provides:
 * - agent_runs: Root span/correlation entity for agent executions
 * - agent_run_events: Append-only timeline of events within a run
 * - prompt_templates: Named prompt template definitions
 * - prompt_versions: Versioned content for prompt templates
 */

import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions, messages, toolRuns } from "./sqlite-schema";

// ============================================================================
// AGENT RUNS TABLE (Root span / correlation entity)
// ============================================================================

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").references(() => users.id),
  characterId: text("character_id"),
  
  // Pipeline identification
  pipelineName: text("pipeline_name").notNull(), // e.g. "chat", "enhance-prompt", "deep-research"
  pipelineVersion: text("pipeline_version"), // optional: commit SHA or semver
  triggerType: text("trigger_type", { 
    enum: ["chat", "api", "job", "cron", "webhook", "tool"] 
  }).default("api").notNull(),
  
  // Run status
  status: text("status", { 
    enum: ["running", "succeeded", "failed", "cancelled"] 
  }).default("running").notNull(),
  
  // Timing
  startedAt: text("started_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  
  // OpenTelemetry correlation (optional)
  traceId: text("trace_id"),
  spanId: text("span_id"),
  
  // Extensible metadata
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// AGENT RUN EVENTS TABLE (Append-only timeline)
// ============================================================================

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  runId: text("run_id")
    .references(() => agentRuns.id, { onDelete: "cascade" })
    .notNull(),
  
  // Timing
  timestamp: text("timestamp").default(sql`(datetime('now'))`).notNull(),
  durationMs: integer("duration_ms"),
  
  // Event classification
  eventType: text("event_type", { enum: [
    // Run lifecycle
    "run_started", "run_completed",
    // LLM operations
    "llm_request_started", "llm_request_completed", "llm_request_failed",
    // Tool operations
    "tool_started", "tool_completed", "tool_failed", "tool_retry",
    // Pipeline steps
    "step_started", "step_completed", "step_failed",
    // Prompt operations
    "prompt_compiled",
    // Parsing/validation
    "response_parsed", "validation_failed",
    // Guardrails
    "guardrail_blocked", "policy_violation",
  ]}).notNull(),
  level: text("level", { enum: ["debug", "info", "warn", "error"] }).default("info").notNull(),
  
  // Context references (all optional, denormalized for query efficiency)
  messageId: text("message_id").references(() => messages.id),
  toolRunId: text("tool_run_id").references(() => toolRuns.id),
  promptVersionId: text("prompt_version_id"), // FK added after prompt_versions defined
  
  // Pipeline context
  pipelineName: text("pipeline_name"), // denormalized for filtering
  stepName: text("step_name"),
  toolName: text("tool_name"),
  llmOperation: text("llm_operation"), // e.g. "planner", "synthesizer", "judge"
  
  // Structured event payload (discriminated by eventType)
  data: text("data", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// PROMPT TEMPLATES TABLE (Named template definitions)
// ============================================================================

export const promptTemplates = sqliteTable("prompt_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").unique().notNull(), // e.g. "pipeline:chat:system", "tool:vectorSearch:instructions"
  description: text("description"),
  owner: text("owner", { enum: ["system", "user", "team"] }).default("system").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// PROMPT VERSIONS TABLE (Versioned prompt content)
// ============================================================================

export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templateId: text("template_id")
    .references(() => promptTemplates.id, { onDelete: "cascade" })
    .notNull(),
  version: integer("version").notNull(), // Monotonic per template
  content: text("content").notNull(), // The template string
  contentHash: text("content_hash").notNull(), // SHA256 for dedupe/integrity
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  session: one(sessions, {
    fields: [agentRuns.sessionId],
    references: [sessions.id],
  }),
  user: one(users, {
    fields: [agentRuns.userId],
    references: [users.id],
  }),
  events: many(agentRunEvents),
}));

export const agentRunEventsRelations = relations(agentRunEvents, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentRunEvents.runId],
    references: [agentRuns.id],
  }),
  message: one(messages, {
    fields: [agentRunEvents.messageId],
    references: [messages.id],
  }),
  toolRun: one(toolRuns, {
    fields: [agentRunEvents.toolRunId],
    references: [toolRuns.id],
  }),
  promptVersion: one(promptVersions, {
    fields: [agentRunEvents.promptVersionId],
    references: [promptVersions.id],
  }),
}));

export const promptTemplatesRelations = relations(promptTemplates, ({ many }) => ({
  versions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one }) => ({
  template: one(promptTemplates, {
    fields: [promptVersions.templateId],
    references: [promptTemplates.id],
  }),
  createdBy: one(users, {
    fields: [promptVersions.createdByUserId],
    references: [users.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type NewAgentRunEvent = typeof agentRunEvents.$inferInsert;
export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type NewPromptVersion = typeof promptVersions.$inferInsert;

// Event type enum for type-safe event creation
export type AgentRunEventType =
  | "run_started" | "run_completed"
  | "llm_request_started" | "llm_request_completed" | "llm_request_failed"
  | "tool_started" | "tool_completed" | "tool_failed" | "tool_retry"
  | "step_started" | "step_completed" | "step_failed"
  | "prompt_compiled"
  | "response_parsed" | "validation_failed"
  | "guardrail_blocked" | "policy_violation";

export type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type AgentRunTriggerType = "chat" | "api" | "job" | "cron" | "webhook" | "tool";
export type EventLevel = "debug" | "info" | "warn" | "error";
