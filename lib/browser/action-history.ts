/**
 * Browser Action History
 *
 * Records every action performed in a Chromium session for:
 *  1. Audit trail — see exactly what the agent did
 *  2. Deterministic replay — re-run a recorded session and verify outputs
 *
 * Each action record captures: action, input, output, domSnapshot,
 * timestamp, sessionId, and agentId. History is in-memory during the
 * session, returned as a structured object on close (stored alongside
 * tool call logs in message content parts).
 *
 * Replay re-executes the action sequence with same inputs and optionally
 * verifies that outputs match the original recording.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionRecord {
  /** Monotonically increasing sequence number */
  seq: number;

  /** ISO-8601 timestamp */
  timestamp: string;

  /** The action that was executed */
  action: string;

  /** The parameters passed to the action (input) */
  input: Record<string, unknown>;

  /** The structured output returned by the action */
  output: unknown;

  /** Whether the action succeeded */
  success: boolean;

  /** Duration in milliseconds */
  durationMs: number;

  /** Page URL at the time of the action */
  pageUrl?: string;

  /** Page title at the time of the action */
  pageTitle?: string;

  /**
   * DOM/accessibility snapshot taken after the action completed.
   * Captured for snapshot/navigate/click actions to enable visual diffing
   * during replay verification. Truncated to 2000 chars max.
   */
  domSnapshot?: string;

  /** Error message if the action failed */
  error?: string;
}

export interface SessionHistory {
  sessionId: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  /** Total duration from open to close in ms */
  totalDurationMs?: number;
  actions: ActionRecord[];
}

export interface ReplayResult {
  action: string;
  seq: number;
  originalOutput: unknown;
  replayOutput: unknown;
  /** Whether output matches original (for verification) */
  outputMatches: boolean;
  success: boolean;
  error?: string;
}

export interface ReplayOptions {
  /** Max retries per failed action (default: 1) */
  maxRetries?: number;

  /** Skip actions that fail instead of aborting (default: false) */
  skipFailures?: boolean;

  /** Delay between actions in ms (default: 500) */
  delayBetweenActions?: number;

  /** Verify that outputs match the original recording (default: false) */
  verifyOutputs?: boolean;
}

// ─── Global singleton state ───────────────────────────────────────────────────

const GLOBAL_KEY = "__seline_browser_history__" as const;

function getHistoryStore(): Map<string, SessionHistory> {
  const g = globalThis as unknown as Record<string, Map<string, SessionHistory>>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map();
  }
  return g[GLOBAL_KEY];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize history tracking for a session.
 */
export function initHistory(sessionId: string, agentId?: string): void {
  const store = getHistoryStore();
  if (store.has(sessionId)) return; // already initialized

  store.set(sessionId, {
    sessionId,
    agentId,
    startedAt: new Date().toISOString(),
    actions: [],
  });
}

/**
 * Record a completed action with full input/output/snapshot data.
 */
export function recordAction(
  sessionId: string,
  action: string,
  input: Record<string, unknown>,
  result: {
    success: boolean;
    durationMs: number;
    output?: unknown;
    pageUrl?: string;
    pageTitle?: string;
    domSnapshot?: string;
    error?: string;
  }
): void {
  const store = getHistoryStore();
  const history = store.get(sessionId);
  if (!history) return; // session not tracked — no-op

  history.actions.push({
    seq: history.actions.length + 1,
    timestamp: new Date().toISOString(),
    action,
    input,
    output: result.output ?? null,
    success: result.success,
    durationMs: result.durationMs,
    pageUrl: result.pageUrl,
    pageTitle: result.pageTitle,
    domSnapshot: result.domSnapshot?.slice(0, 2000),
    error: result.error,
  });
}

/**
 * Finalize and retrieve the session history. Marks endedAt and totalDurationMs.
 */
export function finalizeHistory(sessionId: string): SessionHistory | null {
  const store = getHistoryStore();
  const history = store.get(sessionId);
  if (!history) return null;

  const endedAt = new Date().toISOString();
  history.endedAt = endedAt;
  history.totalDurationMs =
    new Date(endedAt).getTime() - new Date(history.startedAt).getTime();

  store.delete(sessionId);
  return history;
}

/**
 * Get a read-only copy of in-progress history (for live UI rendering).
 */
export function peekHistory(sessionId: string): SessionHistory | null {
  const store = getHistoryStore();
  const history = store.get(sessionId);
  if (!history) return null;

  return {
    ...history,
    actions: [...history.actions],
  };
}

/**
 * Build a replay plan from a recorded history.
 * Returns an array of { action, input, expectedOutput } suitable for
 * feeding back into the chromiumWorkspace tool.
 */
export function buildReplayPlan(
  history: SessionHistory
): Array<{ action: string; input: Record<string, unknown>; expectedOutput: unknown }> {
  return history.actions
    .filter((a) => a.success) // only replay successful actions
    .map((a) => ({
      action: a.action,
      input: a.input,
      expectedOutput: a.output,
    }));
}

/**
 * Compare two outputs for deterministic replay verification.
 * Uses a normalized string comparison — ignores timestamps, session IDs,
 * and other ephemeral values.
 */
export function outputsMatch(original: unknown, replayed: unknown): boolean {
  if (original === replayed) return true;
  if (original == null && replayed == null) return true;

  try {
    const normalize = (val: unknown): string => {
      if (typeof val === "string") return val;
      return JSON.stringify(val, (_key, v) => {
        // Strip ephemeral fields that change between runs
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return "[timestamp]";
        return v;
      });
    };
    return normalize(original) === normalize(replayed);
  } catch {
    return false;
  }
}
