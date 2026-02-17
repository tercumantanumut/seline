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
 *   list     – list all active delegations for the calling agent
 */

import { tool, jsonSchema } from "ai";
import { getCharacterFull } from "@/lib/characters/queries";
import {
  getWorkflowByAgentId,
  getWorkflowMembers,
} from "@/lib/agents/workflows";
import {
  createSession,
  getMessages,
} from "@/lib/db/sqlite-queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DelegateToSubagentToolOptions {
  sessionId: string;
  userId: string;
  characterId: string;
}

type DelegateAction = "start" | "observe" | "continue" | "stop" | "list";

interface DelegateToSubagentInput {
  action: DelegateAction;
  agentId?: string;
  task?: string;
  context?: string;
  delegationId?: string;
  followUpMessage?: string;
}

interface DelegateResult {
  success: boolean;
  error?: string;
  availableAgents?: Array<{ agentId: string; role: string; purpose: string }>;
  delegationId?: string;
  sessionId?: string;
  delegateAgent?: string;
  message?: string;
  running?: boolean;
  completed?: boolean;
  messageCount?: number;
  toolCallCount?: number;
  lastResponse?: string;
  allResponses?: string[];
  elapsed?: number;
  delegations?: Array<{
    delegationId: string;
    sessionId: string;
    delegateAgent: string;
    task: string;
    running: boolean;
    elapsed: number;
  }>;
}

// ---------------------------------------------------------------------------
// In-memory delegation registry (DB is source of truth for messages/runs)
// Persisted on globalThis to survive Next.js hot reloads.
// ---------------------------------------------------------------------------

interface ActiveDelegation {
  id: string;
  sessionId: string;
  delegateId: string;
  delegateName: string;
  delegatorId: string;
  workflowId: string;
  task: string;
  startedAt: number;
  abortController: AbortController;
  streamPromise: Promise<void>;
  settled: boolean;
  error?: string;
}

const activeDelegations: Map<string, ActiveDelegation> =
  ((globalThis as Record<string, unknown>).__activeDelegations as Map<string, ActiveDelegation>) ??
  ((globalThis as Record<string, unknown>).__activeDelegations = new Map<string, ActiveDelegation>());

let delegationCounter = 0;

function nextDelegationId(): string {
  delegationCounter += 1;
  return `del-${Date.now()}-${delegationCounter}`;
}

// ---------------------------------------------------------------------------
// Background execution helper (mirrors lib/scheduler/task-queue.ts:539-624)
// ---------------------------------------------------------------------------

function getChatApiBaseUrl(): string {
  // Match lib/scheduler/task-queue.ts — electron production uses port 3456
  const isElectronProduction =
    (typeof process !== "undefined" &&
      !!(process as unknown as Record<string, unknown>).resourcesPath ||
      !!process.env.ELECTRON_RESOURCES_PATH) &&
    process.env.ELECTRON_IS_DEV !== "1" &&
    process.env.NODE_ENV !== "development";

  return isElectronProduction
    ? "http://localhost:3456"
    : "http://localhost:3000";
}

