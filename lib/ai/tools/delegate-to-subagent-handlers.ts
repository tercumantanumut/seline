/**
 * Delegate to Sub-Agent Tool – Execution Helpers and Subagent Resolution
 *
 * Contains the background execution helper, text extraction utilities,
 * subagent resolution logic, and the delegation accessor.
 *
 * Action handlers (start, observe, continue, stop, list) live in
 * delegate-subagent-action-handlers.ts and are re-exported here for
 * backward compatibility.
 */

import { getCharacterFull } from "@/lib/characters/queries";
import {
  getWorkflowByAgentId,
  getWorkflowMembers,
} from "@/lib/agents/workflows";
import {
  getMessages,
} from "@/lib/db/sqlite-queries";
import { INTERNAL_API_SECRET } from "@/lib/config/internal-api-secret";
import { isElectronProduction } from "@/lib/utils/environment";
import {
  activeDelegations,
  nextDelegationId,
  MAX_OBSERVE_WAIT_SECONDS,
  MAX_OBSERVE_PREVIEW_RESPONSES,
  MAX_OBSERVE_PREVIEW_CHARS,
  OBSERVE_RESPONSE_TRUNCATION_SUFFIX,
  type ActiveDelegation,
  type DelegateToSubagentInput,
  type DelegateResult,
  type SubagentCandidate,
  type AvailableSubagent,
} from "./delegate-to-subagent-types";

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
export function buildDelegationsSummary(characterId: string): DelegateResult["delegations"] {
  return getActiveDelegationsForCharacter(characterId);
}

// ---------------------------------------------------------------------------
// Background execution helper (mirrors lib/scheduler/task-queue.ts:539-624)
// ---------------------------------------------------------------------------

function getChatApiBaseUrl(): string {
  return isElectronProduction()
    ? "http://localhost:3456"
    : "http://localhost:3000";
}

export async function executeDelegation(
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
      "X-Internal-Auth": INTERNAL_API_SECRET,
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
// Text extraction helpers
// ---------------------------------------------------------------------------

export function extractTextFromContent(content: unknown): string | undefined {
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

export function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCompatibilityInput(input: DelegateToSubagentInput): DelegateToSubagentInput {
  return input;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateObserveWaitSeconds(waitSeconds?: number): { waitMs: number; error?: string } {
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

export function truncateObservePreview(response: string): { text: string; truncated: boolean } {
  if (response.length <= MAX_OBSERVE_PREVIEW_CHARS) {
    return { text: response, truncated: false };
  }
  return {
    text: response.slice(0, MAX_OBSERVE_PREVIEW_CHARS) + OBSERVE_RESPONSE_TRUNCATION_SUFFIX,
    truncated: true,
  };
}

export async function buildSubagentCandidates(
  members: import("@/lib/agents/workflows").AgentWorkflowMember[],
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

export function toAvailableAgents(candidates: SubagentCandidate[]): AvailableSubagent[] {
  return candidates.map((candidate) => ({
    agentId: candidate.agentId,
    agentName: candidate.agentName,
    role: candidate.member.role,
    purpose: candidate.purpose,
  }));
}

export function resolveSubagentCandidate(
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
// Background execution starter
// ---------------------------------------------------------------------------

/** Start or restart background execution for a delegation, tracking settlement. */
export function startBackgroundExecution(
  delegation: ActiveDelegation,
  userMessage: string,
): void {
  const abortController = new AbortController();
  const executionId = delegation.executionId + 1;

  delegation.abortController = abortController;
  delegation.executionId = executionId;
  delegation.settled = false;
  delegation.error = undefined;

  const streamPromise = executeDelegation(
    delegation.id,
    delegation.sessionId,
    delegation.delegateId,
    userMessage,
    abortController,
  )
    .then(() => {
      if (delegation.executionId !== executionId) return;
      delegation.settled = true;
    })
    .catch((err) => {
      if (delegation.executionId !== executionId) return;
      delegation.settled = true;

      const isAbortError =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");

      if (isAbortError) {
        return;
      }

      delegation.error = err instanceof Error ? err.message : String(err);
      console.error(`[Delegation] ${delegation.id} failed:`, delegation.error);
    });

  delegation.streamPromise = streamPromise;
}

// ---------------------------------------------------------------------------
// Backward-compatible re-exports of action handlers
// ---------------------------------------------------------------------------

export {
  handleStartAction,
  handleObserve,
  handleContinue,
  handleStop,
  handleList,
} from "./delegate-subagent-action-handlers";
