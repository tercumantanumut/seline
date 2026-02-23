/**
 * Tracks sessions that had undrained live-prompt queue messages when a run ended.
 *
 * When a run ends before prepareStep could drain the queue, the messages were
 * never processed by the model. Instead of persisting them to DB (which creates
 * dangling messages with no response), we set this flag so the frontend can
 * convert the injected-live chips to "fallback" and replay them as a new run.
 *
 * Lifecycle: set in onFinish/onAbort when drainLivePromptQueue returns entries,
 * consumed (and cleared) by the /consume-undrained-signal endpoint after the
 * frontend receives the run-end event.
 */

const globalForUndrainedSignal = globalThis as typeof globalThis & {
  undrainedSessions?: Set<string>;
};

function getSet(): Set<string> {
  if (!globalForUndrainedSignal.undrainedSessions) {
    globalForUndrainedSignal.undrainedSessions = new Set();
  }
  return globalForUndrainedSignal.undrainedSessions;
}

/** Mark a session as having undrained messages that need a new run. */
export function signalUndrainedMessages(sessionId: string): void {
  getSet().add(sessionId);
}

/**
 * Check-and-clear: returns true if the session had undrained messages,
 * then removes the flag so subsequent calls return false.
 */
export function consumeUndrainedSignal(sessionId: string): boolean {
  const set = getSet();
  if (set.has(sessionId)) {
    set.delete(sessionId);
    return true;
  }
  return false;
}