async function executeDelegation(
  delegationId: string,
  sessionId: string,
  characterId: string,
  userMessage: string,
  abortController: AbortController,
): Promise<void> {
  const baseUrl = getChatApiBaseUrl();

  console.log(`[Delegation] ${delegationId} starting fetch to /api/chat`);

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId,
      "X-Character-Id": characterId,
      "X-Internal-Auth":
        process.env.INTERNAL_API_SECRET || "seline-internal-scheduler",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      sessionId,
    }),
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(
      `Chat API returned ${response.status}: ${await response.text()}`,
    );
  }

  // Consume the stream to completion
  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }

  console.log(`[Delegation] ${delegationId} stream ended, waiting for DB persistence`);

  // Wait for onFinish to persist the assistant message to DB.
  // The AI SDK's onFinish callback is async — the stream closes before it
  // completes its DB writes. Poll until the assistant message appears.
  for (let attempt = 0; attempt < 20; attempt++) {
    const msgs = await getMessages(sessionId);
    if (msgs.some((m) => m.role === "assistant")) {
      console.log(`[Delegation] ${delegationId} assistant message persisted`);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.warn(`[Delegation] ${delegationId} WARNING: assistant message not found after polling`);
}

// ---------------------------------------------------------------------------
// Text extraction helper
// ---------------------------------------------------------------------------

function extractTextFromContent(content: unknown): string | undefined {
  if (!content) return undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter(
        (p: Record<string, unknown>) =>
          p.type === "text" && typeof p.text === "string",
      )
      .map((p: Record<string, unknown>) => p.text as string);
    return textParts.length > 0 ? textParts.join("\n") : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const delegateSchema = jsonSchema<DelegateToSubagentInput>({
  type: "object",
  title: "DelegateToSubagentInput",
  description:
    "Delegate a task to a workflow sub-agent asynchronously. Use 'start' to begin, 'observe' to check progress and read the full response, 'continue' to send follow-up messages, 'stop' to cancel, 'list' to see all active delegations.",
  properties: {
    action: {
      type: "string",
      enum: ["start", "observe", "continue", "stop", "list"],
      description:
        "Action to perform: 'start' a new delegation, 'observe' progress and read the sub-agent's full response, 'continue' with a follow-up message, 'stop' a running delegation, or 'list' all active delegations.",
    },
    agentId: {
      type: "string",
      description:
        "The ID of the sub-agent to delegate the task to. Required for 'start'.",
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
      "Delegate a task to a sub-agent in your workflow team asynchronously. " +
      "The sub-agent gets its own chat session (visible in the UI with active indicator). " +
      "Use 'start' to begin, 'observe' to check progress and read the sub-agent's full response, " +
      "'continue' to send follow-up messages, 'stop' to cancel, 'list' to see all active delegations.",
    inputSchema: delegateSchema,
    execute: async (input: DelegateToSubagentInput): Promise<DelegateResult> => {
      switch (input.action) {
        case "start":
          return handleStart(input, userId, characterId);
        case "observe":
          return handleObserve(input);
        case "continue":
          return handleContinue(input);
        case "stop":
          return handleStop(input);
        case "list":
          return handleList(characterId);
        default:
          return {
            success: false,
            error: `Unknown action: ${input.action}. Use start, observe, continue, stop, or list.`,
          };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start or restart background execution for a delegation, tracking settlement. */
function startBackgroundExecution(
  delegation: ActiveDelegation,
  userMessage: string,
): void {
  const abortController = new AbortController();
  delegation.abortController = abortController;
  delegation.settled = false;

  const streamPromise = executeDelegation(
    delegation.id,
    delegation.sessionId,
    delegation.delegateId,
    userMessage,
    abortController,
  )
    .then(() => {
      delegation.settled = true;
    })
    .catch((err) => {
      delegation.settled = true;
      delegation.error = err instanceof Error ? err.message : String(err);
      console.error(`[Delegation] ${delegation.id} failed:`, delegation.error);
    });

  delegation.streamPromise = streamPromise;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleStart(
  input: DelegateToSubagentInput,
  userId: string,
  characterId: string,
): Promise<DelegateResult> {
  const { agentId, task, context: extraContext } = input;

  if (!agentId || !task) {
    return {
      success: false,
      error: "'agentId' and 'task' are required for the 'start' action.",
    };
  }

  // 0. Prevent self-delegation
  if (agentId === characterId) {
    return {
      success: false,
      error: "Cannot delegate to yourself. Choose a different sub-agent from the workflow.",
    };
  }

  // 1. Verify calling agent is an initiator in a workflow
  const membership = await getWorkflowByAgentId(characterId);
  if (!membership) {
    return {
      success: false,
      error:
        "You are not part of a workflow. Delegation requires an active workflow with sub-agents.",
    };
  }
  if (membership.member.role !== "initiator") {
    return {
      success: false,
      error: "Only the workflow initiator can delegate tasks to sub-agents.",
    };
  }

  // 2. Verify target agent is in the same workflow
  const members = await getWorkflowMembers(membership.workflow.id);
  const targetMember = members.find((m) => m.agentId === agentId);
  if (!targetMember) {
    const availableAgents = members
      .filter((m) => m.agentId !== characterId)
      .map((m) => ({
        agentId: m.agentId,
        role: m.role,
        purpose: m.metadataSeed?.purpose || "unknown",
      }));
    return {
      success: false,
      error: `Agent ${agentId} is not a member of this workflow.`,
      availableAgents,
    };
  }

  // 3. Load the sub-agent character
  const subAgent = await getCharacterFull(agentId);
  if (!subAgent) {
    return { success: false, error: `Sub-agent ${agentId} not found.` };
  }

  // 4. Create a real session for the sub-agent
  // NOTE: characterId MUST be in metadata — createSession's extractSessionMetadataColumns
  // promotes metadata.characterId to the DB column. Passing it only as a top-level field
  // gets overridden to null by the metadata extraction spread.
  const session = await createSession({
    title: `Delegation: ${task.slice(0, 50)}`,
    userId,
    metadata: {
      isDelegation: true,
      parentAgentId: characterId,
      workflowId: membership.workflow.id,
      characterId: agentId,
      characterName: subAgent.displayName || subAgent.name,
    },
  });

  // 5. Build the user message
  const userMessage = extraContext
    ? `${task}\n\nAdditional context:\n${extraContext}`
    : task;

  // 6. Fire-and-forget: call internal chat API
  // The chat API handles user message persistence, agent run creation,
  // task registry, SSE events, and green dot indicators automatically.
  const delegationId = nextDelegationId();

  const delegation: ActiveDelegation = {
    id: delegationId,
    sessionId: session.id,
    delegateId: agentId,
    delegateName: subAgent.displayName || subAgent.name,
    delegatorId: characterId,
    workflowId: membership.workflow.id,
    task,
    startedAt: Date.now(),
    abortController: new AbortController(),
    streamPromise: Promise.resolve(),
    settled: false,
  };

  startBackgroundExecution(delegation, userMessage);
  activeDelegations.set(delegationId, delegation);

  return {
    success: true,
    delegationId,
    sessionId: session.id,
    delegateAgent: delegation.delegateName,
    message:
      "Delegation started. A real chat session has been created for the sub-agent. " +
      "Use 'observe' with the delegationId to check progress and read the full response, " +
      "'continue' to send follow-up messages, or navigate to the sub-agent's chat to see it live.",
  };
}

async function handleObserve(
  input: DelegateToSubagentInput,
): Promise<DelegateResult> {
  const { delegationId } = input;
  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'observe' action.",
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed and been cleaned up.`,
    };
  }

  // If delegation failed, return the error immediately
  if (delegation.error) {
    return {
      success: false,
      delegationId,
      sessionId: delegation.sessionId,
      delegateAgent: delegation.delegateName,
      error: `Delegation failed: ${delegation.error}`,
      running: false,
      completed: true,
      elapsed: Date.now() - delegation.startedAt,
    };
  }

  // Query real data from DB
  const messages = await getMessages(delegation.sessionId);
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const toolMessages = messages.filter((m) => m.role === "tool");

  // Extract all assistant responses
  const allResponses = assistantMessages
    .map((m) => extractTextFromContent(m.content))
    .filter((t): t is string => !!t);

  const lastResponse = allResponses[allResponses.length - 1];

  const isRunning = !delegation.settled;

  // Auto-cleanup finished delegations older than 10 minutes
  if (delegation.settled && Date.now() - delegation.startedAt > 10 * 60 * 1000) {
    activeDelegations.delete(delegationId);
  }

  return {
    success: true,
    delegationId,
    sessionId: delegation.sessionId,
    delegateAgent: delegation.delegateName,
    running: isRunning,
    completed: delegation.settled,
    elapsed: Date.now() - delegation.startedAt,
    messageCount: messages.length,
    toolCallCount: toolMessages.length,
    lastResponse: lastResponse
      ? lastResponse.length > 8000
        ? lastResponse.slice(0, 8000) + "\n\n[Response truncated]"
        : lastResponse
      : undefined,
    allResponses,
  };
}

async function handleContinue(
  input: DelegateToSubagentInput,
): Promise<DelegateResult> {
  const { delegationId, followUpMessage } = input;

  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'continue' action.",
    };
  }
  if (!followUpMessage) {
    return {
      success: false,
      error: "'followUpMessage' is required for the 'continue' action.",
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed and been cleaned up.`,
    };
  }

  // If previous stream is still running, abort it first
  if (!delegation.settled) {
    delegation.abortController.abort();
    // Give it a moment to settle
    await new Promise((r) => setTimeout(r, 100));
  }

  // Fire new chat API call with the follow-up message
  // The chat route handles message persistence automatically.
  startBackgroundExecution(delegation, followUpMessage);

  return {
    success: true,
    delegationId,
    sessionId: delegation.sessionId,
    delegateAgent: delegation.delegateName,
    message:
      "Follow-up message sent. The sub-agent is processing your message. " +
      "Use 'observe' to check the response.",
  };
}

async function handleStop(
  input: DelegateToSubagentInput,
): Promise<DelegateResult> {
  const { delegationId } = input;
  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'stop' action.",
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed.`,
    };
  }

  // Abort the streaming fetch
  delegation.abortController.abort();
  activeDelegations.delete(delegationId);

  return {
    success: true,
    delegationId,
    message: `Delegation ${delegationId} stopped and cancelled.`,
  };
}

async function handleList(
  characterId: string,
): Promise<DelegateResult> {
  const results: DelegateResult["delegations"] = [];

  // Clean up stale entries and collect results
  const staleIds: string[] = [];

  for (const [id, del] of activeDelegations.entries()) {
    if (del.delegatorId !== characterId) continue;

    // Auto-cleanup settled delegations older than 10 minutes
    if (del.settled && Date.now() - del.startedAt > 10 * 60 * 1000) {
      staleIds.push(id);
      continue;
    }

    results.push({
      delegationId: id,
      sessionId: del.sessionId,
      delegateAgent: del.delegateName,
      task: del.task.length > 100 ? del.task.slice(0, 100) + "..." : del.task,
      running: !del.settled,
      elapsed: Date.now() - del.startedAt,
    });
  }

  for (const id of staleIds) {
    activeDelegations.delete(id);
  }

  return {
    success: true,
    delegations: results,
    message:
      results.length === 0
        ? "No active delegations."
        : `${results.length} delegation(s) found.`,
  };
}
