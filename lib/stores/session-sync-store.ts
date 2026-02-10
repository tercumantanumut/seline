/**
 * Session Sync Store
 *
 * Zustand store for synchronizing session metadata across components.
 * This ensures the Chat History sidebar and Homepage Active Sessions
 * always display consistent, up-to-date information.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { SessionInfo, SessionChannelType } from "@/components/chat/chat-sidebar/types";

/**
 * Lightweight session metadata for sync purposes.
 * Contains only the fields needed for display indicators.
 */
export interface SessionSyncData {
  id: string;
  title: string | null;
  characterId?: string | null;
  updatedAt: string;
  lastMessageAt?: string | null;
  messageCount?: number | null;
  totalTokenCount?: number | null;
  channelType?: SessionChannelType | null;
  hasActiveRun?: boolean;
}

/**
 * Event types for session updates
 */
export type SessionUpdateEvent =
  | { type: "message_added"; sessionId: string; messageCount: number }
  | { type: "title_changed"; sessionId: string; title: string }
  | { type: "session_created"; session: SessionSyncData }
  | { type: "session_deleted"; sessionId: string }
  | { type: "session_updated"; session: Partial<SessionSyncData> & { id: string } }
  | { type: "run_started"; sessionId: string; runId: string }
  | { type: "run_completed"; sessionId: string; runId: string }
  | { type: "bulk_refresh"; characterId?: string };

type SessionUpdateListener = (event: SessionUpdateEvent) => void;

interface SessionSyncState {
  // Session data indexed by session ID for O(1) lookups
  sessionsById: Map<string, SessionSyncData>;

  // Sessions grouped by character for efficient filtering
  sessionsByCharacter: Map<string, Set<string>>;

  // Active runs tracking
  activeRuns: Map<string, string>; // sessionId -> runId

  // Last global refresh timestamp
  lastRefreshAt: number;

  // Listeners for session updates (for components that need to react)
  listeners: Set<SessionUpdateListener>;

  // Actions
  setSession: (session: SessionSyncData) => void;
  setSessions: (sessions: SessionSyncData[], characterId?: string) => void;
  updateSession: (sessionId: string, updates: Partial<SessionSyncData>) => void;
  removeSession: (sessionId: string) => void;
  setActiveRun: (sessionId: string, runId: string | null) => void;
  markSessionUpdated: (sessionId: string) => void;
  triggerRefresh: (characterId?: string) => void;

  // Subscription
  subscribe: (listener: SessionUpdateListener) => () => void;
  emit: (event: SessionUpdateEvent) => void;

  // Selectors
  getSession: (sessionId: string) => SessionSyncData | undefined;
  getSessionsByCharacter: (characterId: string) => SessionSyncData[];
  hasActiveRun: (sessionId: string) => boolean;
}

