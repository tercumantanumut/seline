/**
 * MCP Tools Page
 *
 * Terminal wizard page for selecting MCP servers and tools for an agent.
 */

"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plug, ChevronDown, ChevronRight } from "lucide-react";
import type { MCPTool } from "@/lib/mcp/types";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface MCPToolPreference {
    enabled: boolean;
    loadingMode: "always" | "deferred";
}

interface MCPToolsPageProps {
    enabledMcpServers: string[];
    enabledMcpTools: string[];
    mcpToolPreferences: Record<string, MCPToolPreference>;
    onUpdate: (
        servers: string[],
        tools: string[],
        preferences: Record<string, MCPToolPreference>
    ) => void;
    onComplete: () => void;
    onBack?: () => void;
    embedded?: boolean; // When true, used inside a dialog (don't use h-full)
}

interface GroupedTools {
    [serverName: string]: MCPTool[];
}

interface MCPServerStatus {
    serverName: string;
    connected: boolean;
    lastError?: string;
    toolCount: number;
    tools: string[];
}

export function MCPToolsPage({
    enabledMcpServers,
    enabledMcpTools,
    mcpToolPreferences,
    onUpdate,
    onComplete,
    onBack,
    embedded = false,
}: MCPToolsPageProps) {
    const t = useTranslations("characterCreation.mcpTools");
    const [tools, setTools] = useState<MCPTool[]>([]);
    const [status, setStatus] = useState<MCPServerStatus[]>([]);
    const [config, setConfig] = useState<{ mcpServers?: Record<string, { enabled?: boolean }> } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [selectedServers, setSelectedServers] = useState<Set<string>>(
        new Set(enabledMcpServers)
    );
    const [selectedTools, setSelectedTools] = useState<Set<string>>(
        new Set(enabledMcpTools)
    );
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

    // NEW: Track per-tool preferences
    const [toolPreferences, setToolPreferences] = useState<Record<string, MCPToolPreference>>(
        mcpToolPreferences
    );

    // Sync preferences when prop changes
    useEffect(() => {
        setToolPreferences(mcpToolPreferences);
    }, [mcpToolPreferences]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (autoConnectIfNeeded = true) => {
        try {
            // Load config and status
            const configRes = await fetch("/api/mcp");
            const configData = await configRes.json();
            setStatus(configData.status || []);
            setConfig(configData.config || null);

            // Load tools
            const toolsRes = await fetch("/api/mcp/tools");
            const toolsData = await toolsRes.json();
            const loadedTools = toolsData.tools || [];
            setTools(loadedTools);

            // Auto-connect if: servers are configured but no tools discovered yet
            // This handles the case where the app restarted and servers need reconnection
            const hasConfiguredServers = configData.config?.mcpServers &&
                Object.keys(configData.config.mcpServers).length > 0;
            const hasNoTools = loadedTools.length === 0;

            if (autoConnectIfNeeded && hasConfiguredServers && hasNoTools) {
                console.log("[MCPToolsPage] Auto-connecting to configured MCP servers...");
                setIsConnecting(true);
                try {
                    await fetch("/api/mcp/connect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                    });
                    // Reload data after connection (without auto-connect to prevent loop)
                    return loadData(false);
                } catch (connectError) {
                    console.error("[MCPToolsPage] Auto-connect failed:", connectError);
                } finally {
                    setIsConnecting(false);
                }
            }

            // Initialize preferences for all discovered tools if not already set
            const newPreferences = { ...toolPreferences };
            const newSelectedServers = new Set(selectedServers);
            const newSelectedTools = new Set(selectedTools);
            let hasChanges = false;

            loadedTools.forEach((tool: MCPTool) => {
                const toolKey = `${tool.serverName}:${tool.name}`;

                if (!(toolKey in newPreferences)) {
                    const shouldEnable = newSelectedTools.has(toolKey) || newSelectedServers.has(tool.serverName);
                    newPreferences[toolKey] = { enabled: shouldEnable, loadingMode: "deferred" };
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                setToolPreferences(newPreferences);
                setSelectedServers(newSelectedServers);
                setSelectedTools(newSelectedTools);
                onUpdate(
                    Array.from(newSelectedServers),
                    Array.from(newSelectedTools),
                    newPreferences
                );
            }
        } catch (error) {
            console.error("Failed to load MCP data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const connectServers = async () => {
        setIsConnecting(true);
        try {
            await fetch("/api/mcp/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            await loadData();
        } catch (error) {
            console.error("Failed to connect to MCP servers:", error);
        } finally {
            setIsConnecting(false);
        }
    };

    // Group tools by server
    const groupedTools: GroupedTools = tools.reduce((acc, tool) => {
        if (!acc[tool.serverName]) {
            acc[tool.serverName] = [];
        }
        acc[tool.serverName].push(tool);
        return acc;
    }, {} as GroupedTools);

    const serverNames = Object.keys(groupedTools);

    const toggleServer = (serverName: string) => {
        const newServers = new Set(selectedServers);
        const newTools = new Set(selectedTools);
        const newPreferences = { ...toolPreferences };

        if (newServers.has(serverName)) {
            // Disable server and all its tools
            newServers.delete(serverName);
            groupedTools[serverName].forEach(tool => {
                const toolKey = `${serverName}:${tool.name}`;
                newTools.delete(toolKey);
                // Mark as disabled in preferences
                newPreferences[toolKey] = {
                    ...(newPreferences[toolKey] ?? { loadingMode: "deferred" }),
                    enabled: false,
                };
            });
        } else {
            // Enable server and all its tools
            newServers.add(serverName);
            groupedTools[serverName].forEach(tool => {
                const toolKey = `${serverName}:${tool.name}`;
                newTools.add(toolKey);
                // Mark as enabled in preferences
                newPreferences[toolKey] = {
                    ...(newPreferences[toolKey] ?? { loadingMode: "deferred" }),
                    enabled: true,
                };
            });
        }

        setSelectedServers(newServers);
        setSelectedTools(newTools);
        setToolPreferences(newPreferences);
        onUpdate(Array.from(newServers), Array.from(newTools), newPreferences);
    };

    const toggleTool = (serverName: string, toolName: string) => {
        const toolKey = `${serverName}:${toolName}`;
        const newTools = new Set(selectedTools);
        const newPreferences = { ...toolPreferences };

        if (newTools.has(toolKey)) {
            newTools.delete(toolKey);
            // Mark as disabled in preferences
            newPreferences[toolKey] = {
                ...(newPreferences[toolKey] ?? { loadingMode: "deferred" }),
                enabled: false,
            };
        } else {
            newTools.add(toolKey);
            // Mark as enabled in preferences
            newPreferences[toolKey] = {
                ...(newPreferences[toolKey] ?? { loadingMode: "deferred" }),
                enabled: true,
            };
        }

        setSelectedTools(newTools);
        setToolPreferences(newPreferences);
        onUpdate(Array.from(selectedServers), Array.from(newTools), newPreferences);
    };

    // NEW: Toggle individual tool's loading mode
    const toggleToolLoadingMode = (serverName: string, toolName: string) => {
        const toolKey = `${serverName}:${toolName}`;
        const currentPref = toolPreferences[toolKey] ?? { enabled: true, loadingMode: "deferred" as const };

        const newPreferences = {
            ...toolPreferences,
            [toolKey]: {
                ...currentPref,
                loadingMode: currentPref.loadingMode === "always" ? "deferred" as const : "always" as const,
            },
        };

        setToolPreferences(newPreferences);
        onUpdate(Array.from(selectedServers), Array.from(selectedTools), newPreferences);
    };

    const toggleServerExpanded = (serverName: string) => {
        const newExpanded = new Set(expandedServers);
        if (newExpanded.has(serverName)) {
            newExpanded.delete(serverName);
        } else {
            newExpanded.add(serverName);
        }
        setExpandedServers(newExpanded);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-terminal-green" />
                <span className="ml-2 font-mono text-sm text-terminal-muted">{t("loading")}</span>
            </div>
        );
    }

    // Check if there are any configured AND enabled servers (from config, not just status)
    const configuredServerNames = Object.entries(config?.mcpServers || {})
        .filter(([_, serverConfig]) => serverConfig?.enabled !== false)
        .map(([name]) => name);
    const hasConfiguredServers = configuredServerNames.length > 0;

    if (!hasConfiguredServers && serverNames.length === 0) {
        return (
            <div className="space-y-4 p-4">
                <div className="rounded-lg border border-terminal-border bg-terminal-cream/50 p-6 text-center">
                    <Plug className="mx-auto h-12 w-12 text-terminal-muted" />
                    <h3 className="mt-4 font-mono text-lg font-semibold text-terminal-dark">
                        {t("noServersTitle")}
                    </h3>
                    <p className="mt-2 font-mono text-sm text-terminal-muted">
                        {t("noServersDescription")}
                    </p>
                </div>
                <div className="flex justify-center">
                    <button
                        onClick={onComplete}
                        className="rounded bg-terminal-green px-6 py-2 font-mono text-sm text-white hover:bg-terminal-green/90"
                    >
                        {t("skipForNow")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8",
            !embedded && "h-full min-h-full"
        )}>
            <div className="flex w-full max-w-4xl flex-1 flex-col gap-6 min-h-0">
                {/* Header */}
                <div className="space-y-2">
                    <h2 className="font-mono text-lg font-semibold text-terminal-dark">
                        {t("title")}
                    </h2>
                    <p className="font-mono text-sm text-terminal-muted">
                        {t("description")}
                    </p>
                </div>

                {/* Content Area - Scrollable */}
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30">
                    <div className="flex-1 min-h-0 overflow-y-auto p-5 pr-3">
                        {/* Connect button if servers aren't connected */}
                        {hasConfiguredServers && serverNames.length === 0 && (
                            <div className="rounded-lg border border-terminal-border bg-terminal-cream/50 p-4 mb-4">
                                <p className="mb-3 font-mono text-sm text-terminal-muted">
                                    {t("serversNotConnected")}
                                </p>
                                <button
                                    onClick={connectServers}
                                    disabled={isConnecting}
                                    className="rounded bg-terminal-green px-4 py-2 font-mono text-sm text-white hover:bg-terminal-green/90 disabled:opacity-50"
                                >
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                                            {t("connecting")}
                                        </>
                                    ) : (
                                        t("connectDiscover")
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Server/Tool list */}
                        {serverNames.length > 0 && (
                            <div className="space-y-3">
                                {serverNames.map((serverName) => {
                                    const serverTools = groupedTools[serverName];
                                    const isServerEnabled = selectedServers.has(serverName);
                                    const isExpanded = expandedServers.has(serverName);
                                    const enabledToolCount = serverTools.filter(t =>
                                        selectedTools.has(`${serverName}:${t.name}`)
                                    ).length;
                                    const serverStatus = status.find(s => s.serverName === serverName);

                                    return (
                                        <div key={serverName} className="rounded-lg border border-terminal-border bg-terminal-cream/50 overflow-hidden">
                                            {/* Server Header */}
                                            <div
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-terminal-cream"
                                                onClick={() => toggleServerExpanded(serverName)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4 text-terminal-muted" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-terminal-muted" />
                                                    )}
                                                    <Checkbox
                                                        checked={isServerEnabled}
                                                        onCheckedChange={() => toggleServer(serverName)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="border-terminal-border"
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <Plug className="h-4 w-4 text-purple-500" />
                                                        <span className="font-mono font-semibold text-terminal-dark">{serverName}</span>
                                                        {serverStatus?.connected && (
                                                            <span className="text-xs text-terminal-green">● {t("connected")}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge variant={isServerEnabled ? "default" : "secondary"} className="font-mono">
                                                    {t("toolsCount", { enabled: enabledToolCount, total: serverTools.length })}
                                                </Badge>
                                            </div>

                                            {/* Tools List */}
                                            {isExpanded && (
                                                <div className="border-t border-terminal-border bg-white p-3 space-y-2">
                                                    {serverTools.map((tool) => {
                                                        const toolKey = `${serverName}:${tool.name}`;
                                                        const isToolEnabled = selectedTools.has(toolKey);
                                                        const toolPref = toolPreferences[toolKey] ?? { enabled: true, loadingMode: "deferred" as const };

                                                        return (
                                                            <div key={tool.name} className="flex items-start justify-between gap-3 pl-8">
                                                                <div className="flex items-start gap-3">
                                                                    <Checkbox
                                                                        checked={isToolEnabled}
                                                                        onCheckedChange={() => toggleTool(serverName, tool.name)}
                                                                        className="mt-0.5 border-terminal-border"
                                                                    />
                                                                    <div>
                                                                        <div className="font-mono text-sm font-medium text-terminal-dark">
                                                                            {tool.name}
                                                                        </div>
                                                                        {tool.description && (
                                                                            <div className="font-mono text-xs text-terminal-muted">
                                                                                {tool.description}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Loading mode toggle */}
                                                                {isToolEnabled && (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => toggleToolLoadingMode(serverName, tool.name)}
                                                                            className={`
                                                                                rounded px-2 py-1 font-mono text-xs transition-colors
                                                                                ${toolPref.loadingMode === "always"
                                                                                    ? "bg-terminal-green text-white"
                                                                                    : "bg-terminal-cream text-terminal-muted border border-terminal-border"
                                                                                }
                                                                            `}
                                                                            title={toolPref.loadingMode === "always"
                                                                                ? t("loadingMode.alwaysTooltip")
                                                                                : t("loadingMode.deferredTooltip")
                                                                            }
                                                                        >
                                                                            {toolPref.loadingMode === "always"
                                                                                ? t("loadingMode.always")
                                                                                : t("loadingMode.deferred")
                                                                            }
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Navigation - Fixed at bottom */}
                    <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="order-2 text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark sm:order-1"
                            >
                                ← Back
                            </button>
                        )}
                        <button
                            onClick={onComplete}
                            className="order-1 w-full rounded bg-terminal-dark px-4 py-2 text-sm font-mono text-terminal-cream transition-colors hover:bg-terminal-dark/90 sm:order-2 sm:w-auto"
                        >
                            {t("continue")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
