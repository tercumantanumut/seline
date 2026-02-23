/**
 * Workflow subagent lifecycle tracking.
 * Wraps observability primitives (createAgentRun / appendRunEvent / completeAgentRun)
 * in a clean, typed API used by the delegate-to-subagent tool.
 *
 * Extracted from workflows.ts to isolate observability concerns.
 */

import { appendRunEvent, completeAgentRun, createAgentRun } from "@/lib/observability";

export async function registerWorkflowSubagentLifecycle(input: {
  workflowId: string;
  userId: string;
  agentId: string;
  sessionId: string;
}): Promise<{
  workflowRunId: string;
  observeSubAgent: (data?: Record<string, unknown>) => Promise<void>;
  stopSubAgent: (status: "succeeded" | "failed" | "cancelled", data?: Record<string, unknown>) => Promise<void>;
  markTaskCompleted: (data?: Record<string, unknown>) => Promise<void>;
}> {
  const run = await createAgentRun({
    sessionId: input.sessionId,
    userId: input.userId,
    characterId: input.agentId,
    pipelineName: "workflow-subagent",
    triggerType: "tool",
    metadata: {
      workflowId: input.workflowId,
      agentId: input.agentId,
    },
  });

  await appendRunEvent({
    runId: run.id,
    eventType: "step_started",
    pipelineName: "workflow-subagent",
    stepName: "SubagentStart",
    data: {
      workflowId: input.workflowId,
      agentId: input.agentId,
    },
  });

  return {
    workflowRunId: run.id,
    observeSubAgent: async (data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "ObserveSubagent",
        data: data ?? {},
      });
    },
    stopSubAgent: async (status, data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: status === "failed" ? "step_failed" : "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "SubagentStop",
        level: status === "failed" ? "error" : "info",
        data: {
          status,
          ...(data ?? {}),
        },
      });
      await completeAgentRun(run.id, status, data ?? {});
    },
    markTaskCompleted: async (data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "TaskCompleted",
        data: data ?? {},
      });
    },
  };
}
