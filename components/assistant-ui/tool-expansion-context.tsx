"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ToolExpansionSignal {
  /** "expand" = open everything, "collapse" = close everything */
  mode: "expand" | "collapse";
  /** Monotonically incrementing counter — consumers react to changes in this value */
  counter: number;
}

interface ToolExpansionState {
  signal: ToolExpansionSignal;
  toggleAll: () => void;
}

const ToolExpansionContext = createContext<ToolExpansionState | null>(null);

export function ToolExpansionProvider({ children }: { children: ReactNode }) {
  const [signal, setSignal] = useState<ToolExpansionSignal>({
    mode: "collapse",
    counter: 0,
  });

  const toggleAll = useCallback(() => {
    setSignal((prev) => ({
      mode: prev.mode === "expand" ? "collapse" : "expand",
      counter: prev.counter + 1,
    }));
  }, []);

  const value = useMemo(() => ({ signal, toggleAll }), [signal, toggleAll]);

  return (
    <ToolExpansionContext.Provider value={value}>
      {children}
    </ToolExpansionContext.Provider>
  );
}

/**
 * Returns the current expansion context, or null if outside the provider.
 * Components should gracefully degrade when null (standalone usage).
 */
export function useToolExpansion(): ToolExpansionState | null {
  return useContext(ToolExpansionContext);
}
