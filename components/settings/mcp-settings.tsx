/**
 * MCP Settings Component
 * 
 * UI for configuring MCP servers with a user-friendly card interface,
 * templates, and connection management.
 */

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Loader2, Check, X, RefreshCw, Plus, Trash2, Plug,
    Terminal, Globe, AlertCircle, Play, Square
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MCPServerConfig } from "@/lib/mcp/types";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

interface MCPServerStatus {
    serverName: string;
    connected: boolean;
    lastError?: string;
    toolCount: number;
    tools: string[];
}

const PREBUILT_TEMPLATES = [
    {
        id: "filesystem",
        name: "Filesystem",
        description: "Read/write files safely",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
        }
    },
    {
        id: "github",
        name: "GitHub",
        description: "Repo management & search",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "" }
        }
    },
    {
        id: "postgres",
        name: "PostgreSQL",
        description: "Database access",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:password@localhost/db"]
        }
    },
    {
        id: "linear",
        name: "Linear",
        description: "Issue tracking & project management",
        config: {
            command: "npx",
            args: ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
        }
    },
    {
        id: "supabase",
        name: "Supabase",
        description: "Database & API management",
        config: {
            command: "npx",
            args: ["-y", "mcp-remote", "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}"],
            env: {
                "SUPABASE_PROJECT_REF": "",
                "SUPABASE_ACCESS_TOKEN": "",
                "MCP_REMOTE_HEADERS": "{\"Authorization\": \"Bearer ${SUPABASE_ACCESS_TOKEN}\"}"
            }
        }
    },
    {
        id: "assistant-ui",
        name: "Assistant UI Docs",
        description: "Documentation for Assistant UI",
        config: {
            command: "npx",
            args: ["-y", "@assistant-ui/mcp-docs-server"]
        }
    },
    {
        id: "everything",
        name: "Everything",
        description: "Reference implementation",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-everything"]
        }
    },
];

