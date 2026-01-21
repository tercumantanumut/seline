"use client";

import { VectorSyncProvider } from "./vector-sync-provider";
import { GlobalSyncIndicator } from "./global-sync-indicator";
import { MCPReloadProvider } from "@/components/mcp-reload-provider";
import { MCPReloadIndicator } from "@/components/mcp-reload-indicator";
import type { ReactNode } from "react";

interface GlobalSyncWrapperProps {
  children: ReactNode;
}

/**
 * GlobalSyncWrapper - Client component that provides sync status globally
 * 
 * This wraps the app content with the VectorSyncProvider and MCPReloadProvider,
 * and renders the GlobalSyncIndicator and MCPReloadIndicator for persistent visibility.
 */
export function GlobalSyncWrapper({ children }: GlobalSyncWrapperProps) {
  return (
    <VectorSyncProvider>
      <MCPReloadProvider>
        {children}
        <GlobalSyncIndicator />
        <MCPReloadIndicator />
      </MCPReloadProvider>
    </VectorSyncProvider>
  );
}


