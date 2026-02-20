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
    Terminal, Globe, AlertCircle, Play, Square, Info,
    PlusCircle, AlertTriangle, ChevronDown, Edit2, Key
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resilientFetch, resilientPut, resilientPost } from "@/lib/utils/resilient-fetch";
import type { MCPServerConfig } from "@/lib/mcp/types";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { MCPServerForm } from "@/components/settings/mcp-server-form";

interface MCPServerStatus {
    serverName: string;
    connected: boolean;
    lastError?: string;
    toolCount: number;
    tools: string[];
}

interface MCPTemplate {
    id: string;
    name: string;
    description: string;
    config: MCPServerConfig;
    requiredEnv: string[];
    setupInstructions?: string;
    authType?: string;
    difficulty?: "Easy" | "Medium" | "Advanced";
}

const PREBUILT_TEMPLATES: MCPTemplate[] = [
    {
        id: "filesystem",
        name: "Files (single folder)",
        description: "Read and write files in one synced folder",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "${SYNCED_FOLDER}"]
        },
        requiredEnv: []
    },
    {
        id: "filesystem-multi",
        name: "Files (all folders)",
        description: "Access every synced folder",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "${SYNCED_FOLDERS_ARRAY}"]
        },
        requiredEnv: []
    },
    {
        id: "github",
        name: "GitHub",
        description: "Manage repositories and search code",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "" }
        },
        requiredEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"]
    },
    {
        id: "chrome-devtools",
        name: "Chrome DevTools",
        description: "Inspect and debug pages in Chrome",
        config: {
            command: "npx",
            args: ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]
        },
        requiredEnv: []
    },
    {
        id: "postgres",
        name: "PostgreSQL",
        description: "Connect to a PostgreSQL database",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:password@localhost/db"]
        },
        requiredEnv: []
    },
    {
        id: "composio",
        name: "Composio",
        description: "Connect many apps through Composio",
        config: {
            type: "sse" as const,
            // Supports V3: https://backend.composio.dev/v3/mcp/{connection_id}/mcp
            // Supports Router: https://backend.composio.dev/tool_router/{router_id}/mcp
            url: "https://backend.composio.dev/v3/mcp/${COMPOSIO_CONNECTION_ID}/mcp",
            headers: {
                "X-API-Key": "${COMPOSIO_API_KEY}"
            }
        },
        requiredEnv: ["COMPOSIO_API_KEY", "COMPOSIO_CONNECTION_ID"],
        setupInstructions: "Get Connection ID from Composio. For Tool Router, replace URL with: https://backend.composio.dev/tool_router/{router_id}/mcp",
        authType: "Header + URL",
        difficulty: "Medium"
    },
    {
        id: "linear",
        name: "Linear",
        description: "Track issues and manage projects",
        config: {
            command: "npx",
            args: ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
        },
        requiredEnv: [],
        difficulty: "Easy"
    },
    {
        id: "supabase",
        name: "Supabase",
        description: "Manage Supabase project data and APIs",
        config: {
            command: "npx",
            args: ["-y", "mcp-remote", "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}"],
            env: {
                "SUPABASE_PROJECT_REF": "",
                "SUPABASE_ACCESS_TOKEN": "",
                "MCP_REMOTE_HEADERS": "{\"Authorization\": \"Bearer ${SUPABASE_ACCESS_TOKEN}\"}"
            }
        },
        requiredEnv: ["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"],
        difficulty: "Medium"
    },
    {
        id: "assistant-ui",
        name: "Assistant UI Docs",
        description: "Search Assistant UI documentation",
        config: {
            command: "npx",
            args: ["-y", "@assistant-ui/mcp-docs-server"]
        },
        requiredEnv: []
    },
    {
        id: "everything",
        name: "Everything",
        description: "Sample server with many example tools",
        config: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-everything"]
        },
        requiredEnv: []
    },
];

/**
 * Helper to show a preview of how path variables will be resolved
 */
