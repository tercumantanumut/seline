export interface LivePromptEntry {
  id: string;
  content: string;
  timestamp: number;
  stopIntent: boolean;
}

const globalForLivePromptQueue = globalThis as typeof globalThis & {
  livePromptQueues?: Map<string, LivePromptEntry[]>;
  livePromptSessionIndex?: Map<string, string>; // sessionId → runId
};

function getQueueMap(): Map<string, LivePromptEntry[]> {
  if (!globalForLivePromptQueue.livePromptQueues) {
    globalForLivePromptQueue.livePromptQueues = new Map();
  }
  return globalForLivePromptQueue.livePromptQueues;
}

function getSessionIndex(): Map<string, string> {
  if (!globalForLivePromptQueue.livePromptSessionIndex) {
    globalForLivePromptQueue.livePromptSessionIndex = new Map();
  }
  return globalForLivePromptQueue.livePromptSessionIndex;
}

/** Call once after agentRun.id is assigned, before streaming starts. */
export function createLivePromptQueue(runId: string, sessionId: string): void {
  getQueueMap().set(runId, []);
  getSessionIndex().set(sessionId, runId);
}

/**
 * Append an entry to the queue for the given run.
 * Returns false if no active queue exists for this runId (i.e. run is not active).
 * This is the O(1) in-memory "is active run?" check — no DB query needed.
 */
export function appendToLivePromptQueue(
  runId: string,
  entry: Omit<LivePromptEntry, "timestamp">
): boolean {
  const queue = getQueueMap().get(runId);
  if (!queue) return false;
  queue.push({ ...entry, timestamp: Date.now() });
  return true;
}

/**
 * Append an entry to the queue for the session's currently active run.
 * Resolves runId via the session index — no runId needed on the client.
 * Returns false if no active queue exists for this sessionId.
 */
export function appendToLivePromptQueueBySession(
  sessionId: string,
  entry: Omit<LivePromptEntry, "timestamp">
): boolean {
  const runId = getSessionIndex().get(sessionId);
  if (!runId) return false;
  return appendToLivePromptQueue(runId, entry);
}

/**
 * Atomically drain all pending entries for the given run.
 * Uses splice to read + clear in one synchronous tick — no seenIds tracking needed.
 * Returns an empty array if the queue doesn't exist or is empty.
 */
export function drainLivePromptQueue(runId: string): LivePromptEntry[] {
  const queue = getQueueMap().get(runId);
  if (!queue || queue.length === 0) return [];
  return queue.splice(0, queue.length);
}

/** Returns true if an active queue exists for this runId. */
export function hasLivePromptQueue(runId: string): boolean {
  return getQueueMap().has(runId);
}

/** Call in onFinish, onAbort, and error cleanup paths to release memory. */
export function removeLivePromptQueue(runId: string, sessionId: string): void {
  getQueueMap().delete(runId);
  getSessionIndex().delete(sessionId);
}
