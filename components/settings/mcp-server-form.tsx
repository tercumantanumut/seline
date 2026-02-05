/**
 * MCP Server Form Component
 * 
 * Reusable form for creating/editing MCP server configurations
 * with support for headers, environment variables, and validation
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Plus, X, Terminal, Globe, Info, AlertTriangle, Copy, Check,
    ChevronDown, ChevronUp, Eye, EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MCPServerConfig } from "@/lib/mcp/types";

interface MCPServerFormProps {
    initialConfig?: MCPServerConfig;
    initialName?: string;
    environment: Record<string, string>;
    syncedFolders: Array<{ folderPath: string; isPrimary: boolean }>;
    onSave: (name: string, config: MCPServerConfig) => Promise<void>;
    onCancel: () => void;
    existingNames?: string[];
}

export function MCPServerForm({
    initialConfig,
    initialName = "",
    environment,
    syncedFolders,
    onSave,
    onCancel,
    existingNames = [],
}: MCPServerFormProps) {
    // Basic fields
    const [serverName, setServerName] = useState(initialName);
    const [serverType, setServerType] = useState<"stdio" | "sse">(
        initialConfig?.command ? "stdio" : "sse"
    );

    // Stdio fields
    const [command, setCommand] = useState(initialConfig?.command || "");
    const [args, setArgs] = useState<string[]>(initialConfig?.args || []);
    const [newArg, setNewArg] = useState("");

    // SSE fields
    const [url, setUrl] = useState(initialConfig?.url || "");
    const [headers, setHeaders] = useState<Record<string, string>>(
        initialConfig?.headers || {}
    );
    const [newHeaderKey, setNewHeaderKey] = useState("");
    const [newHeaderValue, setNewHeaderValue] = useState("");
    const [showHeaderInput, setShowHeaderInput] = useState(false);

    // UI state
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showVariableHelper, setShowVariableHelper] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [copiedVar, setCopiedVar] = useState<string | null>(null);
    const [showHeaderValues, setShowHeaderValues] = useState<Record<string, boolean>>({});

    // Validation
    useEffect(() => {
        const newErrors: string[] = [];

        if (!serverName.trim()) {
            newErrors.push("Server name is required");
        } else if (
            existingNames.includes(serverName) &&
            serverName !== initialName
        ) {
            newErrors.push("Server name already exists");
        }

        if (serverType === "stdio") {
            if (!command.trim()) {
                newErrors.push("Command is required for stdio transport");
            }
        } else {
            if (!url.trim()) {
                newErrors.push("URL is required for SSE transport");
            } else {
                try {
                    new URL(url.replace(/\$\{[^}]+\}/g, "placeholder"));
                } catch {
                    newErrors.push("Invalid URL format");
                }
            }
        }

        setErrors(newErrors);
    }, [serverName, serverType, command, url, initialName, existingNames]);

    const handleAddArg = () => {
        if (newArg.trim()) {
            setArgs([...args, newArg.trim()]);
            setNewArg("");
        }
    };

    const handleRemoveArg = (index: number) => {
        setArgs(args.filter((_, i) => i !== index));
    };

    const handleAddHeader = () => {
        if (newHeaderKey.trim() && newHeaderValue.trim()) {
            setHeaders({ ...headers, [newHeaderKey.trim()]: newHeaderValue.trim() });
            setNewHeaderKey("");
            setNewHeaderValue("");
            setShowHeaderInput(false);
        }
    };

    const handleRemoveHeader = (key: string) => {
        const updated = { ...headers };
        delete updated[key];
        setHeaders(updated);
    };

    const copyVariable = (varName: string) => {
        navigator.clipboard.writeText(`\${${varName}}`);
        setCopiedVar(varName);
        setTimeout(() => setCopiedVar(null), 2000);
    };

    const insertVariable = (varName: string, target: "arg" | "url" | "header") => {
        const varSyntax = `\${${varName}}`;
        if (target === "arg") {
            setNewArg(newArg + varSyntax);
        } else if (target === "url") {
            setUrl(url + varSyntax);
        } else if (target === "header") {
            setNewHeaderValue(newHeaderValue + varSyntax);
        }
    };

    const resolveVariablePreview = (value: string): string => {
        return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            const resolved = environment[varName];
            if (!resolved) return `<${varName} not set>`;
            if (resolved.length > 20) {
                return `${resolved.slice(0, 8)}...${resolved.slice(-4)}`;
            }
            return resolved;
        });
    };

    const handleSubmit = async () => {
        if (errors.length > 0) return;

        setIsSaving(true);
        try {
            const config: MCPServerConfig = {};

            if (serverType === "stdio") {
                config.command = command;
                config.args = args;
            } else {
                config.url = url;
                config.type = "sse";
                if (Object.keys(headers).length > 0) {
                    config.headers = headers;
                }
            }

            await onSave(serverName, config);
        } catch (error) {
            console.error("Failed to save server:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 rounded-lg border border-terminal-green bg-terminal-green/5 p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="font-mono text-sm font-semibold text-terminal-dark">
                    {initialName ? "Edit Server" : "Add New Server"}
                </h4>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVariableHelper(!showVariableHelper)}
                    className="h-7 text-xs"
                >
                    <Info className="h-3 w-3 mr-1" />
                    Variables
                </Button>
            </div>

            {/* Variable Helper Panel */}
            {showVariableHelper && (
                <Alert className="bg-terminal-cream/60 border-terminal-border">
                    <Info className="h-4 w-4 text-terminal-green" />
                    <AlertDescription className="text-xs space-y-2">
                        <div className="font-semibold text-terminal-dark">
                            Available Environment Variables:
                        </div>
                        <div className="space-y-1">
                            {Object.keys(environment).length === 0 ? (
                                <p className="text-terminal-muted italic">
                                    No environment variables set. Add them in the Environment
                                    Variables section below.
                                </p>
                            ) : (
                                Object.keys(environment).map((key) => (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between gap-2 p-1.5 rounded bg-terminal-cream border border-terminal-border/30"
                                    >
                                        <code className="text-terminal-green font-mono text-[10px]">
                                            ${"{" + key + "}"}
                                        </code>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2"
                                            onClick={() => copyVariable(key)}
                                        >
                                            {copiedVar === key ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                                <Copy className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="text-[10px] text-terminal-muted pt-2 border-t">
                            <strong>Path Variables:</strong> Use{" "}
                            <code className="text-terminal-green">
                                ${"{SYNCED_FOLDER}"}
                            </code>
                            ,{" "}
                            <code className="text-terminal-green">
                                ${"{SYNCED_FOLDERS}"}
                            </code>
                            , or{" "}
                            <code className="text-terminal-green">
                                ${"{SYNCED_FOLDERS_ARRAY}"}
                            </code>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Basic Fields */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Server Name</Label>
                    <Input
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        placeholder="e.g. my-server"
                        className="font-mono"
                        disabled={!!initialName}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Transport Type</Label>
                    <div className="flex bg-white rounded-md border border-terminal-border p-1">
                        <button
                            onClick={() => setServerType("stdio")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-mono transition-colors",
                                serverType === "stdio"
                                    ? "bg-terminal-green text-white"
                                    : "hover:bg-gray-100"
                            )}
                        >
                            <Terminal className="h-3 w-3" /> Stdio
                        </button>
                        <button
                            onClick={() => setServerType("sse")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-mono transition-colors",
                                serverType === "sse"
                                    ? "bg-terminal-green text-white"
                                    : "hover:bg-gray-100"
                            )}
                        >
                            <Globe className="h-3 w-3" /> SSE
                        </button>
                    </div>
                </div>
            </div>

            {/* Stdio Configuration */}
            {serverType === "stdio" && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>Command</Label>
                        <Input
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="npx"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Arguments</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px] gap-1 px-2"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Insert Variable
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-2" align="end">
                                    <div className="space-y-1">
                                        <button
                                            onClick={() => insertVariable("SYNCED_FOLDER", "arg")}
                                            className="w-full text-left p-1.5 hover:bg-terminal-bg rounded text-xs transition-colors"
                                        >
                                            <code className="text-terminal-green font-bold">
                                                ${"{SYNCED_FOLDER}"}
                                            </code>
                                            <p className="text-[10px] text-terminal-muted">
                                                Primary synced folder
                                            </p>
                                        </button>
                                        <button
                                            onClick={() =>
                                                insertVariable("SYNCED_FOLDERS_ARRAY", "arg")
                                            }
                                            className="w-full text-left p-1.5 hover:bg-terminal-bg rounded text-xs transition-colors"
                                        >
                                            <code className="text-terminal-green font-bold">
                                                ${"{SYNCED_FOLDERS_ARRAY}"}
                                            </code>
                                            <p className="text-[10px] text-terminal-muted">
                                                All folders (expands to multiple args)
                                            </p>
                                        </button>
                                        {Object.keys(environment).length > 0 && (
                                            <>
                                                <div className="border-t my-1 pt-1">
                                                    <p className="text-[10px] text-terminal-muted px-1.5">
                                                        Environment Variables:
                                                    </p>
                                                </div>
                                                {Object.keys(environment).map((key) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => insertVariable(key, "arg")}
                                                        className="w-full text-left p-1.5 hover:bg-terminal-bg rounded text-xs transition-colors"
                                                    >
                                                        <code className="text-terminal-green font-mono">
                                                            ${"{" + key + "}"}
                                                        </code>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Existing args */}
                        {args.map((arg, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={arg}
                                    onChange={(e) => {
                                        const updated = [...args];
                                        updated[index] = e.target.value;
                                        setArgs(updated);
                                    }}
                                    className="font-mono text-xs"
                                />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => handleRemoveArg(index)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}

                        {/* Add new arg */}
                        <div className="flex items-center gap-2">
                            <Input
                                value={newArg}
                                onChange={(e) => setNewArg(e.target.value)}
                                placeholder="Add argument..."
                                className="font-mono text-xs"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleAddArg();
                                    }
                                }}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleAddArg}
                                className="shrink-0"
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* SSE Configuration */}
            {serverType === "sse" && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Server URL</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px] gap-1 px-2"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Insert Variable
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-2" align="end">
                                    <div className="space-y-1">
                                        {Object.keys(environment).map((key) => (
                                            <button
                                                key={key}
                                                onClick={() => insertVariable(key, "url")}
                                                className="w-full text-left p-1.5 hover:bg-terminal-bg rounded text-xs transition-colors"
                                            >
                                                <code className="text-terminal-green font-mono">
                                                    ${"{" + key + "}"}
                                                </code>
                                            </button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://api.example.com/sse"
                            className="font-mono text-xs"
                        />
                        {url && url.includes("${") && (
                            <div className="text-[10px] text-terminal-muted font-mono bg-terminal-bg/50 p-2 rounded">
                                <span className="font-semibold">Preview: </span>
                                {resolveVariablePreview(url)}
                            </div>
                        )}
                    </div>

                    {/* Headers Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs">
                                Request Headers{" "}
                                <span className="text-terminal-muted font-normal">
                                    (Optional)
                                </span>
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px] gap-1 px-2"
                                    >
                                        <Info className="h-3 w-3" />
                                        Examples
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-3" align="end">
                                    <div className="space-y-2 text-xs">
                                        <div>
                                            <div className="font-semibold text-terminal-dark mb-1">
                                                Bearer Token:
                                            </div>
                                            <code className="text-terminal-green text-[10px] bg-terminal-bg p-1 rounded">
                                                Authorization: Bearer ${"{YOUR_API_KEY}"}
                                            </code>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-terminal-dark mb-1">
                                                API Key Header:
                                            </div>
                                            <code className="text-terminal-green text-[10px] bg-terminal-bg p-1 rounded">
                                                X-API-Key: ${"{YOUR_API_KEY}"}
                                            </code>
                                        </div>
                                        <p className="text-terminal-muted pt-2 border-t text-[10px]">
                                            Use ${"{VAR_NAME}"} to reference environment variables
                                        </p>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Existing headers */}
                        {Object.entries(headers).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                                <Input
                                    value={key}
                                    disabled
                                    className="w-1/3 font-mono text-xs bg-gray-50"
                                />
                                <div className="flex-1 relative">
                                    <Input
                                        type={showHeaderValues[key] ? "text" : "password"}
                                        value={value}
                                        onChange={(e) =>
                                            setHeaders({ ...headers, [key]: e.target.value })
                                        }
                                        placeholder="Value or ${VAR}"
                                        className="font-mono text-xs pr-8"
                                    />
                                    <button
                                        onClick={() =>
                                            setShowHeaderValues({
                                                ...showHeaderValues,
                                                [key]: !showHeaderValues[key],
                                            })
                                        }
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-muted hover:text-terminal-dark"
                                    >
                                        {showHeaderValues[key] ? (
                                            <EyeOff className="h-3 w-3" />
                                        ) : (
                                            <Eye className="h-3 w-3" />
                                        )}
                                    </button>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => handleRemoveHeader(key)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}

                        {/* Add new header */}
                        {!showHeaderInput ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowHeaderInput(true)}
                                className="w-full"
                            >
                                <Plus className="h-3 w-3 mr-2" /> Add Header
                            </Button>
                        ) : (
                            <div className="space-y-2 p-3 bg-white rounded border border-terminal-border">
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={newHeaderKey}
                                        onChange={(e) => setNewHeaderKey(e.target.value)}
                                        placeholder="Header name (e.g. Authorization)"
                                        className="flex-1 font-mono text-xs"
                                        autoFocus
                                    />
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-2"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2" align="end">
                                            <div className="space-y-1">
                                                {Object.keys(environment).map((key) => (
                                                    <button
                                                        key={key}
                                                        onClick={() =>
                                                            insertVariable(key, "header")
                                                        }
                                                        className="w-full text-left p-1.5 hover:bg-terminal-bg rounded text-xs transition-colors"
                                                    >
                                                        <code className="text-terminal-green font-mono">
                                                            ${"{" + key + "}"}
                                                        </code>
                                                    </button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Input
                                    value={newHeaderValue}
                                    onChange={(e) => setNewHeaderValue(e.target.value)}
                                    placeholder="Bearer ${YOUR_API_KEY}"
                                    className="font-mono text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleAddHeader();
                                        }
                                    }}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setShowHeaderInput(false);
                                            setNewHeaderKey("");
                                            setNewHeaderValue("");
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleAddHeader}>
                                        Add
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Validation Errors */}
            {errors.length > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        <ul className="list-disc list-inside space-y-1">
                            {errors.map((error, i) => (
                                <li key={i}>{error}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-terminal-border">
                <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={errors.length > 0 || isSaving}>
                    {isSaving ? "Saving..." : "Save Server"}
                </Button>
            </div>
        </div>
    );
}