function ConfigPreview({
    config,
    syncedFolders,
    t
}: {
    config: MCPServerConfig,
    syncedFolders: Array<{ folderPath: string, isPrimary: boolean, characterId?: string }>,
    t: any
}) {
    const primaryFolder = syncedFolders.find(f => f.isPrimary)?.folderPath || syncedFolders[0]?.folderPath || "";

    const resolveArg = (arg: string) => {
        if (arg === "${SYNCED_FOLDER}") return primaryFolder || "<no-primary-folder>";
        // Return array for SYNCED_FOLDERS_ARRAY to match actual execution
        if (arg === "${SYNCED_FOLDERS_ARRAY}") return syncedFolders.length > 0 ? syncedFolders.map(f => f.folderPath) : ["<no-folders>"];
        if (arg === "${SYNCED_FOLDERS}") return syncedFolders.map(f => f.folderPath).join(",") || "<no-folders>";
        return arg;
    };

    const resolvedArgs = config.args?.map(resolveArg) || [];
    const flatArgs = resolvedArgs.flatMap(arg => Array.isArray(arg) ? arg : [arg]);

    return (
        <div className="mt-2 space-y-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-3 font-mono text-[10px]">
            <div className="text-terminal-muted flex items-center gap-1.5 mb-1">
                <Info className="h-3 w-3" />
                {t("variablePreview")}
            </div>
            <div className="text-terminal-dark break-all">
                <span className="text-terminal-green">{config.command}</span>{" "}
                {flatArgs.map((arg, i) => (
                    <span key={i} className={cn(
                        "mr-1.5",
                        arg.includes("/") ? "text-blue-600" : "text-terminal-dark"
                    )}>
                        {arg}
                    </span>
                ))}
            </div>
        </div>
    );
}

/**
 * Validation logic for MCP configuration
 */
