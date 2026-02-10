/**
 * File History Tracking
 *
 * In-memory per-session tracking of file read/write times.
 * Used for stale detection: prevents writing to files that were
 * modified on disk since the LLM last read them.
 *
 * Uses globalThis for hot-reload safety (same pattern as file-watcher.ts).
 */

import { stat } from "fs/promises";

// ---------------------------------------------------------------------------
// Global State (survives Next.js hot reloads)
// ---------------------------------------------------------------------------

const globalForHistory = globalThis as unknown as {
  fileReadTimes?: Map<string, Map<string, number>>;
  fileWriteTimes?: Map<string, Map<string, number>>;
};

if (!globalForHistory.fileReadTimes) {
  globalForHistory.fileReadTimes = new Map();
}
if (!globalForHistory.fileWriteTimes) {
  globalForHistory.fileWriteTimes = new Map();
}

const readTimes = globalForHistory.fileReadTimes;
const writeTimes = globalForHistory.fileWriteTimes;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionMap(
  store: Map<string, Map<string, number>>,
  sessionId: string
): Map<string, number> {
  let session = store.get(sessionId);
  if (!session) {
    session = new Map();
    store.set(sessionId, session);
  }
  return session;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record that a file was read by the LLM in this session.
 */
export function recordFileRead(sessionId: string, filePath: string): void {
  getSessionMap(readTimes, sessionId).set(filePath, Date.now());
}

/**
 * Record that a file was written by a tool in this session.
 */
export function recordFileWrite(sessionId: string, filePath: string): void {
  getSessionMap(writeTimes, sessionId).set(filePath, Date.now());
}

/**
 * Get the last time a file was read in this session (ms since epoch), or null.
 */
export function getLastReadTime(sessionId: string, filePath: string): number | null {
  return getSessionMap(readTimes, sessionId).get(filePath) ?? null;
}

/**
 * Get the last time a file was written in this session (ms since epoch), or null.
 */
export function getLastWriteTime(sessionId: string, filePath: string): number | null {
  return getSessionMap(writeTimes, sessionId).get(filePath) ?? null;
}

/**
 * Check if the file was previously read by the LLM in this session.
 */
export function wasFileReadBefore(sessionId: string, filePath: string): boolean {
  return getSessionMap(readTimes, sessionId).has(filePath);
}

/**
 * Check if a file on disk has been modified since the LLM last read it.
 * Returns true if the file is stale (modified externally since last read).
 * Returns false if the file was never read or if it hasn't been modified.
 */
export async function isFileStale(sessionId: string, filePath: string): Promise<boolean> {
  const lastRead = getLastReadTime(sessionId, filePath);
  if (lastRead === null) return false;

  try {
    const fileStat = await stat(filePath);
    return fileStat.mtimeMs > lastRead;
  } catch {
    // File doesn't exist or can't be stat'd -- not stale
    return false;
  }
}
