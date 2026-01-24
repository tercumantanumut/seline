"use client";

import { type ReactNode } from "react";
import {
    MCPReloadContext,
    useMCPReloadStatusInternal,
} from "@/hooks/use-mcp-reload-status";
import { useCharacter } from "@/components/assistant-ui/character-context";

interface MCPReloadProviderProps {
    children: ReactNode;
}

/**
 * MCPReloadProvider - Provides MCP reload status to child components
 * 
 * Polls the API for reload status and makes it available via context.
 * Automatically tracks the current character ID.
 */
export function MCPReloadProvider({ children }: MCPReloadProviderProps) {
    const { character } = useCharacter();
    const { status, isLoading, refresh } = useMCPReloadStatusInternal(character?.id);

    return (
        <MCPReloadContext.Provider value={{ status, isLoading, refresh }}>
            {children}
        </MCPReloadContext.Provider>
    );
}
