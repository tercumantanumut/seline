/**
 * useSessionSync Hook
 *
 * Custom hook for synchronizing session data between components.
 * Handles fetching, caching, and real-time updates of session metadata.
 */

import { useCallback, useEffect, useRef } from "react";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";
import {
  useSessionSyncStore,
  useSessionSyncActions,
  sessionInfoArrayToSyncData,
  type SessionSyncData,
  type SessionUpdateEvent,
} from "@/lib/stores/session-sync-store";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

interface UseSessionSyncOptions {
  /**
   * Character ID to filter sessions by
   */
  characterId?: string;

  /**
   * Enable automatic polling for updates
   */
  enablePolling?: boolean;

  /**
   * Polling interval in milliseconds (default: 30000)
   */
  pollingInterval?: number;

  /**
   * Callback when sessions are updated
   */
  onSessionsUpdate?: (sessions: SessionSyncData[]) => void;

  /**
   * Callback for specific session events
   */
  onSessionEvent?: (event: SessionUpdateEvent) => void;
}

interface UseSessionSyncResult {
  /**
   * Trigger a manual refresh of session data
   */
  refresh: (options?: { silent?: boolean }) => Promise<void>;

  /**
   * Update a specific session's metadata
   */
  updateSession: (sessionId: string, updates: Partial<SessionSyncData>) => void;

  /**
   * Mark a session as having new activity (updates timestamp)
   */
  markSessionActive: (sessionId: string) => void;

  /**
   * Notify that a message was added to a session
   */
  notifyMessageAdded: (sessionId: string, newMessageCount?: number) => void;

  /**
   * Notify that a session's title changed
   */
  notifyTitleChanged: (sessionId: string, newTitle: string) => void;

  /**
   * Notify that a new session was created
   */
  notifySessionCreated: (session: SessionInfo) => void;

  /**
   * Notify that a session was deleted
   */
  notifySessionDeleted: (sessionId: string) => void;

  /**
   * Notify that a background run started
   */
  notifyRunStarted: (sessionId: string, runId: string) => void;

  /**
   * Notify that a background run completed
   */
  notifyRunCompleted: (sessionId: string, runId: string) => void;

  /**
   * Sync sessions from an external source (e.g., API response)
   */
  syncSessions: (sessions: SessionInfo[], characterId?: string) => void;

  /**
   * Whether a refresh is currently in progress
   */
  isRefreshing: boolean;
}

/**
 * Hook for managing session synchronization across components
 */
