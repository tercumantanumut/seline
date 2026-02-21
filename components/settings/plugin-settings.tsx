/**
 * Plugin Settings Component
 *
 * Displays installed plugins with status management (enable/disable/uninstall).
 * Expandable detail view shows skills, hooks, MCP servers, and metadata.
 * Also provides plugin import (zip upload) and marketplace management.
 *
 * Step 6: Plugin Detail View / Modal in Settings
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Shield,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MarketplaceBrowser } from "@/components/plugins/marketplace-browser";
import { useTranslations } from "next-intl";

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
  manifest: {
    author?: { name: string; email?: string };
    homepage?: string;
    repository?: string;
    license?: string;
    keywords?: string[];
    category?: string;
  };
  components: {
    skills: Array<{ name: string; namespacedName?: string; description: string }>;
    agents: Array<{ name: string; description: string }>;
    hooks: { hooks: Record<string, unknown[]> } | null;
    mcpServers: Record<string, unknown> | null;
    lspServers: Record<string, unknown> | null;
  };
}

interface CharacterOption {
  id: string;
  name: string;
  displayName?: string | null;
  status: string;
}

export function PluginSettings() {
  const t = useTranslations("plugins");
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [confirmInstallOpen, setConfirmInstallOpen] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [selectedTargetCharacterId, setSelectedTargetCharacterId] = useState<string>("");
  const directoryPickerProps = {
    webkitdirectory: "true",
    directory: "true",
  } as unknown as Record<string, string>;

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins");
      if (!res.ok) throw new Error("Failed to load plugins");
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (error) {
      console.error("[PluginSettings] Load error:", error);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    let cancelled = false;

    const loadCharacters = async () => {
      try {
        const res = await fetch("/api/characters");
        if (!res.ok) return;
        const data = await res.json();
        const activeCharacters: CharacterOption[] = (data.characters || []).filter(
          (character: CharacterOption) => character.status === "active"
        );
        if (cancelled) return;
        setCharacters(activeCharacters);
        if (activeCharacters.length > 0) {
          setSelectedTargetCharacterId((prev) => prev || activeCharacters[0].id);
        }
      } catch {
        // no-op
      }
    };

    loadCharacters();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlugin = async (pluginId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update plugin");
      toast.success(newStatus === "active" ? t("pluginEnabled") : t("pluginDisabled"));
      loadPlugins();
    } catch {
      toast.error(t("updateFailed"));
    }
  };

  const uninstallPlugin = async (pluginId: string, pluginName: string) => {
    if (!confirm(t("uninstallConfirm", { name: pluginName }))) return;

    try {
      const res = await fetch(`/api/plugins/${pluginId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to uninstall");
      toast.success(t("pluginUninstalled", { name: pluginName }));
      loadPlugins();
    } catch {
      toast.error(t("uninstallFailed"));
    }
  };

  const startInstallForFiles = (files: File[]) => {
    if (files.length === 0) return;
    if (characters.length === 0) {
      toast.error(t("requireAgentFirst"));
      return;
    }
    setPendingUploadFiles(files);
    setConfirmInstallOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    startInstallForFiles(files);
  };

  const installPendingPluginFiles = async () => {
    if (pendingUploadFiles.length === 0) return;
    if (!selectedTargetCharacterId) {
      toast.error(t("selectAgentFirst"));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("characterId", selectedTargetCharacterId);
      if (pendingUploadFiles.length === 1) {
        formData.append("file", pendingUploadFiles[0]);
      } else {
        for (const file of pendingUploadFiles) {
          formData.append("files", file, file.webkitRelativePath || file.name);
        }
      }

      const res = await fetch("/api/plugins/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const createdAgents = Array.isArray(data.createdAgents) ? data.createdAgents.length : 0;
      const auxCount: number = data.auxiliaryFiles?.count ?? 0;
      const descriptionParts = [
        `${data.components?.skills?.length || 0} skills`,
        `${data.components?.agents?.length || 0} agents`,
      ];
      if (createdAgents > 0) {
        descriptionParts.push(`${createdAgents} agent records created`);
      }
      if (data.workflow) {
        descriptionParts.push(`workflow created with ${(data.workflow.subAgentIds?.length || 0) + 1} agents`);
      }
      if (auxCount > 0) {
        descriptionParts.push(`${auxCount} reference file${auxCount !== 1 ? "s" : ""} linked to workspace`);
      }

      toast.success(t("pluginInstalled", { name: data.plugin?.name ?? "" }), {
        description: descriptionParts.join(", "),
        ...(data.workflow
          ? { action: { label: t("viewAgents"), onClick: () => window.location.assign("/") } }
          : {}),
      });

      if (data.auxiliaryFiles?.workspaceRegistered) {
        toast.info(t("workspaceRegistered"), {
          description: t("workspaceRegisteredDesc"),
        });
      }

      setConfirmInstallOpen(false);
      setPendingUploadFiles([]);
      loadPlugins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importFailed"));
    } finally {
      setUploading(false);
    }
  };

  const toggleExpanded = (pluginId: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
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
            Add new capabilities to your agent with installable plugins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => setShowMarketplace(!showMarketplace)}
          >
            <Globe className="mr-1.5 size-3.5" />
            {showMarketplace ? t("hideMarketplace") : t("browseMarketplace")}
          </Button>
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
            {uploading ? t("installing") : t("install")}
            <input
              type="file"
              accept=".zip,.md,.mds"
              multiple
              // Enables folder-drop style imports while preserving subpaths in file names.
              {...directoryPickerProps}
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Marketplace Browser */}
      {showMarketplace && (
        <MarketplaceBrowser onInstallComplete={loadPlugins} />
      )}

      <Dialog
        open={confirmInstallOpen}
        onOpenChange={(open) => {
          setConfirmInstallOpen(open);
          if (!open && !uploading) {
            setPendingUploadFiles([]);
          }
        }}
      >
        <DialogContent className="bg-terminal-cream sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-terminal-dark">
              Confirm plugin install
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              Choose the main agent for this plugin. Imported sub-agents, tools, and shared folders will be linked to that workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded border border-terminal-border/50 bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-3">
              <p className="font-mono text-xs text-terminal-muted uppercase tracking-wider">
                Files
              </p>
              <p className="mt-1 font-mono text-sm text-terminal-dark">
                {pendingUploadFiles.length} file{pendingUploadFiles.length === 1 ? "" : "s"} selected
              </p>
              <p className="mt-1 line-clamp-2 font-mono text-xs text-terminal-muted">
                {pendingUploadFiles.slice(0, 2).map((file) => file.name).join(", ")}
                {pendingUploadFiles.length > 2 ? ` +${pendingUploadFiles.length - 2} more` : ""}
              </p>
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs text-terminal-muted uppercase tracking-wider">
                Main agent
              </label>
              <select
                value={selectedTargetCharacterId}
                onChange={(event) => setSelectedTargetCharacterId(event.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                disabled={uploading}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.displayName || character.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="font-mono"
              onClick={() => {
                setConfirmInstallOpen(false);
                setPendingUploadFiles([]);
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              className="font-mono bg-terminal-green text-white hover:bg-terminal-green/90"
              onClick={installPendingPluginFiles}
              disabled={uploading || pendingUploadFiles.length === 0 || !selectedTargetCharacterId}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Installing...
                </>
              ) : (
                "Install and assign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty state */}
      {plugins.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="size-12 text-terminal-muted/40" />
            <p className="mt-4 font-mono text-sm text-terminal-muted">
              No plugins yet
            </p>
            <p className="mt-1 font-mono text-xs text-terminal-muted/70">
              Upload a plugin package or install one from the marketplace
            </p>
          </CardContent>
        </Card>
      )}

      {/* Plugin cards */}
      {plugins.map((plugin) => {
        const isExpanded = expandedPlugins.has(plugin.id);

        return (
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
                  <button
                    onClick={() => toggleExpanded(plugin.id)}
                    className="flex items-center gap-2 text-left"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? t("collapsePlugin", { name: plugin.name }) : t("expandPlugin", { name: plugin.name })}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-terminal-muted shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 text-terminal-muted shrink-0" />
                    )}
                    <Plug className="size-5 text-terminal-green shrink-0" />
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
                  </button>
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
                    aria-label={t("uninstallPluginLabel", { name: plugin.name })}
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

                {plugin.manifest?.license && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    <Shield className="mr-1 size-2.5" />
                    {plugin.manifest.license}
                  </Badge>
                )}

                {plugin.manifest?.category && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {plugin.manifest.category}
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
                  <AlertTitle className="font-mono text-xs">{t("errorTitle")}</AlertTitle>
                  <AlertDescription className="font-mono text-xs">
                    {plugin.lastError}
                  </AlertDescription>
                </Alert>
              )}

              {/* ── Expanded Detail View ── */}
              {isExpanded && (
                <div className="mt-4 space-y-4 border-t border-terminal-border/20 pt-4">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-3">
                    {plugin.manifest?.author && (
                      <div className="flex items-start gap-2">
                        <Info className="size-3 text-terminal-muted mt-0.5 shrink-0" />
                        <div>
                          <p className="font-mono text-[10px] text-terminal-muted uppercase tracking-wider">{t("author")}</p>
                          <p className="font-mono text-xs text-terminal-dark">
                            {plugin.manifest.author.name}
                            {plugin.manifest.author.email && (
                              <span className="text-terminal-muted ml-1">
                                ({plugin.manifest.author.email})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <Clock className="size-3 text-terminal-muted mt-0.5 shrink-0" />
                      <div>
                        <p className="font-mono text-[10px] text-terminal-muted uppercase tracking-wider">{t("installedLabel")}</p>
                        <p className="font-mono text-xs text-terminal-dark">
                          {new Date(plugin.installedAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Links */}
                  {(plugin.manifest?.homepage || plugin.manifest?.repository) && (
                    <div className="flex flex-wrap gap-2">
                      {plugin.manifest.homepage && (
                        <a
                          href={plugin.manifest.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-terminal-green hover:underline"
                        >
                          <Globe className="size-3" />
                          Homepage
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      {plugin.manifest.repository && (
                        <a
                          href={plugin.manifest.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-terminal-green hover:underline"
                        >
                          <FileCode className="size-3" />
                          Source
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Keywords */}
                  {plugin.manifest?.keywords && plugin.manifest.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {plugin.manifest.keywords.map((kw) => (
                        <Badge
                          key={kw}
                          variant="outline"
                          className="font-mono text-[9px] px-1.5 py-0"
                        >
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Skills list */}
                  {plugin.components.skills?.length > 0 && (
                    <div>
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-terminal-dark mb-2">
                        <FileCode className="size-3.5" />
                        Skills ({plugin.components.skills.length})
                      </h4>
                      <div className="space-y-1.5 pl-5">
                        {plugin.components.skills.map((skill) => (
                          <div key={skill.name} className="flex items-start gap-2">
                            <span className="font-mono text-xs font-medium text-terminal-green shrink-0">
                              /{skill.namespacedName || skill.name}
                            </span>
                            {skill.description && (
                              <span className="font-mono text-xs text-terminal-muted">
                                — {skill.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agents list */}
                  {plugin.components.agents?.length > 0 && (
                    <div>
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-terminal-dark mb-2">
                        <Bot className="size-3.5" />
                        Agents ({plugin.components.agents.length})
                      </h4>
                      <div className="space-y-1.5 pl-5">
                        {plugin.components.agents.map((agent) => (
                          <div key={agent.name} className="flex items-start gap-2">
                            <span className="font-mono text-xs font-medium text-terminal-dark">
                              {agent.name}
                            </span>
                            {agent.description && (
                              <span className="font-mono text-xs text-terminal-muted">
                                — {agent.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hooks detail */}
                  {plugin.components.hooks && (
                    <div>
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-terminal-dark mb-2">
                        <Webhook className="size-3.5" />
                        Automation hooks
                      </h4>
                      <div className="space-y-1 pl-5">
                        {Object.entries(plugin.components.hooks.hooks || {}).map(
                          ([event, entries]) => (
                            <div key={event} className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="font-mono text-[9px] px-1.5 py-0"
                              >
                                {event}
                              </Badge>
                              <span className="font-mono text-[10px] text-terminal-muted">
                                {Array.isArray(entries) ? entries.length : 0} handler
                                {Array.isArray(entries) && entries.length > 1 ? "s" : ""}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* MCP Servers detail */}
                  {plugin.components.mcpServers && (
                    <div>
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-terminal-dark mb-2">
                        <Server className="size-3.5" />
                        Tool servers ({Object.keys(plugin.components.mcpServers).length})
                      </h4>
                      <div className="space-y-1 pl-5">
                        {Object.keys(plugin.components.mcpServers).map((name) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="font-mono text-xs text-terminal-dark">
                              {name}
                            </span>
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px] px-1.5 py-0 text-terminal-green"
                            >
                              connected
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LSP Servers detail */}
                  {plugin.components.lspServers && (
                    <div>
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-terminal-dark mb-2">
                        <Server className="size-3.5" />
                        Language servers ({Object.keys(plugin.components.lspServers).length})
                      </h4>
                      <div className="space-y-1 pl-5">
                        {Object.keys(plugin.components.lspServers).map((name) => (
                          <span key={name} className="font-mono text-xs text-terminal-dark block">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Install date (compact, when not expanded) */}
              {!isExpanded && (
                <p className="mt-3 font-mono text-[10px] text-terminal-muted/50">
                  Installed{" "}
                  {new Date(plugin.installedAt).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
