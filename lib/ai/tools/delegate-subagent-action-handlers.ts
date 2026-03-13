/**
 * Delegate to Sub-Agent Tool – Action Handlers
 *
 * Contains the five action handlers (start, observe, continue, stop, list)
 * that implement the public delegation API.  Execution helpers, text
 * utilities, and subagent resolution logic live in
 * delegate-to-subagent-handlers.ts.
 */

import {
  getWorkflowByAgentId,
  getWorkflowMembers,
} from "@/lib/agents/workflows";
import { createSession } from "@/lib/db/sqlite-queries";
import {
  activeDelegations,
  nextDelegationId,
  MAX_OBSERVE_WAIT_SECONDS,
  MAX_OBSERVE_PREVIEW_RESPONSES,
  MAX_OBSERVE_PREVIEW_CHARS,
  type ActiveDelegation,
  type DelegateToSubagentInput,
  type DelegateResult,
  type DelegationInteractivePrompt,
} from "./delegate-to-subagent-types";
import {
  buildDelegationsSummary,
  startBackgroundExecution,
  extractTextFromContent,
  extractFinalResponse,
  sleep,
  validateObserveWaitSeconds,
  truncateObservePreview,
  buildSubagentCandidates,
  toAvailableAgents,
  resolveSubagentCandidate,
} from "./delegate-to-subagent-handlers";
import { getCharacterFull } from "@/lib/characters/queries";
import { getMessages } from "@/lib/db/sqlite-queries";
import { appendToLivePromptQueueBySession } from "@/lib/background-tasks/live-prompt-queue-registry";
import {
  hasStopIntent,
  sanitizeLivePromptContent,
} from "@/lib/background-tasks/live-prompt-helpers";
import {
  getPendingInteractivePrompts,
  resolveInteractiveWait,
} from "@/lib/interactive-tool-bridge";
import {
  listAgentRunsBySession,
  markRunAsCancelled,
} from "@/lib/observability/queries";
import {
  abortChatRun,
  removeChatAbortController,
} from "@/lib/background-tasks/chat-abort-registry";
import { taskRegistry } from "@/lib/background-tasks/registry";

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/** Default blocking timeout in seconds (5 minutes). */
const DEFAULT_BLOCKING_TIMEOUT_SECONDS = 600;

/**
 * Resolve the effective execution mode from input parameters.
 * Priority: explicit mode > legacy runInBackground > default (blocking).
 */
function resolveExecutionMode(input: DelegateToSubagentInput): "blocking" | "background" {
  if (input.mode === "background") return "background";
  if (input.mode === "blocking") return "blocking";
  // Legacy compat: runInBackground=true -> background
  if (input.runInBackground === true) return "background";
  // Default: blocking
  return "blocking";
}

function getDelegationPendingInteractivePrompts(
  sessionId: string,
): DelegationInteractivePrompt[] {
  return getPendingInteractivePrompts(sessionId).map(({ toolUseId, questions, createdAt }) => ({
    toolUseId,
    questions,
    createdAt,
  }));
}

async function waitForDelegationPausePoint(
  delegation: ActiveDelegation,
  waitMs: number,
): Promise<DelegationInteractivePrompt[]> {
  const deadline = Date.now() + waitMs;

  while (true) {
    const pendingInteractivePrompts = getDelegationPendingInteractivePrompts(delegation.sessionId);
    if (pendingInteractivePrompts.length > 0 || delegation.settled) {
      return pendingInteractivePrompts;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return pendingInteractivePrompts;
    }

    await sleep(Math.min(200, remainingMs));
  }
}

async function cancelDelegationSessionRun(sessionId: string): Promise<void> {
  const runs = await listAgentRunsBySession(sessionId);
  const activeRun = runs.find((run) => run.status === "running");
  if (!activeRun) {
    return;
  }

  const registryTask = taskRegistry.get(activeRun.id);
  const registryDurationMs = registryTask
    ? Date.now() - new Date(registryTask.startedAt).getTime()
    : undefined;

  abortChatRun(activeRun.id, "user_cancelled");
  await markRunAsCancelled(activeRun.id, "user_cancelled");
  taskRegistry.updateStatus(activeRun.id, "cancelled", {
    durationMs: registryDurationMs,
  });
  removeChatAbortController(activeRun.id);
}

