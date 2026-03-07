"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type ToolDisplayMode = "compact" | "detailed";

interface ToolDisplayPreferences {
  displayMode: ToolDisplayMode;
  devWorkspaceEnabled: boolean;
  isWorkspaceContext: boolean;
  effectiveDisplayMode: ToolDisplayMode;
}

const ToolDisplayContext = createContext<ToolDisplayPreferences>({
  displayMode: "compact",
  devWorkspaceEnabled: false,
  isWorkspaceContext: false,
  effectiveDisplayMode: "compact",
});

interface ToolDisplayProviderProps {
  children: ReactNode;
  displayMode?: ToolDisplayMode;
  devWorkspaceEnabled?: boolean;
  isWorkspaceContext?: boolean;
}

export function ToolDisplayProvider({
  children,
  displayMode,
  devWorkspaceEnabled = false,
  isWorkspaceContext = false,
}: ToolDisplayProviderProps) {
  // Workspace chats force the richer live tool view, but only when developer
  // workspace mode is actually enabled in settings.
  const effectiveDisplayMode =
    devWorkspaceEnabled && isWorkspaceContext ? "detailed" : (displayMode ?? "compact");

  const value = useMemo<ToolDisplayPreferences>(
    () => ({
      displayMode: displayMode ?? "compact",
      devWorkspaceEnabled,
      isWorkspaceContext,
      effectiveDisplayMode,
    }),
    [devWorkspaceEnabled, displayMode, effectiveDisplayMode, isWorkspaceContext]
  );

  return <ToolDisplayContext.Provider value={value}>{children}</ToolDisplayContext.Provider>;
}

export function useToolDisplayPreferences(): ToolDisplayPreferences {
  return useContext(ToolDisplayContext);
}
