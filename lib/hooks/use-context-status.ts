"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

/**
 * Context window status as returned by the API.
 */
export interface ContextWindowStatus {
  percentage: number;
  status: "safe" | "warning" | "critical" | "exceeded";
  currentTokens: number;
  maxTokens: number;
  formatted: {
    current: string;
    max: string;
    percentage: string;
  };
  thresholds: {
    warning: number;
    critical: number;
    hardLimit: number;
  };
  shouldCompact: boolean;
  mustCompact: boolean;
  recommendedAction: string;
  model?: {
    id: string;
    provider: string;
  };
}

export interface UseContextStatusOptions {
  /** Session ID to track. Null/undefined disables polling. */
  sessionId: string | null | undefined;
  /** Poll interval in ms. Default: 0 (no polling, only manual refresh). */
  pollIntervalMs?: number;
  /** Whether to auto-fetch on mount. Default: true. */
  autoFetch?: boolean;
}

export interface UseContextStatusReturn {
  status: ContextWindowStatus | null;
  isLoading: boolean;
  error: string | null;
  /** Manually refresh the context status. */
  refresh: () => Promise<void>;
  /** Trigger manual compaction and refresh status afterwards. */
  compact: () => Promise<{ success: boolean; compacted: boolean }>;
  isCompacting: boolean;
}

/**
 * Hook to fetch and track context window status for a session.
 *
 * Usage:
 * ```tsx
 * const { status, refresh, compact, isCompacting } = useContextStatus({
 *   sessionId: "abc-123",
 *   pollIntervalMs: 30000, // optional polling
 * });
 * ```
 */
export function useContextStatus({
  sessionId,
  pollIntervalMs = 0,
  autoFetch = true,
}: UseContextStatusOptions): UseContextStatusReturn {
  const [status, setStatus] = useState<ContextWindowStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!sessionId) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await resilientFetch<ContextWindowStatus>(
      `/api/sessions/${sessionId}/context-status`,
      { signal: controller.signal, retries: 0 }
    );

    // Request was aborted (e.g., component unmounted or new request started)
    if (controller.signal.aborted) return;

    if (fetchError) {
      setError(fetchError);
    } else {
      setStatus(data);
    }

    setIsLoading(false);
  }, [sessionId]);

  const compact = useCallback(async (): Promise<{
    success: boolean;
    compacted: boolean;
  }> => {
    if (!sessionId) return { success: false, compacted: false };

    setIsCompacting(true);

    const { data, error: fetchError } = await resilientFetch<{
      success?: boolean;
      compacted?: boolean;
      status?: ContextWindowStatus;
    }>(`/api/sessions/${sessionId}/context-status`, { method: "POST", retries: 0 });

    if (fetchError) {
      setError(fetchError);
      setIsCompacting(false);
      return { success: false, compacted: false };
    }

    // Update status from the response
    if (data?.status) {
      setStatus({
        ...data.status,
        // Ensure all required fields are present
        shouldCompact: data.status.shouldCompact ?? false,
        mustCompact: data.status.mustCompact ?? false,
        recommendedAction: data.status.recommendedAction ?? "",
        thresholds: data.status.thresholds ?? status?.thresholds ?? {
          warning: 0,
          critical: 0,
          hardLimit: 0,
        },
      });
    }

    setIsCompacting(false);
    return { success: data?.success ?? true, compacted: data?.compacted ?? false };
  }, [sessionId, status?.thresholds]);

  // Auto-fetch on mount / sessionId change
  useEffect(() => {
    if (autoFetch && sessionId) {
      fetchStatus();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [autoFetch, sessionId, fetchStatus]);

  // Optional polling
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0 || !sessionId) return;

    const interval = setInterval(fetchStatus, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs, sessionId, fetchStatus]);

  // Reset when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      setError(null);
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    status,
    isLoading,
    error,
    refresh: fetchStatus,
    compact,
    isCompacting,
  };
}