export async function handleStartAction(
  input: DelegateToSubagentInput,
  userId: string,
  characterId: string,
): Promise<DelegateResult> {
  // Compatibility mode: resume + start maps to continue with task as follow-up.
  if (input.resume) {
    if (!input.task) {
      return {
        success: false,
        error: "'task' is required when using 'resume' with action='start'.",
        delegations: buildDelegationsSummary(characterId),
      };
    }

    return handleContinue(
      {
        action: "continue",
        delegationId: input.resume,
        followUpMessage: input.task,
      },
      characterId,
    );
  }

  const mode = resolveExecutionMode(input);
  const startResult = await handleStart(input, userId, characterId);

  if (!startResult.success || !startResult.delegationId) {
    return startResult;
  }

  // ── Background mode: return immediately ──────────────────────────────────
  if (mode === "background") {
    return {
      ...startResult,
      mode: "background",
      message:
        `Delegation started in background (${startResult.delegationId}). ` +
        "Use observe/continue/stop with this delegationId to manage it.",
    };
  }

  // ── Blocking mode (default): await completion, return compact result ─────
  const delegation = activeDelegations.get(startResult.delegationId);
  if (!delegation) {
    return startResult;
  }

  const maxWaitMs = (input.waitSeconds ?? DEFAULT_BLOCKING_TIMEOUT_SECONDS) * 1000;
  const pendingInteractivePrompts = await waitForDelegationPausePoint(delegation, maxWaitMs);

  // Read the final response compactly — just the last assistant text
  const result = await extractFinalResponse(delegation.sessionId);
  const completed = delegation.settled;

  // Build compact result — no allResponses, no preview counts, no observe noise
  const compactResult: DelegateResult = {
    success: true,
    delegationId: startResult.delegationId,
    sessionId: delegation.sessionId,
    delegateAgent: delegation.delegateName,
    mode: "blocking",
    completed,
    result,
    elapsed: Date.now() - delegation.startedAt,
    availableAgents: startResult.availableAgents,
    ...(pendingInteractivePrompts.length > 0 ? { pendingInteractivePrompts } : {}),
  };

  if (delegation.error) {
    compactResult.error = `Delegation failed: ${delegation.error}`;
  }

  if (pendingInteractivePrompts.length > 0) {
    compactResult.message =
      "Sub-agent is waiting for an interactive answer. " +
      "Use delegateToSubagent action='answer' with the delegationId, toolUseId, and answers to continue.";
  } else if (!completed) {
    compactResult.message =
      "Sub-agent did not finish within the wait timeout. " +
      "Use observe(delegationId) to check later, or stop(delegationId) to cancel.";
  }

  return compactResult;
}

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
    executionId: 0,
  };

  startBackgroundExecution(delegation, userMessage);
  activeDelegations.set(delegationId, delegation);

  return {
    success: true,
    delegationId,
    sessionId: session.id,
    delegateAgent: delegation.delegateName,
    message: `Delegation ${delegationId} created for sub-agent "${delegation.delegateName}".`,
    availableAgents,
    delegations: buildDelegationsSummary(characterId),
  };
}

