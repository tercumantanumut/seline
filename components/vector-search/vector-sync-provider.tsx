"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  VectorSyncContext,
  useVectorSyncStatusInternal,
  type VectorSyncContextType,
} from "@/hooks/use-vector-sync-status";

interface VectorSyncProviderProps {
  children: ReactNode;
}

/**
 * VectorSyncProvider - Global provider for vector sync status
 * 
 * Wraps the app to provide sync status to all components.
 * Polls the API at different intervals based on whether a sync is active.
 */
export function VectorSyncProvider({ children }: VectorSyncProviderProps) {
  const { status, isLoading, error, refresh } = useVectorSyncStatusInternal();
  const [isExpanded, setIsExpanded] = useState(false);

  const cancelSync = useCallback(async (folderId: string) => {
    try {
      // For now, we don't have a cancel endpoint, but we can add one later
      // This would call an API to stop the sync process
      console.log(`[VectorSyncProvider] Cancel sync requested for folder: ${folderId}`);
      // TODO: Implement cancel sync API endpoint
      await refresh();
    } catch (err) {
      console.error("[VectorSyncProvider] Failed to cancel sync:", err);
    }
  }, [refresh]);

  const contextValue: VectorSyncContextType = {
    status,
    isLoading,
    error,
    isExpanded,
    setIsExpanded,
    refresh,
    cancelSync,
  };

  return (
    <VectorSyncContext.Provider value={contextValue}>
      {children}
    </VectorSyncContext.Provider>
  );
}

