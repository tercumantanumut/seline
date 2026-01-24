"use client";

import { Loader2Icon, WrenchIcon, AlertCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMCPReloadStatus } from "@/hooks/use-mcp-reload-status";

/**
 * Global MCP reload indicator - Shows when MCP servers are reloading
 * 
 * Appears in the top-right corner similar to the sync indicator.
 */
export function MCPReloadIndicator() {
    const { status } = useMCPReloadStatus();

    if (!status.isReloading) return null;

    const hasErrors = status.failedServers.length > 0;

    return (
        <div
            className={cn(
                "fixed top-20 right-4 z-50",
                "flex items-center gap-2 rounded-lg border px-3 py-2",
                "text-xs font-mono shadow-lg backdrop-blur-sm",
                hasErrors
                    ? "border-yellow-300 bg-yellow-50/90 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/90 dark:text-yellow-200"
                    : "border-blue-300 bg-blue-50/90 text-blue-800 dark:border-blue-700 dark:bg-blue-900/90 dark:text-blue-200"
            )}
        >
            {hasErrors ? (
                <AlertCircleIcon className="size-4 flex-shrink-0" />
            ) : (
                <Loader2Icon className="size-4 flex-shrink-0 animate-spin" />
            )}

            <div className="flex flex-col gap-0.5">
                <div className="font-semibold">
                    {hasErrors ? "Tool Initialization Issues" : "Initializing Tools"}
                </div>
                <div className="text-[10px] opacity-80">
                    {status.completedServers} / {status.totalServers} servers ready
                    {status.estimatedTimeRemaining > 0 && (
                        <> · ~{Math.ceil(status.estimatedTimeRemaining / 1000)}s</>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="ml-2 h-1.5 w-24 overflow-hidden rounded-full bg-white/50 dark:bg-black/30">
                <div
                    className={cn(
                        "h-full transition-all duration-300",
                        hasErrors ? "bg-yellow-500" : "bg-blue-500"
                    )}
                    style={{ width: `${status.progress}%` }}
                />
            </div>
        </div>
    );
}
