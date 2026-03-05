"use client";

import { createContext, useContext, type ReactNode } from "react";

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
  return (
    <BrowserActiveContext.Provider value={{ isBrowserActive, activeSessionId }}>
      {children}
    </BrowserActiveContext.Provider>
  );
}

export function useBrowserActive(): BrowserActiveState {
  return useContext(BrowserActiveContext);
}
