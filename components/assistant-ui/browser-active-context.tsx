"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

interface BrowserActiveState {
  isBrowserActive: boolean;
  activeSessionId?: string;
}

const BrowserActiveContext = createContext<BrowserActiveState>({
  isBrowserActive: false,
});

export function BrowserActiveProvider({
  isBrowserActive,
  activeSessionId,
  children,
}: BrowserActiveState & { children: ReactNode }) {
  const value = useMemo(
    () => ({ isBrowserActive, activeSessionId }),
    [isBrowserActive, activeSessionId]
  );
  return (
    <BrowserActiveContext.Provider value={value}>
      {children}
    </BrowserActiveContext.Provider>
  );
}

export function useBrowserActive(): BrowserActiveState {
  return useContext(BrowserActiveContext);
}
