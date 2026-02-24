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
  MAX_ADVISORY_MAX_TURNS,
  type ActiveDelegation,
  type DelegateToSubagentInput,
  type DelegateResult,
} from "./delegate-to-subagent-types";
import {
  buildDelegationsSummary,
  startBackgroundExecution,
  extractTextFromContent,
  sleep,
  validateObserveWaitSeconds,
  truncateObservePreview,
  buildSubagentCandidates,
  toAvailableAgents,
  resolveSubagentCandidate,
} from "./delegate-to-subagent-handlers";
import { getCharacterFull } from "@/lib/characters/queries";
import { getMessages } from "@/lib/db/sqlite-queries";

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

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

  const startResult = await handleStart(input, userId, characterId);
  if (!startResult.success || input.runInBackground !== false || !startResult.delegationId) {
    return startResult;
  }

  const observeResult = await handleObserve(
    {
      action: "observe",
      delegationId: startResult.delegationId,
      waitSeconds: input.waitSeconds ?? 120,
    },
    characterId,
  );

  if (!observeResult.success) {
    return observeResult;
  }

  return {
    ...observeResult,
    availableAgents: startResult.availableAgents ?? observeResult.availableAgents,
    message:
      "runInBackground=false requested. Delegation was started and observed in one call. " +
      "Use continue/observe with this delegationId for further work.",
  };
}

async function handleStart(
  input: DelegateToSubagentInput,
  userId: string,
  characterId: string,
): Promise<DelegateResult> {
  const { agentId, agentName, task, context: extraContext, maxTurns } = input;

  if (!task) {
    return {
      success: false,
      error: "'task' is required for the 'start' action.",
      delegations: buildDelegationsSummary(characterId),
    };
  }

  if (
    maxTurns !== undefined &&
    (!Number.isFinite(maxTurns) || maxTurns < 1 || maxTurns > MAX_ADVISORY_MAX_TURNS)
  ) {
    return {
      success: false,
      error: `'maxTurns' must be between 1 and ${MAX_ADVISORY_MAX_TURNS}.`,
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
  const advisoryTurnConstraint =
    maxTurns !== undefined
      ? `\n\nExecution constraint from initiator: target completion in at most ${Math.floor(maxTurns)} assistant turns. If unresolved, return partial findings plus blockers.`
      : "";

  const userMessage = extraContext
    ? `${task}\n\nAdditional context:\n${extraContext}${advisoryTurnConstraint}`
    : `${task}${advisoryTurnConstraint}`;

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
    message:
      `IMPORTANT: Save this delegationId (${delegationId}) — required for observe/continue/stop. ` +
      "Delegation started. A real chat session has been created for the sub-agent. " +
      "Use 'observe' with the delegationId to check progress and read the full response. " +
      "Set observe.waitSeconds (for example 30, 60, or 600) to wait intentionally instead of re-checking too frequently. " +
      "Use runInBackground=false on start if you want a start+observe wait in one call. Use 'continue' to send follow-up messages (or use resume as a compatibility alias), or navigate to the sub-agent's chat to see it live.",
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
