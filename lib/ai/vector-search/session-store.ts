/**
 * Vector Search Session Store
 *
 * In-memory session-scoped storage for search history with TTL-based cleanup.
 * Sessions are isolated per chat/session identity and automatically cleaned up.
 * Follows the web-browse session store pattern.
 */

import { nanoid } from "nanoid";
import type { VectorSearchSession, SearchHistoryEntry } from "./types";

// ============================================================================
// Configuration
// ============================================================================

// Session TTL: 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

// Max search history entries per session
const MAX_SEARCH_HISTORY = 20;

// Cleanup interval: run every 10 minutes
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// ============================================================================
// Session Store
// ============================================================================

const sessionStore = new Map<string, VectorSearchSession>();

/**
 * Get or create a vector search session for a chat/session key
 */
export function getVectorSearchSession(
  sessionKey: string,
  characterId?: string | null
): VectorSearchSession {
  let session = sessionStore.get(sessionKey);

  if (!session) {
    session = {
      id: nanoid(),
      sessionKey,
      characterId,
      searchHistory: [],
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };
    sessionStore.set(sessionKey, session);
    console.log(`[VectorSearchSession] Created new session: ${sessionKey}`);
  }

  session.lastUsedAt = new Date();
  if (characterId && !session.characterId) {
    session.characterId = characterId;
  }
  return session;
}

/**
 * Add a search to the session history
 */
export function addSearchHistory(
  sessionKey: string,
  entry: Omit<SearchHistoryEntry, "timestamp">,
  characterId?: string | null
): void {
  const session = getVectorSearchSession(sessionKey, characterId);

  session.searchHistory.push({
    ...entry,
    timestamp: new Date(),
  });

  // Enforce max history limit (remove oldest first)
  if (session.searchHistory.length > MAX_SEARCH_HISTORY) {
    session.searchHistory = session.searchHistory.slice(-MAX_SEARCH_HISTORY);
  }

  session.lastUsedAt = new Date();
}

/**
 * Get recent search history for a session
 */
export function getSearchHistory(
  sessionKey: string,
  limit: number = 5
): SearchHistoryEntry[] {
  const session = sessionStore.get(sessionKey);
  if (!session) return [];

  return session.searchHistory.slice(-limit);
}

/**
 * Clear session for a session key
 */
export function clearSession(sessionKey: string): void {
  sessionStore.delete(sessionKey);
  console.log(`[VectorSearchSession] Cleared session: ${sessionKey}`);
}

/**
 * Clean up stale sessions (older than TTL)
 */
export function cleanupStaleSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  const sessionsToDelete: string[] = [];

  for (const [sessionKey, session] of sessionStore) {
    if (now - session.lastUsedAt.getTime() > SESSION_TTL_MS) {
      sessionsToDelete.push(sessionKey);
    }
  }

  for (const sessionKey of sessionsToDelete) {
    sessionStore.delete(sessionKey);
    cleaned++;
  }

  if (cleaned > 0) {
    console.log(`[VectorSearchSession] Cleaned up ${cleaned} stale sessions`);
  }

  return cleaned;
}

/**
 * Get session statistics (for debugging)
 */
export function getSessionStats(): {
  totalSessions: number;
  totalSearches: number;
} {
  let totalSearches = 0;
  for (const session of sessionStore.values()) {
    totalSearches += session.searchHistory.length;
  }

  return {
    totalSessions: sessionStore.size,
    totalSearches,
  };
}

// Run cleanup periodically
if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);
}
