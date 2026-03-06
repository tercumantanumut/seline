export interface LivePromptEntry {
  id: string;
  content: string;
  timestamp: number;
  stopIntent: boolean;
}

const globalForLivePromptQueue = globalThis as typeof globalThis & {
  livePromptQueues?: Map<string, LivePromptEntry[]>;
  livePromptSessionIndex?: Map<string, string>; // sessionId → runId
  livePromptQueueWaiters?: Map<string, Set<() => void>>;
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

function getWaiterMap(): Map<string, Set<() => void>> {
  if (!globalForLivePromptQueue.livePromptQueueWaiters) {
    globalForLivePromptQueue.livePromptQueueWaiters = new Map();
  }
  return globalForLivePromptQueue.livePromptQueueWaiters;
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
  const waiters = getWaiterMap().get(runId);
  if (waiters) {
    for (const notify of [...waiters]) {
      notify();
    }
  }
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

/**
 * Wait until the queue receives at least one entry, or until the caller aborts.
 * Resolves immediately when entries are already available.
 */
export function waitForQueueMessage(runId: string, signal?: AbortSignal): Promise<void> {
  const queue = getQueueMap().get(runId);
  if (!queue) {
    return Promise.reject(new Error(`Live prompt queue not found for run ${runId}`));
  }
  if (queue.length > 0) {
    return Promise.resolve();
  }
  if (signal?.aborted) {
    return Promise.reject(new Error("Aborted"));
  }

  return new Promise<void>((resolve, reject) => {
    const waiters = getWaiterMap();
    const notify = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("Aborted"));
    };
    const cleanup = () => {
      const waiterSet = waiters.get(runId);
      if (waiterSet) {
        waiterSet.delete(notify);
        if (waiterSet.size === 0) {
          waiters.delete(runId);
        }
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const waiterSet = waiters.get(runId) ?? new Set<() => void>();
    waiterSet.add(notify);
    waiters.set(runId, waiterSet);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Call in onFinish, onAbort, and error cleanup paths to release memory. */
export function removeLivePromptQueue(runId: string, sessionId: string): void {
  getQueueMap().delete(runId);
  getSessionIndex().delete(sessionId);
  const waiters = getWaiterMap().get(runId);
  if (waiters) {
    for (const notify of [...waiters]) {
      notify();
    }
    getWaiterMap().delete(runId);
  }
}
