/**
 * Global registry for pending interactive tool questions.
 *
 * When the Claude Code SDK agent calls AskUserQuestion / AskFollowupQuestion,
 * a PreToolUse hook blocks execution and registers a pending wait here.
 * The client POSTs to /api/chat/tool-result with the user's answers,
 * which resolves the wait and unblocks the SDK agent.
 *
 * An EventEmitter (`interactiveBridgeEvents`) notifies subscribers (e.g.
 * channel integrations) when a question is pending or resolved so they can
 * render the question in Telegram / Slack / Discord / WhatsApp.
 */

import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Event emitter — notifies channel integrations about pending questions
// ---------------------------------------------------------------------------

export const interactiveBridgeEvents = new EventEmitter();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingInteractiveWait {
  resolve: (answers: Record<string, string>) => void;
  questions: unknown;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Pending waits — keyed by `${sessionId}__${toolUseId}`
// ---------------------------------------------------------------------------

const pendingWaits = new Map<string, PendingInteractiveWait>();

function makeKey(sessionId: string, toolUseId: string): string {
  return `${sessionId}__${toolUseId}`;
}

/**
 * Register a wait for user input. Returns a Promise that resolves when
 * `resolveInteractiveWait` is called with the same key.
 */
export function registerInteractiveWait(
  sessionId: string,
  toolUseId: string,
  questions: unknown,
): Promise<Record<string, string>> {
  const key = makeKey(sessionId, toolUseId);
  // Clean up stale entries opportunistically
  cleanupStaleEntries();
  // Resolve any existing wait for this key to prevent a hung promise
  const existing = pendingWaits.get(key);
  if (existing) {
    pendingWaits.delete(key);
    existing.resolve({});
  }
  return new Promise<Record<string, string>>((resolve) => {
    pendingWaits.set(key, { resolve, questions, createdAt: Date.now() });
    interactiveBridgeEvents.emit("pending", { sessionId, toolUseId, questions });
  });
}

/**
 * Resolve a pending wait with the user's answers. Returns true if a wait
 * was found and resolved, false if the key was unknown (already resolved
 * or timed out).
 */
export function resolveInteractiveWait(
  sessionId: string,
  toolUseId: string,
  answers: Record<string, string>,
): boolean {
  const key = makeKey(sessionId, toolUseId);
  const entry = pendingWaits.get(key);
  if (!entry) return false;
  pendingWaits.delete(key);
  entry.resolve(answers);
  interactiveBridgeEvents.emit("resolved", { sessionId, toolUseId });
  return true;
}

// ---------------------------------------------------------------------------
// User answer store — keyed the same way
// After the PreToolUse hook resolves, we store the user's answers here so
// extractSdkToolResultsFromUserMessage can override the SDK's auto-answer.
// ---------------------------------------------------------------------------

const userAnswers = new Map<string, Record<string, string>>();

export function storeUserAnswer(
  sessionId: string,
  toolUseId: string,
  answers: Record<string, string>,
): void {
  userAnswers.set(makeKey(sessionId, toolUseId), answers);
}

/**
 * Pop (retrieve and delete) the user's stored answer for a tool call.
 * Returns undefined if no user answer was stored.
 */
export function popUserAnswer(
  sessionId: string,
  toolUseId: string,
): Record<string, string> | undefined {
  const key = makeKey(sessionId, toolUseId);
  const answers = userAnswers.get(key);
  if (answers) userAnswers.delete(key);
  return answers;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function cleanupStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of pendingWaits) {
    if (now - entry.createdAt > STALE_THRESHOLD_MS) {
      pendingWaits.delete(key);
      // Resolve with empty answers so the hook unblocks
      entry.resolve({});
    }
  }
  for (const [key] of userAnswers) {
    // userAnswers don't have timestamps, but they should be consumed quickly.
    // We'll just let them accumulate — the Map stays small because popUserAnswer
    // deletes entries on retrieval.
  }
}
