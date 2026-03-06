/**
 * Emotion Context Store
 *
 * In-memory store of per-conversation emotion state.
 * Automatically cleans up stale entries older than the configured max age.
 */

import type { EmotionResult, EmotionContext } from "./types";

// ── Configuration ───────────────────────────────────────────────────────────

/** Default max age for emotion contexts before auto-cleanup (1 hour) */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

/** How often to run the cleanup sweep */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ── Store ───────────────────────────────────────────────────────────────────

const contextStore = new Map<string, EmotionContext>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let configuredMaxAgeMs = DEFAULT_MAX_AGE_MS;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Update (or create) the emotion context for a conversation.
 */
export function updateEmotionContext(
  conversationId: string,
  result: EmotionResult
): void {
  contextStore.set(conversationId, {
    current: result,
    conversationId,
    updatedAt: Date.now(),
  });
  ensureCleanupRunning();
}

/**
 * Get the current emotion context for a conversation.
 * Returns null if no context exists or it has been cleaned up.
 */
export function getEmotionContext(conversationId: string): EmotionContext | null {
  return contextStore.get(conversationId) ?? null;
}

/**
 * Remove the emotion context for a conversation.
 */
export function clearEmotionContext(conversationId: string): void {
  contextStore.delete(conversationId);
  stopCleanupIfEmpty();
}

/**
 * Configure the max age for emotion contexts.
 * Contexts older than this are automatically removed.
 */
export function setMaxAge(maxAgeMs: number): void {
  configuredMaxAgeMs = maxAgeMs;
}

/**
 * Run a cleanup sweep, removing contexts older than maxAgeMs.
 * Called automatically on an interval, but can also be triggered manually.
 */
export function cleanupStaleContexts(maxAgeMs?: number): number {
  const cutoff = Date.now() - (maxAgeMs ?? configuredMaxAgeMs);
  let removed = 0;

  for (const [id, ctx] of contextStore) {
    if (ctx.updatedAt < cutoff) {
      contextStore.delete(id);
      removed++;
    }
  }

  stopCleanupIfEmpty();
  return removed;
}

// ── Internals ───────────────────────────────────────────────────────────────

function ensureCleanupRunning(): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    cleanupStaleContexts();
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is still running
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function stopCleanupIfEmpty(): void {
  if (contextStore.size === 0 && cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ── Test helpers ────────────────────────────────────────────────────────────

/** Get the number of stored contexts. Intended for tests. */
export function _getContextStoreSize(): number {
  return contextStore.size;
}

/** Clear all contexts and stop cleanup timer. Intended for tests. */
export function _resetContextStore(): void {
  contextStore.clear();
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  configuredMaxAgeMs = DEFAULT_MAX_AGE_MS;
}
