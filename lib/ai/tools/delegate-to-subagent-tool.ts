/**
 * Delegate to Sub-Agent Tool (Session-Based Async)
 *
 * Creates real persisted chat sessions for sub-agents, calls the internal
 * chat API (same pattern as lib/scheduler/task-queue.ts), tracks via agent
 * runs, and is visible in the UI with active session indicators + full
 * chat history.
 *
 * Actions:
 *   start    – create session, fire-and-forget chat API call, return immediately
 *   observe  – query DB for real message count, tool calls, last response content
 *   continue – send a follow-up message to an existing delegation session
 *   stop     – abort the running delegation
 *   list     – list active delegations + available sub-agents for the calling agent
 */

import { tool, jsonSchema } from "ai";

// Re-export all types and registry items for backward compatibility
export type { DelegateToSubagentToolOptions } from "./delegate-to-subagent-types";
export { MAX_OBSERVE_WAIT_SECONDS, MAX_ADVISORY_MAX_TURNS } from "./delegate-to-subagent-types";

// Re-export the external accessor used by API routes and system prompt builders
export { getActiveDelegationsForCharacter } from "./delegate-to-subagent-handlers";

import {
  normalizeCompatibilityInput,
  buildDelegationsSummary,
  handleStartAction,
  handleObserve,
  handleContinue,
  handleStop,
  handleList,
} from "./delegate-to-subagent-handlers";

import {
  MAX_OBSERVE_WAIT_SECONDS,
  MAX_ADVISORY_MAX_TURNS,
  type DelegateToSubagentToolOptions,
  type DelegateToSubagentInput,
  type DelegateResult,
} from "./delegate-to-subagent-types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const delegateSchema = jsonSchema<DelegateToSubagentInput>({
  type: "object",
  title: "DelegateToSubagentInput",
  description:
    "Delegate work to workflow sub-agents. Core flow: list -> start -> observe(waitSeconds) -> continue/stop. Supports compatibility options for run_in_background, resume, and advisory max_turns.",
  properties: {
    action: {
      type: "string",
      enum: ["start", "observe", "continue", "stop", "list"],
      description:
        "Action to perform: 'start' a new delegation, 'observe' progress and read full response, 'continue' with a follow-up message, 'stop' a running delegation, or 'list' available sub-agents and active delegations.",
    },
    agentId: {
      type: "string",
      description:
        "The ID of the sub-agent to delegate the task to. Optional for 'start' if agentName is provided.",
    },
    agentName: {
      type: "string",
      description:
        "The display name of the sub-agent to delegate the task to. Optional for 'start' if agentId is provided.",
    },
    task: {
      type: "string",
      description:
        "The task or question for the sub-agent. Be specific about what you need. Required for 'start'.",
    },
    context: {
      type: "string",
      description:
        "Optional additional context from the current conversation to help the sub-agent.",
    },
    delegationId: {
      type: "string",
      description:
        "The delegation ID returned by 'start'. Required for 'observe', 'continue', and 'stop'.",
    },
    followUpMessage: {
      type: "string",
      description:
        "A follow-up message to send to the sub-agent in an existing delegation session. Required for 'continue'.",
    },
    waitSeconds: {
      type: "number",
      minimum: 0,
      maximum: MAX_OBSERVE_WAIT_SECONDS,
      description:
        "Optional for 'observe' (and for 'start' when runInBackground=false). Wait this many seconds before returning (or until delegation completes), to avoid rapid polling loops. Example: 30, 60, 600.",
    },
    runInBackground: {
      type: "boolean",
      description:
        "Optional compatibility flag. For action='start', true (default) returns immediately; false performs a start then observe wait window before returning.",
    },
    run_in_background: {
      type: "boolean",
      description:
        "Snake_case compatibility alias for runInBackground.",
    },
    resume: {
      type: "string",
      description:
        "Optional compatibility alias for delegationId. With action='start', resume maps to continue using this delegationId and task as the follow-up message.",
    },
    maxTurns: {
      type: "number",
      minimum: 1,
      maximum: MAX_ADVISORY_MAX_TURNS,
      description:
        "Optional advisory execution cap for subagent turns (not a strict runtime enforcement). The cap is forwarded as instruction text to the delegated task.",
    },
    max_turns: {
      type: "number",
      minimum: 1,
      maximum: MAX_ADVISORY_MAX_TURNS,
      description:
        "Snake_case compatibility alias for maxTurns.",
    },
  },
  required: ["action"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createDelegateToSubagentTool(
  options: DelegateToSubagentToolOptions,
) {
  const { userId, characterId } = options;

  return tool({
    description:
      "Delegate work to a sub-agent in your workflow team. " +
      "Preferred orchestration sequence: list -> start -> observe(waitSeconds) -> continue/stop. " +
      "start runs in background by default; use runInBackground=false to start then wait via observe in a single call. " +
      "Use resume as a compatibility alias to continue an existing delegation by delegationId.",
    inputSchema: delegateSchema,
    execute: async (input: DelegateToSubagentInput): Promise<DelegateResult> => {
      const normalizedInput = normalizeCompatibilityInput(input);

      switch (normalizedInput.action) {
        case "start":
          return handleStartAction(normalizedInput, userId, characterId);
        case "observe":
          return handleObserve(normalizedInput, characterId);
        case "continue":
          return handleContinue(
            {
              ...normalizedInput,
              delegationId: normalizedInput.delegationId ?? normalizedInput.resume,
            },
            characterId
          );
        case "stop":
          return handleStop(normalizedInput, characterId);
        case "list":
          return handleList(characterId);
        default:
          return {
            success: false,
            error: `Unknown action: ${normalizedInput.action}. Use start, observe, continue, stop, or list.`,
            delegations: buildDelegationsSummary(characterId),
          };
      }
    },
  });
}