export const useSessionSyncStore = create<SessionSyncState>((set, get) => ({
  sessionsById: new Map(),
  sessionsByCharacter: new Map(),
  activeRuns: new Map(),
  lastRefreshAt: Date.now(),
  listeners: new Set(),

  setSession: (session) => {
    set((state) => {
      const newSessionsById = new Map(state.sessionsById);
      newSessionsById.set(session.id, session);

      const newSessionsByCharacter = new Map(state.sessionsByCharacter);
      if (session.characterId) {
        const characterSessions =
          newSessionsByCharacter.get(session.characterId) || new Set();
        characterSessions.add(session.id);
        newSessionsByCharacter.set(session.characterId, characterSessions);
      }

      return {
        sessionsById: newSessionsById,
        sessionsByCharacter: newSessionsByCharacter,
      };
    });

    get().emit({ type: "session_updated", session });
  },

  setSessions: (sessions, characterId) => {
    set((state) => {
      const newSessionsById = new Map(state.sessionsById);
      const newSessionsByCharacter = new Map(state.sessionsByCharacter);

      // If characterId is provided, clear existing sessions for that character
      if (characterId) {
        const existingIds = state.sessionsByCharacter.get(characterId);
        if (existingIds) {
          for (const id of existingIds) {
            newSessionsById.delete(id);
          }
        }
        newSessionsByCharacter.set(characterId, new Set());
      }

      // Add new sessions
      for (const session of sessions) {
        newSessionsById.set(session.id, session);
        if (session.characterId) {
          const characterSessions =
            newSessionsByCharacter.get(session.characterId) || new Set();
          characterSessions.add(session.id);
          newSessionsByCharacter.set(session.characterId, characterSessions);
        }
      }

      return {
        sessionsById: newSessionsById,
        sessionsByCharacter: newSessionsByCharacter,
        lastRefreshAt: Date.now(),
      };
    });

    get().emit({ type: "bulk_refresh", characterId });
  },

  updateSession: (sessionId, updates) => {
    set((state) => {
      const existing = state.sessionsById.get(sessionId);
      if (!existing) return state;

      const updated = { ...existing, ...updates };
      const newSessionsById = new Map(state.sessionsById);
      newSessionsById.set(sessionId, updated);

      return { sessionsById: newSessionsById };
    });

    get().emit({ type: "session_updated", session: { id: sessionId, ...updates } });
  },

  removeSession: (sessionId) => {
    set((state) => {
      const session = state.sessionsById.get(sessionId);
      const newSessionsById = new Map(state.sessionsById);
      newSessionsById.delete(sessionId);

      const newSessionsByCharacter = new Map(state.sessionsByCharacter);
      if (session?.characterId) {
        const characterSessions = newSessionsByCharacter.get(session.characterId);
        if (characterSessions) {
          characterSessions.delete(sessionId);
          newSessionsByCharacter.set(session.characterId, characterSessions);
        }
      }

      const newActiveRuns = new Map(state.activeRuns);
      newActiveRuns.delete(sessionId);

      return {
        sessionsById: newSessionsById,
        sessionsByCharacter: newSessionsByCharacter,
        activeRuns: newActiveRuns,
      };
    });

    get().emit({ type: "session_deleted", sessionId });
  },

  setActiveRun: (sessionId, runId) => {
    set((state) => {
      const newActiveRuns = new Map(state.activeRuns);
      if (runId) {
        newActiveRuns.set(sessionId, runId);
      } else {
        newActiveRuns.delete(sessionId);
      }
      return { activeRuns: newActiveRuns };
    });

    if (runId) {
      get().emit({ type: "run_started", sessionId, runId });
    } else {
      get().emit({ type: "run_completed", sessionId, runId: "" });
    }
  },

  markSessionUpdated: (sessionId) => {
    const now = new Date().toISOString();
    get().updateSession(sessionId, { updatedAt: now, lastMessageAt: now });
  },

  triggerRefresh: (characterId) => {
    set({ lastRefreshAt: Date.now() });
    get().emit({ type: "bulk_refresh", characterId });
  },

  subscribe: (listener) => {
    set((state) => ({
      listeners: new Set([...state.listeners, listener]),
    }));

    return () => {
      set((state) => {
        const newListeners = new Set(state.listeners);
        newListeners.delete(listener);
        return { listeners: newListeners };
      });
    };
  },

  emit: (event) => {
    const { listeners } = get();
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[SessionSync] Listener error:", error);
      }
    }
  },

  getSession: (sessionId) => get().sessionsById.get(sessionId),

  getSessionsByCharacter: (characterId) => {
    const { sessionsById, sessionsByCharacter } = get();
    const sessionIds = sessionsByCharacter.get(characterId);
    if (!sessionIds) return [];

    const sessions: SessionSyncData[] = [];
    for (const id of sessionIds) {
      const session = sessionsById.get(id);
      if (session) sessions.push(session);
    }

    // Sort by updatedAt descending
    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  hasActiveRun: (sessionId) => get().activeRuns.has(sessionId),
}));

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * Get a single session by ID with reactive updates
 */
export const useSessionData = (sessionId: string | null | undefined) =>
  useSessionSyncStore(
    useShallow((state) => (sessionId ? state.sessionsById.get(sessionId) : undefined))
  );

/**
 * Get all sessions for a character with reactive updates
 */
export const useCharacterSessions = (characterId: string | null | undefined) =>
  useSessionSyncStore(
    useShallow((state) => {
      if (!characterId) return [];
      return state.getSessionsByCharacter(characterId);
    })
  );

/**
 * Check if a session has an active run
 */
export const useSessionHasActiveRun = (sessionId: string | null | undefined) =>
  useSessionSyncStore((state) => {
    if (!sessionId) return false;
    // Prefer explicit in-memory run tracking, but fall back to DB-derived flag.
    return state.activeRuns.has(sessionId) || state.sessionsById.get(sessionId)?.hasActiveRun === true;
  });

/**
 * Get the last refresh timestamp (useful for triggering re-fetches)
 */
export const useSessionSyncRefreshTrigger = () =>
  useSessionSyncStore((state) => state.lastRefreshAt);

/**
 * Get session sync actions (stable references)
 */
export const useSessionSyncActions = () =>
  useSessionSyncStore(
    useShallow((state) => ({
      setSession: state.setSession,
      setSessions: state.setSessions,
      updateSession: state.updateSession,
      removeSession: state.removeSession,
      setActiveRun: state.setActiveRun,
      markSessionUpdated: state.markSessionUpdated,
      triggerRefresh: state.triggerRefresh,
      subscribe: state.subscribe,
    }))
  );

// ============================================================================
// Utility: Convert SessionInfo to SessionSyncData
// ============================================================================

export function sessionInfoToSyncData(session: SessionInfo): SessionSyncData {
  return {
    id: session.id,
    title: session.title,
    characterId: session.characterId ?? session.metadata?.characterId,
    updatedAt: session.updatedAt,
    lastMessageAt: session.lastMessageAt,
    messageCount: session.messageCount,
    totalTokenCount: session.totalTokenCount,
    channelType: session.channelType ?? session.metadata?.channelType,
    hasActiveRun: session.hasActiveRun,
  };
}

/**
 * Convert array of SessionInfo to SessionSyncData
 */
export function sessionInfoArrayToSyncData(sessions: SessionInfo[]): SessionSyncData[] {
  return sessions.map(sessionInfoToSyncData);
}
