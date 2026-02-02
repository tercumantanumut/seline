/**
 * Observability Module
 * 
 * Provides agent run tracking, event logging, and prompt versioning.
 * 
 * Usage:
 * 
 * ```ts
 * import { 
 *   withRunContext, 
 *   getRunContext, 
 *   createAgentRun, 
 *   appendRunEvent,
 *   getOrCreatePromptVersion 
 * } from "@/lib/observability";
 * 
 * // At pipeline entrypoint:
 * const run = await createAgentRun({ sessionId, pipelineName: "chat" });
 * await withRunContext({ runId: run.id, sessionId, pipelineName: "chat" }, async () => {
 *   // Your pipeline logic here
 *   const ctx = getRunContext()!;
 *   await appendRunEvent({ runId: ctx.runId, eventType: "step_started", stepName: "process" });
 * });
 * await completeAgentRun(run.id, "succeeded");
 * ```
 */

// Run context (AsyncLocalStorage-based)
export {
  type RunContextData,
  type CreateRunContextOptions,
  getRunContext,
  requireRunContext,
  withRunContext,
  withRunContextSync,
  updateRunContext,
  getRunElapsedMs,
} from "./run-context";

// Database queries
export {
  // Agent runs
  type CreateAgentRunOptions,
  createAgentRun,
  completeAgentRun,
  getAgentRun,
  listAgentRunsBySession,
  // Agent run events
  type AppendRunEventOptions,
  appendRunEvent,
  getRunEvents,
  // Prompt templates & versions
  getOrCreatePromptTemplate,
  getOrCreatePromptVersion,
  getPromptVersion,
  getLatestPromptVersion,
  listPromptVersions,
  listPromptTemplates,
  // Stale run management
  findStaleRuns,
  findZombieRuns,
  markRunAsTimedOut,
  markRunAsCancelled,
  cleanupStaleRuns,
  // Admin/List queries
  type ListAgentRunsOptions,
  listAgentRuns,
  getAgentRunWithEvents,
  // Prompt analytics
  type PromptVersionMetrics,
  getPromptVersionMetrics,
  getRunsByPromptVersion,
  getVersionAdoptionTimeline,
} from "./queries";

// Tool event handler integration
export {
  initializeToolEventHandler,
  isToolEventHandlerInitialized,
} from "./tool-event-handler";

// Traced LLM wrapper
export {
  generateTextTraced,
  type TracedLLMOptions,
  type GenerateTextTracedOptions,
  type GenerateTextTracedResult,
} from "./llm-traced";

// Cleanup job
export {
  startCleanupJob,
  stopCleanupJob,
} from "./cleanup-job";

// Re-export schema types for convenience
export type {
  AgentRun,
  NewAgentRun,
  AgentRunEvent,
  NewAgentRunEvent,
  PromptTemplate,
  NewPromptTemplate,
  PromptVersion,
  NewPromptVersion,
  AgentRunEventType,
  AgentRunStatus,
  AgentRunTriggerType,
  EventLevel,
} from "@/lib/db/sqlite-schema";