export async function handleObserve(
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

  const pendingInteractivePrompts = !delegation.settled && waitValidation.waitMs > 0
    ? await waitForDelegationPausePoint(delegation, waitValidation.waitMs)
    : getDelegationPendingInteractivePrompts(delegation.sessionId);

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

  // Extract all assistant responses.
  // Return the final response in full via `lastResponse` and keep `allResponses`
  // as a bounded preview list of prior assistant turns to avoid context blowups.
  const assistantResponses = assistantMessages
    .map((m) => extractTextFromContent(m.content))
    .filter((t): t is string => !!t);
  const lastResponse = assistantResponses[assistantResponses.length - 1];
  const priorResponses = assistantResponses.slice(0, -1);
  const recentResponsePreviews = priorResponses.slice(-MAX_OBSERVE_PREVIEW_RESPONSES);
  let responsePreviewTruncatedCount = 0;
  const allResponses = recentResponsePreviews.map((response) => {
    const preview = truncateObservePreview(response);
    if (preview.truncated) {
      responsePreviewTruncatedCount += 1;
    }
    return preview.text;
  });
  const responsePreviewOmittedCount = Math.max(0, priorResponses.length - recentResponsePreviews.length);

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
    lastResponse,
    allResponses,
    responseCount: assistantResponses.length,
    responsePreviewCount: allResponses.length,
    responsePreviewOmittedCount,
    responsePreviewTruncatedCount,
    ...(pendingInteractivePrompts.length > 0 ? { pendingInteractivePrompts } : {}),
    ...(pendingInteractivePrompts.length > 0
      ? {
          message:
            "Sub-agent is waiting for an interactive answer. " +
            "Use delegateToSubagent action='answer' with the delegationId, toolUseId, and answers to continue.",
        }
      : {}),
    delegations: buildDelegationsSummary(characterId),
  };
}

export async function handleAnswer(
  input: DelegateToSubagentInput,
  characterId: string,
): Promise<DelegateResult> {
  const { delegationId, toolUseId, answers } = input;

  if (!delegationId) {
    return {
      success: false,
      error: "'delegationId' is required for the 'answer' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  if (!toolUseId) {
    return {
      success: false,
      error: "'toolUseId' is required for the 'answer' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  if (
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers) ||
    !Object.values(answers).every((value) => typeof value === "string")
  ) {
    return {
      success: false,
      error: "'answers' must be a Record<string, string> for the 'answer' action.",
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

  const resolved = resolveInteractiveWait(delegation.sessionId, toolUseId, answers);
  if (!resolved) {
    const pendingInteractivePrompts = getDelegationPendingInteractivePrompts(delegation.sessionId);
    return {
      success: false,
      delegationId,
      sessionId: delegation.sessionId,
      delegateAgent: delegation.delegateName,
      error:
        `No pending interactive prompt found for toolUseId "${toolUseId}" in delegation ${delegationId}.`,
      ...(pendingInteractivePrompts.length > 0 ? { pendingInteractivePrompts } : {}),
      delegations: buildDelegationsSummary(characterId),
    };
  }

  return {
    success: true,
    delegationId,
    sessionId: delegation.sessionId,
    delegateAgent: delegation.delegateName,
    message:
      "Interactive answer forwarded to the sub-agent. " +
      "Use 'observe' to check progress and any follow-up prompts.",
    delegations: buildDelegationsSummary(characterId),
  };
}

export async function handleContinue(
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

  const sanitizedFollowUpMessage = sanitizeLivePromptContent(followUpMessage);
  if (!sanitizedFollowUpMessage) {
    return {
      success: false,
      error: "'followUpMessage' cannot be empty after sanitization.",
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

  // If previous stream is still running, enqueue a live prompt injection so the
  // active sub-agent stream continues uninterrupted.
  if (!delegation.settled) {
    const queued = appendToLivePromptQueueBySession(delegation.sessionId, {
      id: `deleg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: sanitizedFollowUpMessage,
      stopIntent: hasStopIntent(sanitizedFollowUpMessage),
    });

    if (queued) {
      return {
        success: true,
        delegationId,
        sessionId: delegation.sessionId,
        delegateAgent: delegation.delegateName,
        message:
          "Follow-up message queued for live injection. The active sub-agent stream continues without interruption. " +
          "Use 'observe' to check progress and response updates.",
        delegations: buildDelegationsSummary(characterId),
      };
    }
  }

  // No active stream to inject into (or queue unavailable): start a new run.
  // The chat route handles message persistence automatically.
  startBackgroundExecution(delegation, sanitizedFollowUpMessage);

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

export async function handleStop(
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

  // Stop both the delegation wrapper and the underlying chat run so UI state clears.
  delegation.abortController.abort();
  await cancelDelegationSessionRun(delegation.sessionId);
  delegation.settled = true;
  activeDelegations.delete(delegationId);

  return {
    success: true,
    delegationId,
    message: `Delegation ${delegationId} stopped and cancelled.`,
    delegations: buildDelegationsSummary(characterId),
  };
}

export async function handleList(
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
