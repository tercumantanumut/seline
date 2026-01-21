"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface MCPReloadStatus {
    isReloading: boolean;
    progress: number; // 0-100
    estimatedTimeRemaining: number; // milliseconds
    failedServers: string[];
    currentServer?: string;
    totalServers: number;
    completedServers: number;
}

interface MCPReloadContextType {
    status: MCPReloadStatus;
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const DEFAULT_STATUS: MCPReloadStatus = {
    isReloading: false,
    progress: 100,
    estimatedTimeRemaining: 0,
    failedServers: [],
    totalServers: 0,
    completedServers: 0,
};

export const MCPReloadContext = createContext<MCPReloadContextType | null>(null);

export function useMCPReloadStatus() {
    const context = useContext(MCPReloadContext);
    if (!context) {
        return {
            status: DEFAULT_STATUS,
            isLoading: false,
            refresh: async () => { },
        };
    }
    return context;
}

/**
 * Internal hook for fetching MCP reload status from the API
 */
export function useMCPReloadStatusInternal(characterId?: string) {
    const [status, setStatus] = useState<MCPReloadStatus>(DEFAULT_STATUS);
    const [isLoading, setIsLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!characterId) {
            setStatus(DEFAULT_STATUS);
            return;
        }

        try {
            setIsLoading(true);
            const response = await fetch(`/api/mcp/reload-status?characterId=${characterId}`);
            if (response.ok) {
                const data = await response.json();
                setStatus(data);
            } else {
                // If error, reset to default
                setStatus(DEFAULT_STATUS);
            }
        } catch (error) {
            console.error("[MCPReloadStatus] Failed to fetch status:", error);
            setStatus(DEFAULT_STATUS);
        } finally {
            setIsLoading(false);
        }
    }, [characterId]);

    // Initial fetch
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Poll while reloading (every 500ms), otherwise check every 5s
    useEffect(() => {
        const interval = setInterval(
            refresh,
            status.isReloading ? 500 : 5000
        );

        return () => clearInterval(interval);
    }, [refresh, status.isReloading]);

    return { status, isLoading, refresh };
}
