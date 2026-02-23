"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type FC } from "react";
import { useDeepResearch, type UseDeepResearchReturn } from "@/lib/hooks/use-deep-research";

interface DeepResearchContextValue extends UseDeepResearchReturn {
  // Mode toggle
  isDeepResearchMode: boolean;
  toggleDeepResearchMode: () => void;
  setDeepResearchMode: (enabled: boolean) => void;
}

const DeepResearchContext = createContext<DeepResearchContextValue | null>(null);

interface DeepResearchProviderProps {
  children: ReactNode;
  sessionId?: string;
}

export const DeepResearchProvider: FC<DeepResearchProviderProps> = ({ children, sessionId }) => {
  const [isDeepResearchMode, setIsDeepResearchMode] = useState(false);

  const deepResearch = useDeepResearch({
    sessionId,
    onComplete: (report) => {
      console.log("[DEEP-RESEARCH] Research complete:", report.title);
      // Automatically disable Deep Research Mode when research completes
      // This allows the user to send normal chat messages after viewing the report
      setIsDeepResearchMode(false);
    },
    onError: (error) => {
      console.error("[DEEP-RESEARCH] Error:", error);
      // Also disable Deep Research Mode on error so user can retry or chat normally
      setIsDeepResearchMode(false);
    },
  });

  const toggleDeepResearchMode = useCallback(() => {
    setIsDeepResearchMode((prev) => !prev);
  }, []);

  const setDeepResearchMode = useCallback((enabled: boolean) => {
    setIsDeepResearchMode(enabled);
  }, []);

  // When research is cancelled, disable deep research mode
  const handleCancel = useCallback(() => {
    deepResearch.cancelResearch();
    setIsDeepResearchMode(false);
  }, [deepResearch]);

  // Keep mode enabled while background polling is active so users can return to live progress.
  useEffect(() => {
    if (deepResearch.isBackgroundPolling) {
      setIsDeepResearchMode(true);
    }
  }, [deepResearch.isBackgroundPolling]);

  // When research is reset, disable deep research mode
  const handleReset = useCallback(() => {
    deepResearch.reset();
    setIsDeepResearchMode(false);
  }, [deepResearch]);

  return (
    <DeepResearchContext.Provider
      value={{
        ...deepResearch,
        cancelResearch: handleCancel,
        reset: handleReset,
        isDeepResearchMode,
        toggleDeepResearchMode,
        setDeepResearchMode,
      }}
    >
      {children}
    </DeepResearchContext.Provider>
  );
};

export function useDeepResearchContext(): DeepResearchContextValue {
  const context = useContext(DeepResearchContext);
  if (!context) {
    throw new Error("useDeepResearchContext must be used within a DeepResearchProvider");
  }
  return context;
}

/**
 * Hook to check if deep research is available (optional context)
 */
export function useOptionalDeepResearch(): DeepResearchContextValue | null {
  return useContext(DeepResearchContext);
}