function validateMCPConfig(
    config: MCPServerConfig,
    syncedFolders: Array<{ folderPath: string }>
): string[] {
    const warnings: string[] = [];

    const hasPathVariable = config.args?.some(arg =>
        arg.includes("${SYNCED_FOLDER}") ||
        arg.includes("${SYNCED_FOLDERS_ARRAY}") ||
        arg.includes("${SYNCED_FOLDERS}")
    );

    if (hasPathVariable && syncedFolders.length === 0) {
        warnings.push("Contains path variables, but no folders are synced yet.");
    }

    if (config.command === "npx" && config.args?.some(a => a.includes("@modelcontextprotocol/server-filesystem"))) {
        const hasDirectoryArg = (config.args?.length || 0) > 2; // npx -y pkg [dir]
        if (!hasDirectoryArg) {
            warnings.push("Filesystem server usually requires at least one directory argument.");
        }
    }

    return warnings;
}

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
    const [editingServer, setEditingServer] = useState<string | null>(null);

    // Env Vars
    const [newEnvKey, setNewEnvKey] = useState("");
    const [showNewEnvInput, setShowNewEnvInput] = useState(false);

    // Synced folders for path preview/documentation
    const [syncedFolders, setSyncedFolders] = useState<Array<{ folderPath: string, isPrimary: boolean, characterId: string }>>([]);

    useEffect(() => {
        loadConfig();
        loadSyncedFolders();
    }, []);

    const loadSyncedFolders = async () => {
        const { data, error } = await resilientFetch<{ folders?: Array<{ folderPath: string; isPrimary: boolean; characterId: string }> }>("/api/vector-sync");
        if (data) {
            setSyncedFolders(data.folders || []);
        }
        if (error) {
            console.error("Failed to load synced folders:", error);
        }
    };

    const loadConfig = async () => {
        setIsLoading(true);
        const { data, error } = await resilientFetch<{
            config: { mcpServers?: Record<string, MCPServerConfig> };
            environment?: Record<string, string>;
            status?: MCPServerStatus[];
        }>("/api/mcp");
        if (data) {
            setMcpServers(data.config.mcpServers || {});
            setRawJson(JSON.stringify({ mcpServers: data.config.mcpServers || {} }, null, 2));
            setEnvironment(data.environment || {});
            setStatus(data.status || []);
        }
        if (error) {
            console.error("Failed to load MCP config:", error);
            toast.error("Failed to load MCP configuration");
        }
        setIsLoading(false);
    };

    const saveAll = async (updatedServers = mcpServers, updatedEnv = environment) => {
        setIsSaving(true);
        const { error } = await resilientPut("/api/mcp", {
            mcpServers: { mcpServers: updatedServers },
            mcpEnvironment: updatedEnv,
        });
        if (!error) {
            setMcpServers(updatedServers);
            setRawJson(JSON.stringify({ mcpServers: updatedServers }, null, 2));
            setEnvironment(updatedEnv);
            toast.success("Settings saved");
        } else {
            console.error("Failed to save MCP config:", error);
            toast.error("Could not save settings");
        }
        setIsSaving(false);
    };

    const connectServer = async (serverName: string) => {
        setConnectingState(prev => ({ ...prev, [serverName]: true }));
        // Get characterId from the first synced folder if available
        const characterId = syncedFolders[0]?.characterId;

        const { data, error } = await resilientPost<{
            results: Record<string, { success?: boolean; error?: string }>;
        }>("/api/mcp/connect", {
            serverNames: [serverName],
            characterId,
        });

        if (data) {
            const result = data.results[serverName];
            if (result?.success) {
                toast.success(`Connected to ${serverName}`);
            } else {
                toast.error(`Could not connect to ${serverName}: ${result?.error}`);
            }
            await loadConfig();
        } else {
            console.error(`Failed to connect to ${serverName}:`, error);
            toast.error(`Connection failed: ${error || "Unknown issue"}`);
        }
        setConnectingState(prev => ({ ...prev, [serverName]: false }));
    };

    // Handle form save (for both add and edit)
    const handleFormSave = async (name: string, config: MCPServerConfig) => {
        const updatedServers = { ...mcpServers, [name]: config };
        await saveAll(updatedServers);
        setIsAddingServer(false);
        setEditingServer(null);
        toast.success(`Server ${name} ${editingServer ? 'updated' : 'added'}`);
    };

    const handleFormCancel = () => {
        setIsAddingServer(false);
        setEditingServer(null);
    };

    const handleApplyTemplate = async (template: MCPTemplate) => {
        // Check if env vars needed and add them
        if (template.requiredEnv && template.requiredEnv.length > 0) {
            const newEnv = { ...environment };
            let changed = false;
            template.requiredEnv.forEach(key => {
                if (!newEnv[key]) {
                    newEnv[key] = "";
                    changed = true;
                }
            });
            if (changed) {
                setEnvironment(newEnv);
                await saveAll(mcpServers, newEnv);
                toast.info(`Added ${template.requiredEnv.length} environment variable(s). Fill in the values below.`);
            }
        }

        // Add server directly from template
        const updatedServers = { ...mcpServers, [template.id]: template.config };
        await saveAll(updatedServers);
        toast.success(`${template.name} server added`);
    };

    const handleDeleteServer = async (serverName: string) => {
        if (!confirm(`Delete ${serverName}?`)) return;

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
        if (!s) return { badge: "bg-terminal-border text-terminal-muted", icon: AlertCircle, text: "Not connected" };
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
                    Recommended servers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {PREBUILT_TEMPLATES.map(template => (
                        <button
                            key={template.id}
                            onClick={() => handleApplyTemplate(template)}
                            className="flex flex-col items-start p-3 rounded-md border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 hover:border-terminal-green hover:shadow-sm transition-all text-left"
                        >
                            <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded bg-terminal-green/10 text-terminal-green">
                                        {template.config.type === "sse" ? (
                                            <Globe className="h-4 w-4" />
                                        ) : (
                                            <Terminal className="h-4 w-4" />
                                        )}
                                    </div>
                                    <span className="font-mono font-medium text-sm">{template.name}</span>
                                </div>
                                {template.requiredEnv.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                                        <Key className="h-3 w-3 mr-1" />
                                        Auth
                                    </Badge>
                                )}
                            </div>
                            <p className="font-mono text-xs text-terminal-muted mt-1 line-clamp-1">{template.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                                    {template.config.type === "sse" ? "sse" : "stdio"}
                                </Badge>
                                {template.difficulty && (
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                        {template.difficulty}
                                    </Badge>
                                )}
                                {template.requiredEnv.length > 0 && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 px-1.5 text-[10px] text-terminal-muted"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Info className="h-3 w-3 mr-1" />
                                                Help
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 text-xs">
                                            <div className="space-y-2">
                                                <p className="font-semibold">{template.name}</p>
                                                <p>Required variables: {template.requiredEnv.join(", ")}</p>
                                                {template.setupInstructions && (
                                                    <p className="text-terminal-muted">{template.setupInstructions}</p>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Configured Servers List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-terminal-border pb-2">
                    <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                        Added servers
                    </h3>
                    <Button size="sm" onClick={() => setIsAddingServer(!isAddingServer)} variant={isAddingServer ? "secondary" : "default"}>
                        <Plus className="h-4 w-4 mr-2" />
                        {isAddingServer ? "Cancel" : "Add custom server"}
                    </Button>
                </div>

                {/* Add Server Form */}
                {isAddingServer && (
                    <MCPServerForm
                        environment={environment}
                        syncedFolders={syncedFolders}
                        onSave={handleFormSave}
                        onCancel={handleFormCancel}
                        existingNames={Object.keys(mcpServers)}
                    />
                )}

                {/* Server Cards */}
                {Object.keys(mcpServers).length === 0 && !isAddingServer ? (
                    <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 py-10 text-center">
                        <Plug className="h-8 w-8 text-terminal-muted mx-auto mb-2" />
                        <p className="font-mono text-sm text-terminal-muted">No servers added yet. Add one to get started.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {Object.entries(mcpServers).map(([name, config]) => {
                            const s = getStatusDisplay(name);
                            const StatusIcon = s.icon;
                            const isConnecting = connectingState[name];
                            const currentStatus = status.find(st => st.serverName === name);
                            const isEditing = editingServer === name;

                            if (isEditing) {
                                return (
                                    <MCPServerForm
                                        key={name}
                                        initialConfig={config}
                                        initialName={name}
                                        environment={environment}
                                        syncedFolders={syncedFolders}
                                        onSave={handleFormSave}
                                        onCancel={handleFormCancel}
                                        existingNames={Object.keys(mcpServers).filter(n => n !== name)}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={name}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-lg border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 shadow-sm hover:shadow-md transition-all",
                                        config.enabled === false
                                            ? "border-terminal-border/50 opacity-60"
                                            : "border-terminal-border"
                                    )}
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={cn("p-2 rounded-full", s.badge)}>
                                            <StatusIcon className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1">
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
                                                {/* Show header count for SSE servers */}
                                                {!config.command && config.headers && Object.keys(config.headers).length > 0 && (
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-blue-50 text-blue-700 border-blue-200">
                                                        {Object.keys(config.headers).length} header{Object.keys(config.headers).length > 1 ? 's' : ''}
                                                    </Badge>
                                                )}
                                            </div>

                                            {currentStatus?.lastError ? (
                                                <Alert variant="destructive" className="mt-2">
                                                    <AlertCircle className="h-4 w-4" />
                                                    <AlertTitle>Connection failed</AlertTitle>
                                                    <AlertDescription className="text-xs whitespace-pre-wrap font-mono">
                                                        {currentStatus.lastError}
                                                    </AlertDescription>
                                                </Alert>
                                            ) : (
                                                <div className="flex gap-4 mt-1">
                                                    <span className="font-mono text-xs text-terminal-muted truncate max-w-[300px]" title={config.command ? `${config.command} ${config.args?.join(" ")}` : config.url}>
                                                        {config.command ? `${config.command} ${config.args?.join(" ")}` : config.url}
                                                    </span>
                                                    {currentStatus?.connected && (
                                                        <span className="font-mono text-xs text-terminal-green">
                                                            {currentStatus.toolCount} active tools
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
                                            className="h-8 px-2"
                                            onClick={() => setEditingServer(name)}
                                            disabled={config.enabled === false}
                                        >
                                            <Edit2 className="h-4 w-4 text-terminal-muted hover:text-terminal-dark" />
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
                    Environment variables
                </h3>

                {/* 📁 Available Variables Section */}


                <div className="space-y-2">
                    {Object.keys(environment).length === 0 && (
                        <p className="font-mono text-xs text-terminal-muted italic">No environment variables yet.</p>
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
                            <Plus className="h-3 w-3 mr-2" /> Add variable
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
                            <span className="text-xs text-terminal-muted italic">Value (you can add it later)</span>
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
                    {showJsonMode ? "Hide advanced JSON" : "Show advanced JSON"}
                </Button>

                {showJsonMode && (
                    <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                        <Label>Raw JSON settings</Label>
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
                            }}>Apply JSON</Button>
                        </div>
                        <p className="text-xs text-terminal-muted">Top-level key must be &quot;mcpServers&quot;.</p>
                    </div>
                )}
            </div>

        </div>
    );
}