export function MCPSettings() {
    const t = useTranslations("settings.mcp");
    const [mcpServers, setMcpServers] = useState<Record<string, MCPServerConfig>>({});
    const [environment, setEnvironment] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<MCPServerStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [connectingState, setConnectingState] = useState<Record<string, boolean>>({});

    // UI State
    const [showJsonMode, setShowJsonMode] = useState(false);
    const [rawJson, setRawJson] = useState("");
    const [isAddingServer, setIsAddingServer] = useState(false);
    const [newServerName, setNewServerName] = useState("");
    const [newServerType, setNewServerType] = useState<"stdio" | "sse">("stdio");
    const [newServerCommand, setNewServerCommand] = useState("");
    const [newServerArgs, setNewServerArgs] = useState("");
    const [newServerUrl, setNewServerUrl] = useState("");

    // Env Vars
    const [newEnvKey, setNewEnvKey] = useState("");
    const [showNewEnvInput, setShowNewEnvInput] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/mcp");
            const data = await res.json();
            setMcpServers(data.config.mcpServers || {});
            setRawJson(JSON.stringify({ mcpServers: data.config.mcpServers || {} }, null, 2));
            setEnvironment(data.environment || {});
            setStatus(data.status || []);
        } catch (error) {
            console.error("Failed to load MCP config:", error);
            toast.error("Failed to load MCP configuration");
        } finally {
            setIsLoading(false);
        }
    };

    const saveAll = async (updatedServers = mcpServers, updatedEnv = environment) => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/mcp", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mcpServers: { mcpServers: updatedServers }, mcpEnvironment: updatedEnv }),
            });

            if (!res.ok) throw new Error("Failed to save");

            setMcpServers(updatedServers);
            setRawJson(JSON.stringify({ mcpServers: updatedServers }, null, 2));
            setEnvironment(updatedEnv);
            toast.success("Configuration saved");
        } catch (error) {
            console.error("Failed to save MCP config:", error);
            toast.error("Failed to save configuration");
        } finally {
            setIsSaving(false);
        }
    };

    const connectServer = async (serverName: string) => {
        setConnectingState(prev => ({ ...prev, [serverName]: true }));
        try {
            const res = await fetch("/api/mcp/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serverNames: [serverName] }),
            });

            const data = await res.json();
            const result = data.results[serverName];

            if (result?.success) {
                toast.success(`Connected to ${serverName}`);
            } else {
                toast.error(`Failed to connect to ${serverName}: ${result?.error}`);
            }

            await loadConfig();
        } catch (error) {
            console.error(`Failed to connect to ${serverName}:`, error);
            toast.error(`Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setConnectingState(prev => ({ ...prev, [serverName]: false }));
        }
    };

    // Actually we don't have a disconnect API yet, but we can restart connection which effectively resets it
    // Implementing a true disconnect would require a new API endpoint, for now we just re-connect or remove

    const handleAddServer = async () => {
        if (!newServerName.trim()) {
            toast.error("Server name is required");
            return;
        }

        if (mcpServers[newServerName]) {
            toast.error("Server with this name already exists");
            return;
        }

        const newConfig: MCPServerConfig = {};
        if (newServerType === "stdio") {
            if (!newServerCommand.trim()) {
                toast.error("Command is required for stdio transport");
                return;
            }
            newConfig.command = newServerCommand;
            newConfig.args = newServerArgs.split("\n").map(a => a.trim()).filter(a => a);
        } else {
            if (!newServerUrl.trim()) {
                toast.error("URL is required for SSE transport");
                return;
            }
            newConfig.url = newServerUrl;
            newConfig.type = "sse";
        }

        const updatedServers = { ...mcpServers, [newServerName]: newConfig };
        await saveAll(updatedServers);
        setIsAddingServer(false);
        resetForm();
    };

    const resetForm = () => {
        setNewServerName("");
        setNewServerType("stdio");
        setNewServerCommand("");
        setNewServerArgs("");
        setNewServerUrl("");
    };

    const handleApplyTemplate = (template: typeof PREBUILT_TEMPLATES[0]) => {
        setNewServerName(template.id);
        setNewServerType(template.config.command ? "stdio" : "sse");
        setNewServerCommand(template.config.command || "");
        setNewServerArgs(template.config.args?.join("\n") || "");
        setIsAddingServer(true);

        // Check if env vars needed
        if (template.config.env) {
            const newEnv = { ...environment };
            let changed = false;
            Object.keys(template.config.env).forEach(key => {
                if (!newEnv[key]) {
                    newEnv[key] = "";
                    changed = true;
                }
            });
            if (changed) setEnvironment(newEnv);
        }
    };

    const handleDeleteServer = async (serverName: string) => {
        if (!confirm(`Are you sure you want to delete ${serverName}?`)) return;

        const updatedServers = { ...mcpServers };
        delete updatedServers[serverName];
        await saveAll(updatedServers);
        // Also disconnect if needed (via reload)
        loadConfig();
    };

    /**
     * Toggle server enabled/disabled state
     * Disconnects server immediately when disabled
     */
    const handleToggleServer = async (serverName: string, enabled: boolean) => {
        const updatedServers = {
            ...mcpServers,
            [serverName]: {
                ...mcpServers[serverName],
                enabled,
            },
        };

        await saveAll(updatedServers);

        // If disabling, the API will handle disconnection
        // Load config to refresh status badges
        if (!enabled) {
            toast.success(`${serverName} ${t("serverDisabled")}`);
            await loadConfig();
        } else {
            toast.success(`${serverName} ${t("serverEnabled")}`);
        }
    };

    const getStatusDisplay = (serverName: string) => {
        const s = status.find(st => st.serverName === serverName);
        if (!s) return { badge: "bg-terminal-border text-terminal-muted", icon: AlertCircle, text: "Not Connected" };
        if (s.connected) return { badge: "bg-terminal-green/20 text-terminal-green", icon: Check, text: "Connected" };
        return { badge: "bg-red-100 text-red-600", icon: X, text: "Error" };
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-terminal-green" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">

            {/* 1. Quick Start Templates */}
            <div className="space-y-4">
                <h3 className="font-mono text-sm font-semibold text-terminal-dark border-b border-terminal-border pb-2">
                    Recommended Servers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {PREBUILT_TEMPLATES.map(template => (
                        <button
                            key={template.id}
                            onClick={() => handleApplyTemplate(template)}
                            className="flex flex-col items-start p-4 rounded-lg border border-terminal-border bg-white hover:border-terminal-green hover:shadow-sm transition-all text-left"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded bg-terminal-green/10 text-terminal-green">
                                    <Terminal className="h-4 w-4" />
                                </div>
                                <span className="font-mono font-medium text-sm">{template.name}</span>
                            </div>
                            <p className="font-mono text-xs text-terminal-muted">{template.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Configured Servers List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-terminal-border pb-2">
                    <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                        Configured Servers
                    </h3>
                    <Button size="sm" onClick={() => setIsAddingServer(!isAddingServer)} variant={isAddingServer ? "secondary" : "default"}>
                        <Plus className="h-4 w-4 mr-2" />
                        {isAddingServer ? "Cancel" : "Add Custom Server"}
                    </Button>
                </div>

                {/* Add Server Form */}
                {isAddingServer && (
                    <div className="rounded-lg border border-terminal-green bg-terminal-green/5 p-4 space-y-4 animate-in fade-in slide-in-from-top-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Server Name</Label>
                                <Input
                                    value={newServerName}
                                    onChange={(e) => setNewServerName(e.target.value)}
                                    placeholder="e.g. my-server"
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Transport Type</Label>
                                <div className="flex bg-white rounded-md border border-terminal-border p-1">
                                    <button
                                        onClick={() => setNewServerType("stdio")}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-mono transition-colors",
                                            newServerType === "stdio" ? "bg-terminal-green text-white" : "hover:bg-gray-100"
                                        )}
                                    >
                                        <Terminal className="h-3 w-3" /> Stdio
                                    </button>
                                    <button
                                        onClick={() => setNewServerType("sse")}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-mono transition-colors",
                                            newServerType === "sse" ? "bg-terminal-green text-white" : "hover:bg-gray-100"
                                        )}
                                    >
                                        <Globe className="h-3 w-3" /> SSE
                                    </button>
                                </div>
                            </div>
                        </div>

                        {newServerType === "stdio" ? (
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>Command</Label>
                                    <Input
                                        value={newServerCommand}
                                        onChange={(e) => setNewServerCommand(e.target.value)}
                                        placeholder="npx"
                                        className="font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Arguments (one per line)</Label>
                                    <Textarea
                                        value={newServerArgs}
                                        onChange={(e) => setNewServerArgs(e.target.value)}
                                        placeholder="-y\n@modelcontextprotocol/server-example"
                                        className="font-mono h-24"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Server URL</Label>
                                <Input
                                    value={newServerUrl}
                                    onChange={(e) => setNewServerUrl(e.target.value)}
                                    placeholder="https://api.example.com/sse"
                                    className="font-mono"
                                />
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setIsAddingServer(false)}>Cancel</Button>
                            <Button onClick={handleAddServer} disabled={isSaving}>Save Server</Button>
                        </div>
                    </div>
                )}

                {/* Server Cards */}
                {Object.keys(mcpServers).length === 0 && !isAddingServer ? (
                    <div className="text-center py-10 border border-dashed border-terminal-border rounded-lg bg-terminal-bg/50">
                        <Plug className="h-8 w-8 text-terminal-muted mx-auto mb-2" />
                        <p className="font-mono text-sm text-terminal-muted">No servers configured. Add one to get started.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {Object.entries(mcpServers).map(([name, config]) => {
                            const s = getStatusDisplay(name);
                            const StatusIcon = s.icon;
                            const isConnecting = connectingState[name];
                            const currentStatus = status.find(st => st.serverName === name);

                            return (
                                <div
                                    key={name}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-lg border bg-white shadow-sm hover:shadow-md transition-all",
                                        config.enabled === false
                                            ? "border-terminal-border/50 opacity-60"
                                            : "border-terminal-border"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn("p-2 rounded-full", s.badge)}>
                                            <StatusIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-mono font-semibold text-terminal-dark">{name}</h4>
                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-terminal-muted">
                                                    {config.type || (config.command ? "stdio" : "sse")}
                                                </Badge>
                                                {config.enabled === false && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] h-5 px-1.5 font-normal bg-yellow-100 text-yellow-700"
                                                        title={t("disabledTooltip")}
                                                    >
                                                        {t("disabledBadge")}
                                                    </Badge>
                                                )}
                                            </div>

                                            {currentStatus?.lastError ? (
                                                <p className="font-mono text-xs text-red-500 mt-1 max-w-md truncate" title={currentStatus.lastError}>
                                                    {currentStatus.lastError}
                                                </p>
                                            ) : (
                                                <div className="flex gap-4 mt-1">
                                                    <span className="font-mono text-xs text-terminal-muted truncate max-w-[200px]" title={config.command ? `${config.command} ${config.args?.join(" ")}` : config.url}>
                                                        {config.command ? `${config.command} ${config.args?.join(" ")}` : config.url}
                                                    </span>
                                                    {currentStatus?.connected && (
                                                        <span className="font-mono text-xs text-terminal-green">
                                                            {currentStatus.toolCount} tools active
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={config.enabled !== false}
                                            onCheckedChange={(checked) => handleToggleServer(name, checked)}
                                            className="data-[state=checked]:bg-terminal-green"
                                            aria-label={config.enabled !== false ? t("disableServer") : t("enableServer")}
                                            disabled={isSaving}
                                        />

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className={cn("h-8 px-2", isConnecting && "animate-pulse")}
                                            onClick={() => connectServer(name)}
                                            disabled={isConnecting || config.enabled === false}
                                        >
                                            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-terminal-muted hover:text-terminal-dark" />}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 px-2 hover:bg-red-50"
                                            onClick={() => handleDeleteServer(name)}
                                        >
                                            <Trash2 className="h-4 w-4 text-terminal-muted hover:text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 3. Environment Variables */}
            <div className="space-y-4">
                <h3 className="font-mono text-sm font-semibold text-terminal-dark border-b border-terminal-border pb-2">
                    Environment Variables
                </h3>

                <div className="space-y-2">
                    {Object.keys(environment).length === 0 && (
                        <p className="font-mono text-xs text-terminal-muted italic">No environment variables set.</p>
                    )}

                    {Object.entries(environment).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                            <Input value={key} disabled className="w-1/3 font-mono text-xs bg-gray-50" />
                            <Input
                                type="password"
                                value={value}
                                onChange={(e) => setEnvironment({ ...environment, [key]: e.target.value })}
                                placeholder="Value..."
                                className="flex-1 font-mono text-xs"
                                onBlur={() => saveAll(mcpServers, environment)}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                const newEnv = { ...environment };
                                delete newEnv[key];
                                setEnvironment(newEnv);
                                saveAll(mcpServers, newEnv);
                            }}>
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}

                    {!showNewEnvInput ? (
                        <Button size="sm" variant="outline" onClick={() => setShowNewEnvInput(true)} className="mt-2">
                            <Plus className="h-3 w-3 mr-2" /> Add Variable
                        </Button>
                    ) : (
                        <div className="flex gap-2 mt-2 items-center animate-in fade-in">
                            <Input
                                value={newEnvKey}
                                onChange={(e) => setNewEnvKey(e.target.value)}
                                placeholder="MY_API_KEY"
                                className="w-1/3 font-mono text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && newEnvKey) {
                                        setEnvironment({ ...environment, [newEnvKey]: "" });
                                        setNewEnvKey("");
                                        setShowNewEnvInput(false);
                                    }
                                }}
                            />
                            <span className="text-xs text-terminal-muted">=</span>
                            <span className="text-xs text-terminal-muted italic">Value (enter later)</span>
                            <div className="flex gap-1 ml-auto">
                                <Button size="sm" onClick={() => {
                                    if (newEnvKey) {
                                        setEnvironment({ ...environment, [newEnvKey]: "" });
                                        setNewEnvKey("");
                                        setShowNewEnvInput(false);
                                    }
                                }}>Add</Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowNewEnvInput(false)}>Cancel</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Advanced Mode Toggle */}
            <div className="pt-4 border-t border-terminal-border">
                <Button
                    variant="link"
                    size="sm"
                    onClick={() => setShowJsonMode(!showJsonMode)}
                    className="text-xs text-terminal-muted hover:text-terminal-dark p-0"
                >
                    {showJsonMode ? "Hide Advanced JSON Config" : "Show Advanced JSON Config"}
                </Button>

                {showJsonMode && (
                    <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                        <Label>Raw JSON Configuration</Label>
                        <Textarea
                            value={rawJson}
                            onChange={(e) => setRawJson(e.target.value)}
                            className="font-mono text-xs h-48"
                        />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => {
                                try {
                                    const parsed = JSON.parse(rawJson);
                                    if (parsed.mcpServers) {
                                        setMcpServers(parsed.mcpServers);
                                        saveAll(parsed.mcpServers, environment);
                                    } else {
                                        toast.error("Invalid JSON: missing 'mcpServers' root key");
                                    }
                                } catch (e) {
                                    toast.error("Invalid JSON syntax");
                                }
                            }}>Update from JSON</Button>
                        </div>
                        <p className="text-xs text-terminal-muted">First key must be &quot;mcpServers&quot;.</p>
                    </div>
                )}
            </div>

        </div>
    );
}
