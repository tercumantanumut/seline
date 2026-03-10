/**
 * Delegate to Sub-Agent Tool – Shared Types and In-Memory Registry
 *
 * Contains type definitions, constants, and the in-memory delegation registry
 * that are shared between the tool factory and action handlers.
 */

import type { AgentWorkflowMember } from "@/lib/agents/workflows";

// ---------------------------------------------------------------------------
// Public types (re-exported for external consumers)
// ---------------------------------------------------------------------------

export interface DelegateToSubagentToolOptions {
  sessionId: string;
  userId: string;
  characterId: string;
}

export type DelegateAction = "start" | "observe" | "continue" | "answer" | "stop" | "list";

export interface DelegateToSubagentInput {
  action: DelegateAction;
  agentId?: string;
  agentName?: string;
  task?: string;
  context?: string;
  delegationId?: string;
  followUpMessage?: string;
  toolUseId?: string;
  answers?: Record<string, string>;
  waitSeconds?: number;
  /** @deprecated Use mode instead. Kept for backwards compatibility. */
  runInBackground?: boolean;
  mode?: "blocking" | "background";
  resume?: string;
}

export interface AvailableSubagent {
  agentId: string;
  agentName: string;
  role: string;
  purpose: string;
}

export interface DelegationInteractivePrompt {
  toolUseId: string;
  questions: unknown;
  createdAt: number;
}

export interface DelegateResult {
  success: boolean;
  error?: string;
  availableAgents?: AvailableSubagent[];
  delegationId?: string;
  sessionId?: string;
  delegateAgent?: string;
  message?: string;
  mode?: "blocking" | "background";
  running?: boolean;
  completed?: boolean;
  /** Compact final response text. Returned in blocking mode instead of lastResponse/allResponses. */
  result?: string;
  messageCount?: number;
  toolCallCount?: number;
  lastResponse?: string;
  allResponses?: string[];
  responseCount?: number;
  responsePreviewCount?: number;
  responsePreviewOmittedCount?: number;
  responsePreviewTruncatedCount?: number;
  elapsed?: number;
  waitedMs?: number;
  waitTimedOut?: boolean;
  pendingInteractivePrompts?: DelegationInteractivePrompt[];
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
// Internal types
// ---------------------------------------------------------------------------

export interface ActiveDelegation {
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
  executionId: number;
  error?: string;
}

export type SubagentCandidate = {
  member: AgentWorkflowMember;
  agentId: string;
  agentName: string;
  purpose: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_OBSERVE_WAIT_SECONDS = 10 * 60;
export const MAX_OBSERVE_PREVIEW_RESPONSES = 6;
export const MAX_OBSERVE_PREVIEW_CHARS = 1_200;
export const OBSERVE_RESPONSE_TRUNCATION_SUFFIX = "\n\n[Response truncated]";

// ---------------------------------------------------------------------------
// In-memory delegation registry
// Persisted on globalThis to survive Next.js hot reloads.
// ---------------------------------------------------------------------------

export const activeDelegations: Map<string, ActiveDelegation> =
  ((globalThis as Record<string, unknown>).__activeDelegations as Map<string, ActiveDelegation>) ??
  ((globalThis as Record<string, unknown>).__activeDelegations = new Map<string, ActiveDelegation>());

let delegationCounter = 0;

export function nextDelegationId(): string {
  delegationCounter += 1;
  return `del-${Date.now()}-${delegationCounter}`;
}
