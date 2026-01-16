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

interface MCPToolsPageProps {
    enabledMcpServers: string[];
    enabledMcpTools: string[];
    onUpdate: (servers: string[], tools: string[]) => void;
    onComplete: () => void;
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
    onUpdate,
    onComplete,
}: MCPToolsPageProps) {
    const [tools, setTools] = useState<MCPTool[]>([]);
    const [status, setStatus] = useState<MCPServerStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [selectedServers, setSelectedServers] = useState<Set<string>>(
        new Set(enabledMcpServers)
    );
    const [selectedTools, setSelectedTools] = useState<Set<string>>(
        new Set(enabledMcpTools)
    );
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Load config and status
            const configRes = await fetch("/api/mcp");
            const configData = await configRes.json();
            setStatus(configData.status || []);

            // Load tools
            const toolsRes = await fetch("/api/mcp/tools");
            const toolsData = await toolsRes.json();
            setTools(toolsData.tools || []);
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

        if (newServers.has(serverName)) {
            // Disable server and all its tools
            newServers.delete(serverName);
            groupedTools[serverName].forEach(tool => {
                newTools.delete(`${serverName}:${tool.name}`);
            });
        } else {
            // Enable server and all its tools
            newServers.add(serverName);
            groupedTools[serverName].forEach(tool => {
                newTools.add(`${serverName}:${tool.name}`);
            });
        }

        setSelectedServers(newServers);
        setSelectedTools(newTools);
        onUpdate(Array.from(newServers), Array.from(newTools));
    };

    const toggleTool = (serverName: string, toolName: string) => {
        const toolId = `${serverName}:${toolName}`;
        const newTools = new Set(selectedTools);

        if (newTools.has(toolId)) {
            newTools.delete(toolId);
        } else {
            newTools.add(toolId);
        }

        setSelectedTools(newTools);
        onUpdate(Array.from(selectedServers), Array.from(newTools));
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
                <span className="ml-2 font-mono text-sm text-terminal-muted">Loading MCP tools...</span>
            </div>
        );
    }

    // Check if there are any configured servers (from status)
    const hasConfiguredServers = status.length > 0;

    if (!hasConfiguredServers && serverNames.length === 0) {
        return (
            <div className="space-y-4 p-4">
                <div className="rounded-lg border border-terminal-border bg-terminal-cream/50 p-6 text-center">
                    <Plug className="mx-auto h-12 w-12 text-terminal-muted" />
                    <h3 className="mt-4 font-mono text-lg font-semibold text-terminal-dark">
                        No MCP Servers Configured
                    </h3>
                    <p className="mt-2 font-mono text-sm text-terminal-muted">
                        Configure MCP servers in Settings → MCP Servers to enable external tools.
                    </p>
                </div>
                <div className="flex justify-center">
                    <button
                        onClick={onComplete}
                        className="rounded bg-terminal-green px-6 py-2 font-mono text-sm text-white hover:bg-terminal-green/90"
                    >
                        Skip for Now
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            <div>
                <h2 className="font-mono text-lg font-semibold text-terminal-dark">
                    MCP Tools
                </h2>
                <p className="mt-1 font-mono text-sm text-terminal-muted">
                    Select which MCP servers and tools to enable for this agent.
                </p>
            </div>

            {/* Connect button if servers aren't connected */}
            {hasConfiguredServers && serverNames.length === 0 && (
                <div className="rounded-lg border border-terminal-border bg-terminal-cream/50 p-4">
                    <p className="mb-3 font-mono text-sm text-terminal-muted">
                        MCP servers are configured but not connected. Connect to discover available tools.
                    </p>
                    <button
                        onClick={connectServers}
                        disabled={isConnecting}
                        className="rounded bg-terminal-green px-4 py-2 font-mono text-sm text-white hover:bg-terminal-green/90 disabled:opacity-50"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            "Connect & Discover Tools"
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
                                                <span className="text-xs text-terminal-green">● Connected</span>
                                            )}
                                        </div>
                                    </div>
                                    <Badge variant={isServerEnabled ? "default" : "secondary"} className="font-mono">
                                        {enabledToolCount}/{serverTools.length} tools
                                    </Badge>
                                </div>

                                {/* Tools List */}
                                {isExpanded && isServerEnabled && (
                                    <div className="border-t border-terminal-border bg-white p-3 space-y-2">
                                        {serverTools.map((tool) => {
                                            const toolId = `${serverName}:${tool.name}`;
                                            const isToolEnabled = selectedTools.has(toolId);

                                            return (
                                                <div key={tool.name} className="flex items-start gap-3 pl-8">
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
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Continue button */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={onComplete}
                    className="rounded bg-terminal-green px-6 py-2 font-mono text-sm text-white hover:bg-terminal-green/90"
                >
                    Continue
                </button>
            </div>
        </div>
    );
}
