/**
 * Deep Research React Hook
 * 
 * Provides a React hook for managing deep research state and streaming.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { resilientFetch } from '@/lib/utils/resilient-fetch';
import type {
  DeepResearchEvent,
  ResearchPhase,
  FinalReport,
  ResearchFinding,
  DeepResearchConfig,
} from '@/lib/ai/deep-research/types';

type DeepResearchProgress = { completed: number; total: number; currentQuery: string } | null;

interface PersistedDeepResearchState {
  runId: string;
  query: string;
  phase: ResearchPhase;
  phaseMessage: string;
  progress: DeepResearchProgress;
  findings: ResearchFinding[];
  finalReport: FinalReport | null;
  error: string | null;
  updatedAt: string;
}

interface ActiveRunLookupResponse {
  hasActiveRun: boolean;
  runId?: string | null;
  pipelineName?: string;
  latestDeepResearchRunId?: string | null;
  latestDeepResearchStatus?: string | null;
  latestDeepResearchState?: PersistedDeepResearchState | null;
}

interface RunStatusResponse {
  status: string;
  pipelineName?: string;
  completedAt?: string | null;
  updatedAt?: string | null;
  isZombie?: boolean;
  deepResearchState?: PersistedDeepResearchState | null;
}

const POLL_INTERVAL_MS = 2000;
const DEEP_RESEARCH_STORAGE_PREFIX = 'seline:deep-research-state';
const DEEP_RESEARCH_COMPLETED_STATES = new Set(['succeeded', 'failed', 'cancelled']);

interface LocalDeepResearchSnapshot {
  phase: ResearchPhase;
  phaseMessage: string;
  progress: DeepResearchProgress;
  findings: ResearchFinding[];
  finalReport: FinalReport | null;
  error: string | null;
  activeRunId: string | null;
  updatedAt: string;
}

function getStorageKey(sessionId?: string): string | null {
  const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
  return normalized ? `${DEEP_RESEARCH_STORAGE_PREFIX}:${normalized}` : null;
}

function readLocalSnapshot(storageKey: string | null): LocalDeepResearchSnapshot | null {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LocalDeepResearchSnapshot;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalSnapshot(storageKey: string | null, snapshot: LocalDeepResearchSnapshot | null): void {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    if (!snapshot) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures (private mode/quota)
  }
}

export interface UseDeepResearchOptions {
  sessionId?: string;
  config?: Partial<DeepResearchConfig>;
  onComplete?: (report: FinalReport) => void;
  onError?: (error: string) => void;
}

export interface UseDeepResearchReturn {
  // State
  isActive: boolean;
  isLoading: boolean;
  phase: ResearchPhase;
  phaseMessage: string;
  progress: DeepResearchProgress;
  findings: ResearchFinding[];
  finalReport: FinalReport | null;
  error: string | null;

  // Background/polling state
  activeRunId: string | null;
  isBackgroundPolling: boolean;

  // Actions
  startResearch: (query: string) => Promise<void>;
  cancelResearch: () => void;
  reset: () => void;
  startPolling: (runId?: string | null) => void;
  stopPolling: () => void;
}

export function useDeepResearch(options: UseDeepResearchOptions = {}): UseDeepResearchReturn {
  const { sessionId, config, onComplete, onError } = options;
  
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<ResearchPhase>('idle');
  const [phaseMessage, setPhaseMessage] = useState('');
  const [progress, setProgress] = useState<DeepResearchProgress>(null);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isBackgroundPolling, setIsBackgroundPolling] = useState(false);

  const storageKey = getStorageKey(sessionId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRunIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingRunIdRef.current = null;
    setIsBackgroundPolling(false);
  }, []);

  const applyPersistedState = useCallback((state: PersistedDeepResearchState) => {
    setPhase(state.phase);
    setPhaseMessage(state.phaseMessage || "");
    setProgress(state.progress ?? null);
    setFindings(Array.isArray(state.findings) ? state.findings : []);
    setFinalReport(state.finalReport ?? null);
    setError(state.error ?? null);
    setIsActive(state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error");
    setIsLoading(state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error");
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return;
    }

    writeLocalSnapshot(storageKey, {
      phase,
      phaseMessage,
      progress,
      findings,
      finalReport,
      error,
      activeRunId,
      updatedAt: new Date().toISOString(),
    });
  }, [activeRunId, error, finalReport, findings, phase, phaseMessage, progress, storageKey]);

  const reset = useCallback(() => {
    stopPolling();
    setIsActive(false);
    setIsLoading(false);
    setPhase('idle');
    setPhaseMessage('');
    setProgress(null);
    setFindings([]);
    setFinalReport(null);
    setError(null);
    setActiveRunId(null);
    writeLocalSnapshot(storageKey, null);
  }, [stopPolling, storageKey]);

  const cancelResearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const runIdToCancel = activeRunIdRef.current;
    if (runIdToCancel) {
      void resilientFetch(`/api/agent-runs/${runIdToCancel}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        retries: 0,
        timeout: 8000,
      });
    }

    stopPolling();
    setActiveRunId(null);
    setIsActive(false);
    setIsLoading(false);
    setPhase('idle');
    setPhaseMessage('Research cancelled');
    setError(null);
  }, [stopPolling]);

  // Use refs for callbacks to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const resolveDeepResearchRun = useCallback(async () => {
    if (!sessionId) {
      return null;
    }

    const { data } = await resilientFetch<ActiveRunLookupResponse>(
      `/api/sessions/${sessionId}/active-run`,
      { retries: 0, timeout: 8000 }
    );

    if (!data) {
      return null;
    }

    const runId = data.pipelineName === 'deep-research'
      ? data.runId ?? null
      : data.latestDeepResearchRunId ?? null;

    const status = data.pipelineName === 'deep-research'
      ? (data.hasActiveRun ? 'running' : null)
      : data.latestDeepResearchStatus ?? null;

    return {
      runId,
      status,
      state: data.latestDeepResearchState ?? null,
    };
  }, [sessionId]);

  const pollRunStatus = useCallback(async (runId: string): Promise<boolean> => {
    const { data, error } = await resilientFetch<RunStatusResponse>(`/api/agent-runs/${runId}/status`, {
      retries: 0,
      timeout: 8000,
    });

    if (error || !data) {
      return false;
    }

    if (data.deepResearchState) {
      applyPersistedState(data.deepResearchState);
    }

    const isRunning = data.status === "running";
    setIsActive(isRunning);
    setIsLoading(isRunning);

    if (!isRunning) {
      stopPolling();
      setActiveRunId(null);

      if (data.deepResearchState?.finalReport) {
        onCompleteRef.current?.(data.deepResearchState.finalReport);
      }

      if (data.deepResearchState?.error) {
        onErrorRef.current?.(data.deepResearchState.error);
      }

      if (!data.deepResearchState?.finalReport && !data.deepResearchState?.error) {
        setIsActive(false);
        setIsLoading(false);
      }

      return true;
    }

    return false;
  }, [applyPersistedState, stopPolling]);

  const startPolling = useCallback((runId?: string | null) => {
    const targetRunId = runId ?? activeRunIdRef.current;
    if (!targetRunId) {
      return;
    }

    if (pollingRunIdRef.current === targetRunId && pollingIntervalRef.current) {
      return;
    }

    stopPolling();
    pollingRunIdRef.current = targetRunId;
    setActiveRunId(targetRunId);
    setIsBackgroundPolling(true);
    setIsActive(true);
    setIsLoading(true);

    void pollRunStatus(targetRunId);
    pollingIntervalRef.current = setInterval(() => {
      void pollRunStatus(targetRunId);
    }, POLL_INTERVAL_MS);
  }, [pollRunStatus, stopPolling]);

  const handleEvent = useCallback((event: DeepResearchEvent) => {
    console.log('[DEEP-RESEARCH-HOOK] Received event:', event.type, event);

    switch (event.type) {
      case 'phase_change':
        setPhase(event.phase);
        setPhaseMessage(event.message);
        break;
      case 'search_progress':
        setProgress({ completed: event.completed, total: event.total, currentQuery: event.currentQuery });
        break;
      case 'search_result':
        setFindings(prev => [...prev, event.finding]);
        break;
      case 'final_report':
        console.log('[DEEP-RESEARCH-HOOK] Setting final report:', event.report?.title);
        setFinalReport(event.report);
        setPhase('complete');
        setIsActive(false);
        setIsLoading(false);
        onCompleteRef.current?.(event.report);
        break;
      case 'error':
        setError(event.error);
        setPhase('error');
        setIsActive(false);
        setIsLoading(false);
        onErrorRef.current?.(event.error);
        break;
      case 'complete':
        // Phase should already be set by final_report, but ensure it's complete
        setPhase(prev => prev === 'error' ? prev : 'complete');
        setIsActive(false);
        setIsLoading(false);
        break;
    }
  }, []);

  const startResearch = useCallback(async (query: string) => {
    // Reset state
    reset();
    setIsActive(true);
    setIsLoading(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/deep-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sessionId, config }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start research');
      }

      const responseRunId = response.headers.get('X-Run-Id');
      if (responseRunId) {
        setActiveRunId(responseRunId);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let hasStreamActivity = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining buffer content
          if (buffer.trim()) {
            console.log('[DEEP-RESEARCH-HOOK] Processing remaining buffer:', buffer);
          }
          break;
        }

        hasStreamActivity = true;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('[DEEP-RESEARCH-HOOK] Received [DONE] signal');
              continue;
            }

            try {
              const event: DeepResearchEvent = JSON.parse(data);
              handleEvent(event);
            } catch (parseError) {
              console.warn('[DEEP-RESEARCH-HOOK] Failed to parse event:', data, parseError);
            }
          }
        }
      }

      console.log('[DEEP-RESEARCH-HOOK] Stream ended');

      // If the stream closes before we receive terminal events, continue via status polling.
      const shouldStartPolling = !hasStreamActivity
        || (phase !== 'complete' && phase !== 'error' && phase !== 'idle');

      if (shouldStartPolling) {
        const fallbackRunId = activeRunIdRef.current;
        const resolved = await resolveDeepResearchRun();
        if (resolved?.state) {
          applyPersistedState(resolved.state);
        }

        if (resolved?.runId && resolved.status === 'running') {
          setActiveRunId(resolved.runId);
          startPolling(resolved.runId);
        } else if (fallbackRunId && !DEEP_RESEARCH_COMPLETED_STATES.has(resolved?.status ?? '')) {
          startPolling(fallbackRunId);
        } else {
          setActiveRunId(resolved?.runId ?? null);
          setIsActive(false);
          setIsLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Cancelled, don't set error
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[DEEP-RESEARCH-HOOK] Error:', errorMessage);
      setError(errorMessage);
      setPhase('error');
      setIsActive(false);
      setIsLoading(false);
      onErrorRef.current?.(errorMessage);
    } finally {
      abortControllerRef.current = null;
    }
  }, [applyPersistedState, config, handleEvent, reset, resolveDeepResearchRun, startPolling]);

  useEffect(() => {
    if (!sessionId) {
      stopPolling();
      setActiveRunId(null);
      return;
    }

    const localSnapshot = readLocalSnapshot(storageKey);
    if (localSnapshot) {
      setPhase(localSnapshot.phase);
      setPhaseMessage(localSnapshot.phaseMessage || '');
      setProgress(localSnapshot.progress ?? null);
      setFindings(Array.isArray(localSnapshot.findings) ? localSnapshot.findings : []);
      setFinalReport(localSnapshot.finalReport ?? null);
      setError(localSnapshot.error ?? null);
      if (localSnapshot.activeRunId) {
        setActiveRunId(localSnapshot.activeRunId);
      }
    }

    hasHydratedRef.current = true;

    let cancelled = false;

    const restore = async () => {
      const resolved = await resolveDeepResearchRun();
      if (cancelled || !resolved) {
        return;
      }

      if (resolved.state) {
        applyPersistedState(resolved.state);
      }

      if (!resolved.runId) {
        stopPolling();
        setActiveRunId(null);
        return;
      }

      setActiveRunId(resolved.runId);
      if (resolved.status === 'running') {
        startPolling(resolved.runId);
      } else {
        stopPolling();
      }
    };

    void restore();

    return () => {
      cancelled = true;
      hasHydratedRef.current = false;
      stopPolling();
    };
  }, [applyPersistedState, resolveDeepResearchRun, sessionId, startPolling, stopPolling, storageKey]);

  return {
    isActive,
    isLoading,
    phase,
    phaseMessage,
    progress,
    findings,
    finalReport,
    error,
    activeRunId,
    isBackgroundPolling,
    startResearch,
    cancelResearch,
    reset,
    startPolling,
    stopPolling,
  };
}

