import { useState, useEffect, useRef, useCallback } from "react";

interface DelegationInfo {
  delegationId: string;
  sessionId: string;
  delegateAgentId: string;
  delegateAgent: string;
  task: string;
  running: boolean;
  elapsed: number;
}

interface DelegationStatus {
  delegations: DelegationInfo[];
  isLoading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 5000;

export function useDelegationStatus(characterId: string | null): DelegationStatus {
  const [delegations, setDelegations] = useState<DelegationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!characterId) return;
    try {
      const res = await fetch(`/api/delegations/status?characterId=${encodeURIComponent(characterId)}`);
      if (!res.ok) {
        setError(`Failed to fetch delegation status: ${res.status}`);
        return;
      }
      const data = await res.json();
      setDelegations(data.delegations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (!characterId) {
      setDelegations([]);
      return;
    }

    setIsLoading(true);
    fetchStatus();

    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [characterId, fetchStatus]);

  return { delegations, isLoading, error };
}
