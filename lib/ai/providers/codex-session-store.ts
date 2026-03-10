/**
 * Codex Session Store — process-global per-session transport state.
 *
 * Instead of closure-scoped state that dies with each request, or
 * module-level globals that cross-contaminate concurrent sessions,
 * this store keys transport state by sessionId so:
 *
 *   - Turn-state (sticky routing tokens) persists across turns in the
 *     same chat session, enabling correct backend routing.
 *   - WS-disabled cooldowns are scoped to the session that triggered them,
 *     not the entire process.
 *   - Stale entries are cleaned up automatically.
 *
 * The sessionId is read from the observability run context
 * (AsyncLocalStorage) which wraps every streamText() call in the chat route.
 */

import { getRunContext } from "@/lib/observability/run-context";

// ── Configuration ───────────────────────────────────────────────────────────

/** How long a session entry is kept after its last activity. */
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** How often to sweep stale entries. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Cooldown duration after a WS failure before retrying WS for that session. */
export const WS_DISABLED_COOLDOWN_MS = 60_000;

// ── Types ───────────────────────────────────────────────────────────────────

export interface CodexSessionState {
  /** Sticky routing token from the last successful response. */
  turnState: string | null;
  /** Timestamp until which WS is disabled for this session. */
  wsDisabledUntil: number;
  /** Last time this entry was read or written. */
  lastActivity: number;
}

// ── Store ───────────────────────────────────────────────────────────────────

const sessions = new Map<string, CodexSessionState>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupScheduled(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of sessions) {
      if (now - entry.lastActivity > SESSION_TTL_MS) {
        sessions.delete(key);
      }
    }
    // If the map is empty, stop the timer to avoid holding the process alive.
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't hold the process alive for cleanup.
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the current session ID from the run context.
 * Falls back to a default key when called outside a run context
 * (e.g., during utility model calls or tests).
 */
export function resolveSessionId(): string {
  const ctx = getRunContext();
  return ctx?.sessionId ?? "__codex_default__";
}

/**
 * Get (or create) the state for a session.
 * Touching the entry refreshes its TTL.
 */
export function getSessionState(sessionId: string): CodexSessionState {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = { turnState: null, wsDisabledUntil: 0, lastActivity: Date.now() };
    sessions.set(sessionId, entry);
    ensureCleanupScheduled();
  } else {
    entry.lastActivity = Date.now();
  }
  return entry;
}

/** Update the turn-state for a session after a successful response. */
export function setTurnState(sessionId: string, turnState: string | null): void {
  const entry = getSessionState(sessionId);
  if (turnState) {
    entry.turnState = turnState;
  }
}

/** Check if WS is currently enabled for a session. */
export function isWsEnabled(sessionId: string): boolean {
  const entry = getSessionState(sessionId);
  return Date.now() >= entry.wsDisabledUntil;
}

/** Disable WS for a session with a cooldown. */
export function disableWs(sessionId: string, cooldownMs: number = WS_DISABLED_COOLDOWN_MS): void {
  const entry = getSessionState(sessionId);
  entry.wsDisabledUntil = Date.now() + cooldownMs;
}

/** Get all active session IDs (for diagnostics). */
export function getActiveSessionIds(): string[] {
  return [...sessions.keys()];
}

/** Get the total number of tracked sessions (for diagnostics). */
export function getSessionCount(): number {
  return sessions.size;
}

/** Clear all sessions (for testing). */
export function clearAllSessions(): void {
  sessions.clear();
}
