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
import { getCharacterFull } from "@/lib/characters/queries";
import {
  getWorkflowByAgentId,
  getWorkflowMembers,
  type AgentWorkflowMember,
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
  agentName?: string;
  task?: string;
  context?: string;
  delegationId?: string;
  followUpMessage?: string;
  waitSeconds?: number;
}

interface AvailableSubagent {
  agentId: string;
  agentName: string;
  role: string;
  purpose: string;
}

interface DelegateResult {
  success: boolean;
  error?: string;
  availableAgents?: AvailableSubagent[];
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
  waitedMs?: number;
  waitTimedOut?: boolean;
  delegations?: Array<{
    delegationId: string;
    sessionId: string;
    delegateAgentId: string;
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
const MAX_OBSERVE_WAIT_SECONDS = 10 * 60;

function nextDelegationId(): string {
  delegationCounter += 1;
  return `del-${Date.now()}-${delegationCounter}`;
}

// ---------------------------------------------------------------------------
// Read-only accessor for external consumers (API routes, system prompt)
// ---------------------------------------------------------------------------

export function getActiveDelegationsForCharacter(
  characterId: string,
): Array<{
  delegationId: string;
  sessionId: string;
  delegateAgentId: string;
  delegateAgent: string;
  task: string;
  running: boolean;
  elapsed: number;
}> {
  const results: Array<{
    delegationId: string;
    sessionId: string;
    delegateAgentId: string;
    delegateAgent: string;
    task: string;
    running: boolean;
    elapsed: number;
  }> = [];

  const staleIds: string[] = [];
  for (const [id, del] of activeDelegations.entries()) {
    if (del.delegatorId !== characterId) continue;
    if (del.settled && Date.now() - del.startedAt > 10 * 60 * 1000) {
      staleIds.push(id);
      continue;
    }
    results.push({
      delegationId: id,
      sessionId: del.sessionId,
      delegateAgentId: del.delegateId,
      delegateAgent: del.delegateName,
      task: del.task.length > 100 ? del.task.slice(0, 100) + "..." : del.task,
      running: !del.settled,
      elapsed: Date.now() - del.startedAt,
    });
  }
  for (const id of staleIds) {
    activeDelegations.delete(id);
  }
  return results;
}

/** Build compact delegations array for inclusion in all tool responses. */
function buildDelegationsSummary(characterId: string): DelegateResult["delegations"] {
  return getActiveDelegationsForCharacter(characterId);
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
    const errorText = await response.text().catch(() => "").then(t => t.slice(0, 500));
    throw new Error(
      `Chat API returned ${response.status}: ${errorText}`,
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

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateObserveWaitSeconds(waitSeconds?: number): { waitMs: number; error?: string } {
  if (waitSeconds === undefined) {
    return { waitMs: 0 };
  }

  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
    return {
      waitMs: 0,
      error: "'waitSeconds' must be a non-negative number.",
    };
  }

  if (waitSeconds > MAX_OBSERVE_WAIT_SECONDS) {
    return {
      waitMs: 0,
      error: `'waitSeconds' cannot exceed ${MAX_OBSERVE_WAIT_SECONDS} (10 minutes).`,
    };
  }

  return { waitMs: waitSeconds * 1000 };
}

type SubagentCandidate = {
  member: AgentWorkflowMember;
  agentId: string;
  agentName: string;
  purpose: string;
};

async function buildSubagentCandidates(
  members: AgentWorkflowMember[],
  currentAgentId: string,
): Promise<SubagentCandidate[]> {
  const subagentMembers = members.filter(
    (member) => member.role === "subagent" && member.agentId !== currentAgentId,
  );

  const candidates = await Promise.all(
    subagentMembers.map(async (member): Promise<SubagentCandidate> => {
      const character = await getCharacterFull(member.agentId);
      const charRecord = character as
        | {
            name?: string;
            displayName?: string;
            tagline?: string;
            description?: string;
          }
        | null;

      const agentName =
        (typeof charRecord?.displayName === "string" && charRecord.displayName.trim()) ||
        (typeof charRecord?.name === "string" && charRecord.name.trim()) ||
        member.agentId;

      const purpose =
        member.metadataSeed?.purpose ||
        (typeof charRecord?.tagline === "string" && charRecord.tagline.trim()) ||
        (typeof charRecord?.description === "string" && charRecord.description.trim()) ||
        "No purpose set";

      return {
        member,
        agentId: member.agentId,
        agentName,
        purpose,
      };
    }),
  );

  return candidates.sort((a, b) => a.agentName.localeCompare(b.agentName));
}

function toAvailableAgents(candidates: SubagentCandidate[]): AvailableSubagent[] {
  return candidates.map((candidate) => ({
    agentId: candidate.agentId,
    agentName: candidate.agentName,
    role: candidate.member.role,
    purpose: candidate.purpose,
  }));
}

function resolveSubagentCandidate(
  candidates: SubagentCandidate[],
  selection: { agentId?: string; agentName?: string },
): { candidate?: SubagentCandidate; error?: string } {
  const { agentId, agentName } = selection;

  if (agentId) {
    const byId = candidates.find((candidate) => candidate.agentId === agentId);
    if (!byId) {
      return { error: `No workflow sub-agent found with id "${agentId}".` };
    }

    if (agentName) {
      const normalizedRequested = normalizeLookup(agentName);
      const normalizedActual = normalizeLookup(byId.agentName);
      if (normalizedRequested !== normalizedActual) {
        return {
          error:
            `agentId "${agentId}" resolved to "${byId.agentName}", but agentName "${agentName}" does not match. ` +
            "Use either agentId alone or provide a matching agentName.",
        };
      }
    }

    return { candidate: byId };
  }

  if (!agentName) {
    return { error: "Provide either agentId or agentName for action=start." };
  }

  const normalizedName = normalizeLookup(agentName);
  const exactMatches = candidates.filter(
    (candidate) => normalizeLookup(candidate.agentName) === normalizedName,
  );

  if (exactMatches.length === 1) {
    return { candidate: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return {
      error:
        `agentName "${agentName}" is ambiguous (${exactMatches.length} exact matches). ` +
        "Use agentId to target a specific sub-agent.",
    };
  }

  const partialMatches = candidates.filter((candidate) =>
    normalizeLookup(candidate.agentName).includes(normalizedName),
  );
  if (partialMatches.length === 1) {
    return { candidate: partialMatches[0] };
  }
  if (partialMatches.length > 1) {
    return {
      error:
        `agentName "${agentName}" matches multiple sub-agents (${partialMatches.length} partial matches). ` +
        "Use agentId to disambiguate.",
    };
  }

  return { error: `No workflow sub-agent found with name "${agentName}".` };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const delegateSchema = jsonSchema<DelegateToSubagentInput>({
  type: "object",
  title: "DelegateToSubagentInput",
  description:
    "Delegate a task to a workflow sub-agent asynchronously. Use 'list' if needed to refresh available sub-agents (names + IDs), 'start' to begin, 'observe' to check progress and read the full response (optionally with waitSeconds), 'continue' to send follow-up messages, 'stop' to cancel.",
  properties: {
    action: {
      type: "string",
      enum: ["start", "observe", "continue", "stop", "list"],
      description:
        "Action to perform: 'start' a new delegation, 'observe' progress and read the sub-agent's full response (supports waitSeconds), 'continue' with a follow-up message, 'stop' a running delegation, or 'list' available sub-agents and active delegations.",
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
        "Optional for 'observe'. Wait this many seconds before returning (or until delegation completes), to avoid rapid polling loops. Example: 30, 60, 600.",
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
      "Use 'list' if needed to discover or refresh available sub-agents (names + IDs). " +
      "Then use 'start' with either agentId or agentName, 'observe' to check progress and read the sub-agent's full response (optionally with waitSeconds), " +
      "'continue' to send follow-up messages, or 'stop' to cancel.",
    inputSchema: delegateSchema,
    execute: async (input: DelegateToSubagentInput): Promise<DelegateResult> => {
      switch (input.action) {
        case "start":
          return handleStart(input, userId, characterId);
        case "observe":
          return handleObserve(input, characterId);
        case "continue":
          return handleContinue(input, characterId);
        case "stop":
          return handleStop(input, characterId);
        case "list":
          return handleList(characterId);
        default:
          return {
            success: false,
            error: `Unknown action: ${input.action}. Use start, observe, continue, stop, or list.`,
            delegations: buildDelegationsSummary(characterId),
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
  const { agentId, agentName, task, context: extraContext } = input;

  if (!task) {
    return {
      success: false,
      error: "'task' is required for the 'start' action.",
      delegations: buildDelegationsSummary(characterId),
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

  // 2. Resolve sub-agent selection by ID or Name
  const members = await getWorkflowMembers(membership.workflow.id);
  const candidates = await buildSubagentCandidates(members, characterId);
  const availableAgents = toAvailableAgents(candidates);

  if (candidates.length === 0) {
    return {
      success: false,
      error: "No sub-agents are available in this workflow.",
      availableAgents,
    };
  }

  const resolution = resolveSubagentCandidate(candidates, { agentId, agentName });
  if (!resolution.candidate) {
    return {
      success: false,
      error: resolution.error,
      availableAgents,
      delegations: buildDelegationsSummary(characterId),
    };
  }

  // 3. Prevent self-delegation (defensive)
  if (resolution.candidate.agentId === characterId) {
    return {
      success: false,
      error: "Cannot delegate to yourself. Choose a different sub-agent from the workflow.",
      availableAgents,
      delegations: buildDelegationsSummary(characterId),
    };
  }

  // 3b. Prevent duplicate delegation to the same sub-agent
  for (const [existingId, existingDel] of activeDelegations.entries()) {
    if (
      existingDel.delegateId === resolution.candidate.agentId &&
      existingDel.delegatorId === characterId &&
      !existingDel.settled
    ) {
      return {
        success: false,
        delegationId: existingId,
        sessionId: existingDel.sessionId,
        delegateAgent: existingDel.delegateName,
        error:
          `Active delegation already exists to "${existingDel.delegateName}" (${existingId}). ` +
          `Use observe/continue/stop instead of starting a new one.`,
        availableAgents,
        delegations: buildDelegationsSummary(characterId),
      };
    }
  }

  // 4. Load the sub-agent character
  const subAgent = await getCharacterFull(resolution.candidate.agentId);
  if (!subAgent) {
    return {
      success: false,
      error: `Sub-agent ${resolution.candidate.agentId} not found.`,
      availableAgents,
    };
  }

  // 5. Create a real session for the sub-agent
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
      characterId: resolution.candidate.agentId,
      characterName: resolution.candidate.agentName,
    },
  });

  // 6. Build the user message
  const userMessage = extraContext
    ? `${task}\n\nAdditional context:\n${extraContext}`
    : task;

  // 7. Fire-and-forget: call internal chat API
  // The chat API handles user message persistence, agent run creation,
  // task registry, SSE events, and green dot indicators automatically.
  const delegationId = nextDelegationId();

  const delegation: ActiveDelegation = {
    id: delegationId,
    sessionId: session.id,
    delegateId: resolution.candidate.agentId,
    delegateName: resolution.candidate.agentName,
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
      `IMPORTANT: Save this delegationId (${delegationId}) — required for observe/continue/stop. ` +
      "Delegation started. A real chat session has been created for the sub-agent. " +
      "Use 'observe' with the delegationId to check progress and read the full response. " +
      "Set observe.waitSeconds (for example 30, 60, or 600) to wait intentionally instead of re-checking too frequently. " +
      "'continue' to send follow-up messages, or navigate to the sub-agent's chat to see it live.",
    availableAgents,
    delegations: buildDelegationsSummary(characterId),
  };
}

async function handleObserve(
  input: DelegateToSubagentInput,
  characterId: string,
): Promise<DelegateResult> {
  const { delegationId, waitSeconds } = input;
  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'observe' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  const waitValidation = validateObserveWaitSeconds(waitSeconds);
  if (waitValidation.error) {
    return {
      success: false,
      error: waitValidation.error,
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed and been cleaned up.`,
      delegations: buildDelegationsSummary(characterId),
    };
  }

  const observeStart = Date.now();

  if (!delegation.settled && waitValidation.waitMs > 0) {
    await Promise.race([
      delegation.streamPromise,
      sleep(waitValidation.waitMs),
    ]);
  }

  // If delegation failed, return the error immediately
  if (delegation.error) {
    const waitedMs = Date.now() - observeStart;
    return {
      success: false,
      delegationId,
      sessionId: delegation.sessionId,
      delegateAgent: delegation.delegateName,
      error: `Delegation failed: ${delegation.error}`,
      running: false,
      completed: true,
      elapsed: Date.now() - delegation.startedAt,
      waitedMs,
      waitTimedOut: waitValidation.waitMs > 0 && !delegation.settled,
      delegations: buildDelegationsSummary(characterId),
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
  const waitedMs = Date.now() - observeStart;

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
    waitedMs,
    waitTimedOut: waitValidation.waitMs > 0 && isRunning,
    messageCount: messages.length,
    toolCallCount: toolMessages.length,
    lastResponse: lastResponse
      ? lastResponse.length > 8000
        ? lastResponse.slice(0, 8000) + "\n\n[Response truncated]"
        : lastResponse
      : undefined,
    allResponses,
    delegations: buildDelegationsSummary(characterId),
  };
}

async function handleContinue(
  input: DelegateToSubagentInput,
  characterId: string,
): Promise<DelegateResult> {
  const { delegationId, followUpMessage } = input;

  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'continue' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }
  if (!followUpMessage) {
    return {
      success: false,
      error: "'followUpMessage' is required for the 'continue' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed and been cleaned up.`,
      delegations: buildDelegationsSummary(characterId),
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
      "Use 'observe' to check the response, and set observe.waitSeconds to avoid tight polling loops.",
    delegations: buildDelegationsSummary(characterId),
  };
}

async function handleStop(
  input: DelegateToSubagentInput,
  characterId: string,
): Promise<DelegateResult> {
  const { delegationId } = input;
  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'stop' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  const delegation = activeDelegations.get(delegationId);
  if (!delegation) {
    return {
      success: false,
      error: `Delegation ${delegationId} not found. It may have already completed.`,
      delegations: buildDelegationsSummary(characterId),
    };
  }

  // Abort the streaming fetch
  delegation.abortController.abort();
  activeDelegations.delete(delegationId);

  return {
    success: true,
    delegationId,
    message: `Delegation ${delegationId} stopped and cancelled.`,
    delegations: buildDelegationsSummary(characterId),
  };
}

async function handleList(
  characterId: string,
): Promise<DelegateResult> {
  const membership = await getWorkflowByAgentId(characterId);
  if (!membership) {
    return {
      success: false,
      error:
        "You are not part of a workflow. Delegation requires an active workflow with sub-agents.",
      availableAgents: [],
      delegations: [],
    };
  }

  if (membership.member.role !== "initiator") {
    return {
      success: false,
      error: "Only the workflow initiator can delegate tasks to sub-agents.",
      availableAgents: [],
      delegations: [],
    };
  }

  const members = await getWorkflowMembers(membership.workflow.id);
  const candidates = await buildSubagentCandidates(members, characterId);
  const availableAgents = toAvailableAgents(candidates);

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
      delegateAgentId: del.delegateId,
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
    availableAgents,
    delegations: results,
    message:
      results.length === 0
        ? `No active delegations. ${availableAgents.length} available sub-agent(s) listed.`
        : `${results.length} active delegation(s) found. ${availableAgents.length} available sub-agent(s) listed.`,
  };
}
