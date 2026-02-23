/**
 * Tracks message IDs that are created server-side during live-prompt injection
 * (pre-injection split assistant message + injected user messages). These IDs
 * are never known to the frontend, so without this registry they would be
 * incorrectly deleted by deleteMessagesNotIn on the next chat request.
 *
 * Keyed by sessionId. Lifecycle mirrors the live-prompt queue: created at run
 * start, populated during prepareStep injection, drained before cleanup, and
 * cleared on run end.
 */

const globalForInjectionRegistry = globalThis as typeof globalThis & {
  injectionMessageRegistry?: Map<string, Set<string>>; // sessionId → Set<messageId>
};

function getRegistry(): Map<string, Set<string>> {
  if (!globalForInjectionRegistry.injectionMessageRegistry) {
    globalForInjectionRegistry.injectionMessageRegistry = new Map();
  }
  return globalForInjectionRegistry.injectionMessageRegistry;
}

/** Ensure a session entry exists (called at run start). */
export function initInjectionRegistry(sessionId: string): void {
  const reg = getRegistry();
  if (!reg.has(sessionId)) {
    reg.set(sessionId, new Set());
  }
}

/** Record a message ID that was created server-side during injection. */
export function trackInjectedMessageId(sessionId: string, messageId: string): void {
  const reg = getRegistry();
  const set = reg.get(sessionId);
  if (set) {
    set.add(messageId);
  }
}

/** Return all tracked injection message IDs for a session. */
export function getTrackedInjectionIds(sessionId: string): string[] {
  return [...(getRegistry().get(sessionId) ?? [])];
}

/** Clear the registry for a session (called on run end). */
export function clearInjectionRegistry(sessionId: string): void {
  getRegistry().delete(sessionId);
}
