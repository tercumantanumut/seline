/**
 * Plugin Settings Component
 *
 * Displays installed plugins with status management (enable/disable/uninstall).
 * Also provides plugin import (zip upload) and marketplace management.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Plug,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  Package,
  Webhook,
  Server,
  FileCode,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  scope: string;
  status: "active" | "disabled" | "error";
  marketplaceName?: string;
  installedAt: string;
  updatedAt: string;
  lastError?: string;
  components: {
    skills: Array<{ name: string; description: string }>;
    agents: Array<{ name: string; description: string }>;
    hooks: { hooks: Record<string, unknown[]> } | null;
    mcpServers: Record<string, unknown> | null;
    lspServers: Record<string, unknown> | null;
  };
}

export function PluginSettings() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins");
      if (!res.ok) throw new Error("Failed to load plugins");
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (error) {
      console.error("[PluginSettings] Load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const togglePlugin = async (pluginId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update plugin");
      toast.success(`Plugin ${newStatus === "active" ? "enabled" : "disabled"}`);
      loadPlugins();
    } catch (error) {
      toast.error("Failed to update plugin status");
    }
  };

  const uninstallPlugin = async (pluginId: string, pluginName: string) => {
    if (!confirm(`Uninstall plugin "${pluginName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/plugins/${pluginId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to uninstall");
      toast.success(`Plugin "${pluginName}" uninstalled`);
      loadPlugins();
    } catch (error) {
      toast.error("Failed to uninstall plugin");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast.error("Only .zip plugin packages are supported");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/plugins/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      toast.success(`Plugin "${data.plugin?.name}" installed`, {
        description: `${data.components?.skills?.length || 0} skills, ${data.components?.agents?.length || 0} agents`,
      });

      loadPlugins();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Plugin import failed"
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const getComponentCounts = (plugin: InstalledPlugin) => {
    const counts: string[] = [];
    const skills = plugin.components.skills?.length || 0;
    const agents = plugin.components.agents?.length || 0;
    const hookEvents = plugin.components.hooks
      ? Object.keys(plugin.components.hooks.hooks || {}).length
      : 0;
    const mcpServers = plugin.components.mcpServers
      ? Object.keys(plugin.components.mcpServers).length
      : 0;

    if (skills > 0) counts.push(`${skills} skill${skills > 1 ? "s" : ""}`);
    if (agents > 0) counts.push(`${agents} agent${agents > 1 ? "s" : ""}`);
    if (hookEvents > 0) counts.push(`${hookEvents} hook event${hookEvents > 1 ? "s" : ""}`);
    if (mcpServers > 0) counts.push(`${mcpServers} MCP server${mcpServers > 1 ? "s" : ""}`);

    return counts;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-terminal-green" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-lg font-bold text-terminal-dark">
            Plugins
          </h2>
          <p className="font-mono text-sm text-terminal-muted">
            Extend your agent with skills, hooks, MCP servers, and more.
          </p>
        </div>
        <div>
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded px-4 py-2 font-mono text-sm",
              "bg-terminal-green text-white hover:bg-terminal-green/90 transition-colors",
              uploading && "pointer-events-none opacity-50"
            )}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading ? "Installing..." : "Install Plugin"}
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Empty state */}
      {plugins.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="size-12 text-terminal-muted/40" />
            <p className="mt-4 font-mono text-sm text-terminal-muted">
              No plugins installed
            </p>
            <p className="mt-1 font-mono text-xs text-terminal-muted/70">
              Upload a plugin .zip package to get started
            </p>
          </CardContent>
        </Card>
      )}

      {/* Plugin cards */}
      {plugins.map((plugin) => (
        <Card
          key={plugin.id}
          className={cn(
            "transition-all",
            plugin.status === "disabled" && "opacity-60",
            plugin.status === "error" && "border-red-300"
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Plug className="size-5 text-terminal-green" />
                <div>
                  <CardTitle className="font-mono text-base">
                    {plugin.name}
                    <span className="ml-2 font-normal text-terminal-muted">
                      v{plugin.version}
                    </span>
                  </CardTitle>
                  <p className="mt-0.5 font-mono text-xs text-terminal-muted">
                    {plugin.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={plugin.status === "active"}
                  onCheckedChange={() =>
                    togglePlugin(plugin.id, plugin.status)
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-red-500 hover:text-red-600"
                  onClick={() => uninstallPlugin(plugin.id, plugin.name)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={
                  plugin.status === "active"
                    ? "default"
                    : plugin.status === "error"
                      ? "destructive"
                      : "secondary"
                }
                className="font-mono text-[10px]"
              >
                {plugin.status === "active" && (
                  <CheckCircle className="mr-1 size-3" />
                )}
                {plugin.status === "error" && (
                  <XCircle className="mr-1 size-3" />
                )}
                {plugin.status}
              </Badge>

              <Badge variant="outline" className="font-mono text-[10px]">
                {plugin.scope}
              </Badge>

              {plugin.marketplaceName && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {plugin.marketplaceName}
                </Badge>
              )}
            </div>

            {/* Component summary */}
            {getComponentCounts(plugin).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-terminal-muted">
                {plugin.components.skills?.length > 0 && (
                  <span className="flex items-center gap-1">
                    <FileCode className="size-3" />
                    {plugin.components.skills.length} skill
                    {plugin.components.skills.length > 1 ? "s" : ""}
                  </span>
                )}
                {plugin.components.agents?.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Bot className="size-3" />
                    {plugin.components.agents.length} agent
                    {plugin.components.agents.length > 1 ? "s" : ""}
                  </span>
                )}
                {plugin.components.hooks && (
                  <span className="flex items-center gap-1">
                    <Webhook className="size-3" />
                    hooks
                  </span>
                )}
                {plugin.components.mcpServers && (
                  <span className="flex items-center gap-1">
                    <Server className="size-3" />
                    {Object.keys(plugin.components.mcpServers).length} MCP
                  </span>
                )}
              </div>
            )}

            {/* Error display */}
            {plugin.status === "error" && plugin.lastError && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="size-4" />
                <AlertTitle className="font-mono text-xs">Error</AlertTitle>
                <AlertDescription className="font-mono text-xs">
                  {plugin.lastError}
                </AlertDescription>
              </Alert>
            )}

            {/* Install date */}
            <p className="mt-3 font-mono text-[10px] text-terminal-muted/50">
              Installed{" "}
              {new Date(plugin.installedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
