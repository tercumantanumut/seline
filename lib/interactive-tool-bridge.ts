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
// Types
// ---------------------------------------------------------------------------

interface PendingInteractiveWait {
  resolve: (answers: Record<string, string>) => void;
  questions: unknown;
  createdAt: number;
  abortCleanup?: () => void;
}

// ---------------------------------------------------------------------------
// Global state — survives Next.js HMR re-evaluations in dev mode.
// Without this, the streaming chat route and the tool-result route can
// end up with different module instances (different Maps), so the tool-result
// endpoint never finds the pending wait registered by the streaming route.
// Same pattern as lib/vectordb/file-watcher.ts (globalThis.fileWatchers).
// ---------------------------------------------------------------------------

const globalForBridge = globalThis as unknown as {
  interactiveBridgeEvents?: EventEmitter;
  interactivePendingWaits?: Map<string, PendingInteractiveWait>;
  interactiveUserAnswers?: Map<string, Record<string, string>>;
};

if (!globalForBridge.interactiveBridgeEvents) {
  globalForBridge.interactiveBridgeEvents = new EventEmitter();
}
if (!globalForBridge.interactivePendingWaits) {
  globalForBridge.interactivePendingWaits = new Map<string, PendingInteractiveWait>();
}
if (!globalForBridge.interactiveUserAnswers) {
  globalForBridge.interactiveUserAnswers = new Map<string, Record<string, string>>();
}

export const interactiveBridgeEvents = globalForBridge.interactiveBridgeEvents;
const pendingWaits = globalForBridge.interactivePendingWaits;

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
  options?: { abortSignal?: AbortSignal },
): Promise<Record<string, string>> {
  const key = makeKey(sessionId, toolUseId);
  // Clean up stale entries opportunistically
  cleanupStaleEntries();
  // Resolve any existing wait for this key to prevent a hung promise
  const existing = pendingWaits.get(key);
  if (existing) {
    pendingWaits.delete(key);
    existing.abortCleanup?.();
    existing.resolve({});
  }
  return new Promise<Record<string, string>>((resolve) => {
    const abortSignal = options?.abortSignal;
    const onAbort = () => {
      const entry = pendingWaits.get(key);
      if (!entry) return;
      pendingWaits.delete(key);
      entry.abortCleanup?.();
      entry.resolve({});
      interactiveBridgeEvents.emit("resolved", { sessionId, toolUseId });
    };

    const abortCleanup = abortSignal
      ? () => abortSignal.removeEventListener("abort", onAbort)
      : undefined;

    if (abortSignal?.aborted) {
      resolve({});
      return;
    }

    if (abortSignal) {
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    pendingWaits.set(key, { resolve, questions, createdAt: Date.now(), abortCleanup });
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
  entry.abortCleanup?.();
  entry.resolve(answers);
  interactiveBridgeEvents.emit("resolved", { sessionId, toolUseId });
  return true;
}

export function getPendingInteractivePrompt(
  sessionId: string,
  toolUseId: string,
): unknown | undefined {
  const entry = pendingWaits.get(makeKey(sessionId, toolUseId));
  return entry?.questions;
}

// ---------------------------------------------------------------------------
// User answer store — keyed the same way
// After the PreToolUse hook resolves, we store the user's answers here so
// extractSdkToolResultsFromUserMessage can override the SDK's auto-answer.
// ---------------------------------------------------------------------------

const userAnswers = globalForBridge.interactiveUserAnswers;

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
      entry.abortCleanup?.();
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
