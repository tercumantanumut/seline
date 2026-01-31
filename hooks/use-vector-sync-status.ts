"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { GlobalSyncStatus, SyncStatusFolder } from "@/app/api/sync-status/route";

// Default empty state
const DEFAULT_STATUS: GlobalSyncStatus = {
  isEnabled: false,
  isSyncing: false,
  activeSyncs: [],
  pendingSyncs: [],
  recentErrors: [],
  totalFolders: 0,
  totalSyncingOrPending: 0,
};

// Polling intervals
const ACTIVE_POLL_INTERVAL = 5000; // 5 seconds when syncing (reduce log noise)
const IDLE_POLL_INTERVAL = 60000; // 60 seconds when idle
const DISABLED_POLL_INTERVAL = 600000; // 10 minutes when vector DB is disabled

interface VectorSyncContextType {
  status: GlobalSyncStatus;
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  refresh: () => Promise<void>;
  cancelSync: (folderId: string) => Promise<void>;
}

const VectorSyncContext = createContext<VectorSyncContextType | null>(null);

export function useVectorSyncStatus() {
  const context = useContext(VectorSyncContext);
  if (!context) {
    // Return a default value if used outside provider
    return {
      status: DEFAULT_STATUS,
      isLoading: false,
      error: null,
      isExpanded: false,
      setIsExpanded: () => { },
      refresh: async () => { },
      cancelSync: async () => { },
    };
  }
  return context;
}

interface UseVectorSyncStatusInternalResult {
  status: GlobalSyncStatus;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Internal hook that handles the actual fetching logic
 */
export function useVectorSyncStatusInternal(): UseVectorSyncStatusInternalResult {
  const [status, setStatus] = useState<GlobalSyncStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const response = await fetch("/api/sync-status");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch sync status");
      }
      const data: GlobalSyncStatus = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sync status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling based on sync state - use active polling if syncing OR if there are pending/active syncs
  useEffect(() => {
    if (!status.isEnabled) {
      const timer = setInterval(fetchStatus, DISABLED_POLL_INTERVAL);
      return () => clearInterval(timer);
    }

    const hasActiveWork = status.isSyncing || status.pendingSyncs.length > 0 || status.activeSyncs.length > 0;
    const interval = hasActiveWork ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    const timer = setInterval(fetchStatus, interval);
    return () => clearInterval(timer);
  }, [status.isEnabled, status.isSyncing, status.pendingSyncs.length, status.activeSyncs.length, fetchStatus]);

  return {
    status,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}

// Export context for provider
export { VectorSyncContext, DEFAULT_STATUS };
export type { VectorSyncContextType, GlobalSyncStatus, SyncStatusFolder };