export function useSessionSync(
  options: UseSessionSyncOptions = {}
): UseSessionSyncResult {
  const {
    characterId,
    enablePolling = false,
    pollingInterval = 30000,
    onSessionsUpdate,
    onSessionEvent,
  } = options;

  const isRefreshingRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const actions = useSessionSyncActions();
  const lastRefreshAt = useSessionSyncStore((state) => state.lastRefreshAt);

  // Subscribe to session events
  useEffect(() => {
    if (!onSessionEvent) return;

    const unsubscribe = actions.subscribe(onSessionEvent);
    return unsubscribe;
  }, [actions, onSessionEvent]);

  // Notify when sessions update
  useEffect(() => {
    if (!onSessionsUpdate || !characterId) return;

    const sessions = useSessionSyncStore.getState().getSessionsByCharacter(characterId);
    onSessionsUpdate(sessions);
  }, [characterId, lastRefreshAt, onSessionsUpdate]);

  // Refresh session data from API
  const refresh = useCallback(
    async (refreshOptions?: { silent?: boolean }) => {
      if (isRefreshingRef.current) return;

      try {
        isRefreshingRef.current = true;

        const params = new URLSearchParams({ limit: "50" });
        if (characterId) {
          params.set("characterId", characterId);
        }

        const { data } = await resilientFetch<{ sessions?: SessionInfo[] }>(
          `/api/sessions?${params.toString()}`,
          {
            retries: 0,
            headers: { "Cache-Control": "no-cache" },
          }
        );

        if (data) {
          const sessions = (data.sessions || []) as SessionInfo[];
          actions.setSessions(sessionInfoArrayToSyncData(sessions), characterId);
        }
      } catch (error) {
        console.error("[useSessionSync] Failed to refresh sessions:", error);
      } finally {
        isRefreshingRef.current = false;
      }
    },
    [characterId, actions]
  );

  // Setup polling
  useEffect(() => {
    if (!enablePolling) return;

    const poll = () => {
      pollingTimeoutRef.current = setTimeout(async () => {
        await refresh({ silent: true });
        poll();
      }, pollingInterval);
    };

    poll();

    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [enablePolling, pollingInterval, refresh]);

  // Update session
  const updateSession = useCallback(
    (sessionId: string, updates: Partial<SessionSyncData>) => {
      actions.updateSession(sessionId, updates);
    },
    [actions]
  );

  // Mark session as active
  const markSessionActive = useCallback(
    (sessionId: string) => {
      actions.markSessionUpdated(sessionId);
    },
    [actions]
  );

  // Notify message added
  const notifyMessageAdded = useCallback(
    (sessionId: string, newMessageCount?: number) => {
      const now = new Date().toISOString();
      const updates: Partial<SessionSyncData> = {
        updatedAt: now,
        lastMessageAt: now,
      };

      if (typeof newMessageCount === "number") {
        updates.messageCount = newMessageCount;
      }

      actions.updateSession(sessionId, updates);

      // Emit event for listeners
      useSessionSyncStore.getState().emit({
        type: "message_added",
        sessionId,
        messageCount: newMessageCount ?? 0,
      });
    },
    [actions]
  );

  // Notify title changed
  const notifyTitleChanged = useCallback(
    (sessionId: string, newTitle: string) => {
      actions.updateSession(sessionId, { title: newTitle });

      useSessionSyncStore.getState().emit({
        type: "title_changed",
        sessionId,
        title: newTitle,
      });
    },
    [actions]
  );

  // Notify session created
  const notifySessionCreated = useCallback(
    (session: SessionInfo) => {
      const syncData = sessionInfoArrayToSyncData([session])[0];
      actions.setSession(syncData);

      useSessionSyncStore.getState().emit({
        type: "session_created",
        session: syncData,
      });
    },
    [actions]
  );

  // Notify session deleted
  const notifySessionDeleted = useCallback(
    (sessionId: string) => {
      actions.removeSession(sessionId);
    },
    [actions]
  );

  // Notify run started
  const notifyRunStarted = useCallback(
    (sessionId: string, runId: string) => {
      actions.setActiveRun(sessionId, runId);
    },
    [actions]
  );

  // Notify run completed
  const notifyRunCompleted = useCallback(
    (sessionId: string, runId: string) => {
      actions.setActiveRun(sessionId, null);
      actions.markSessionUpdated(sessionId);
    },
    [actions]
  );

  // Sync sessions from external source
  const syncSessions = useCallback(
    (sessions: SessionInfo[], charId?: string) => {
      actions.setSessions(sessionInfoArrayToSyncData(sessions), charId);
    },
    [actions]
  );

  return {
    refresh,
    updateSession,
    markSessionActive,
    notifyMessageAdded,
    notifyTitleChanged,
    notifySessionCreated,
    notifySessionDeleted,
    notifyRunStarted,
    notifyRunCompleted,
    syncSessions,
    isRefreshing: isRefreshingRef.current,
  };
}

/**
 * Lightweight hook for components that just need to trigger session updates
 * without managing full session state
 */
export function useSessionSyncNotifier() {
  const actions = useSessionSyncActions();

  const notifyMessageAdded = useCallback(
    (sessionId: string, messageCount?: number) => {
      const now = new Date().toISOString();
      actions.updateSession(sessionId, {
        updatedAt: now,
        lastMessageAt: now,
        ...(typeof messageCount === "number" ? { messageCount } : {}),
      });

      useSessionSyncStore.getState().emit({
        type: "message_added",
        sessionId,
        messageCount: messageCount ?? 0,
      });
    },
    [actions]
  );

  const notifyTitleChanged = useCallback(
    (sessionId: string, title: string) => {
      actions.updateSession(sessionId, { title });

      useSessionSyncStore.getState().emit({
        type: "title_changed",
        sessionId,
        title,
      });
    },
    [actions]
  );

  const notifyRunStarted = useCallback(
    (sessionId: string, runId: string) => {
      actions.setActiveRun(sessionId, runId);
    },
    [actions]
  );

  const notifyRunCompleted = useCallback(
    (sessionId: string) => {
      actions.setActiveRun(sessionId, null);
      actions.markSessionUpdated(sessionId);
    },
    [actions]
  );

  const triggerRefresh = useCallback(
    (characterId?: string) => {
      actions.triggerRefresh(characterId);
    },
    [actions]
  );

  return {
    notifyMessageAdded,
    notifyTitleChanged,
    notifyRunStarted,
    notifyRunCompleted,
    triggerRefresh,
  };
}
