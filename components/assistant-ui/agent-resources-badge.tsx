"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Blocks,
  Loader2,
  Settings,
  Wrench,
  Plug,
  Puzzle,
  Workflow,
  Database,
  Link,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCharacter } from "./character-context";
import { useTranslations } from "next-intl";

interface PluginSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "active" | "disabled" | "error";
  enabledForAgent: boolean;
  skillCount: number;
  hookHandlerCount: number;
  hasMcp: boolean;
}

interface AgentResourcePayload {
  resources: {
    skills: { count: number };
    tools: { enabledCount: number };
    mcp: { enabledToolCount: number; pluginServerCount: number };
    plugins: {
      totalCount: number;
      enabledCount: number;
      skillCount: number;
      hookHandlerCount: number;
    };
    workflows: {
      customComfyUIWorkflowCount: number;
      active: {
        id: string;
        name: string;
        role: "initiator" | "subagent";
        sharedPluginCount: number;
        sharedFolderCount: number;
        sharedHookCount: number;
        sharedMcpServerCount: number;
      } | null;
    };
  };
  plugins: PluginSummary[];
}

export function AgentResourcesBadge() {
  const t = useTranslations("plugins.chatBadge");
  const tPlugins = useTranslations("plugins");
  const tPicker = useTranslations("picker");
  const { character } = useCharacter();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [data, setData] = useState<AgentResourcePayload | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const loadResources = useCallback(async () => {
    if (!character?.id || character.id === "default") {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/characters/${character.id}/resources`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as AgentResourcePayload;
      setData(payload);
    } catch {
      // Non-critical indicator; fail silently.
    } finally {
      setLoading(false);
    }
  }, [character?.id]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pluginRows = data?.plugins || [];
  const pluginEnabledCount = data?.resources.plugins.enabledCount || 0;
  const hasErrorPlugin = pluginRows.some((plugin) => plugin.status === "error");

  if (!loading && !data) {
    return null;
  }

  const togglePlugin = async (plugin: PluginSummary, enabled: boolean) => {
    if (!character?.id || character.id === "default") return;
    setToggling(plugin.id);

    try {
      const response = await fetch(`/api/characters/${character.id}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId: plugin.id, enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update plugin assignment");
      }

      toast.success(enabled ? tPlugins("pluginEnabled") : tPlugins("pluginDisabled"));
      await loadResources();
    } catch {
      toast.error(tPlugins("updateFailed"));
    } finally {
      setToggling(null);
    }
  };

  const summary = data?.resources;
  const itemCount = [
    summary?.skills.count || 0,
    summary?.tools.enabledCount || 0,
    summary?.plugins.enabledCount || 0,
    summary?.plugins.hookHandlerCount || 0,
    summary?.workflows.customComfyUIWorkflowCount || 0,
    summary?.mcp.enabledToolCount || 0,
  ].filter((value) => value > 0).length;

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            className={cn(
              "size-8 relative",
              open
                ? "text-terminal-green bg-terminal-green/10"
                : hasErrorPlugin
                  ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                  : itemCount > 0
                    ? "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
                    : "text-terminal-muted/50 hover:text-terminal-muted hover:bg-terminal-dark/5"
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Blocks className="size-4" />}
            {!loading && itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-terminal-green text-[8px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          {loading
            ? t("loading")
            : t("active", { count: pluginEnabledCount })}
        </TooltipContent>
      </Tooltip>

      {open && !loading && summary && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-[360px] max-h-[440px] flex flex-col rounded-xl border border-terminal-border/60 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 bg-terminal-dark">
            <div className="flex items-center gap-2">
              <Blocks className="size-3.5 text-terminal-green" />
              <span className="font-mono text-xs font-bold text-terminal-cream">{t("resourceStatus")}</span>
              <Badge
                variant="secondary"
                className="font-mono text-[9px] px-1.5 py-0 h-4 bg-terminal-cream/10 text-terminal-cream/70"
              >
                {itemCount}
              </Badge>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-terminal-cream/40 hover:text-terminal-cream hover:bg-white/10 transition-colors"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          <div className="border-b border-terminal-border/20 px-3 py-2 space-y-2 bg-terminal-cream/40">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Puzzle className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("skills")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">{summary.skills.count}</p>
              </div>
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Wrench className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("tools")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">{summary.tools.enabledCount}</p>
              </div>
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Plug className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("pluginsShort")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">
                  {summary.plugins.enabledCount}/{summary.plugins.totalCount}
                </p>
              </div>
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Link className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("hooks")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">{summary.plugins.hookHandlerCount}</p>
              </div>
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Workflow className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("workflows")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">{summary.workflows.customComfyUIWorkflowCount}</p>
              </div>
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <div className="flex items-center gap-1 text-terminal-muted">
                  <Database className="size-3" />
                  <span className="font-mono text-[10px] uppercase">{t("mcp")}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-terminal-dark">{summary.mcp.enabledToolCount}</p>
              </div>
            </div>

            {summary.workflows.active && (
              <div className="rounded border border-terminal-border/40 bg-white p-2">
                <p className="font-mono text-[10px] text-terminal-muted uppercase">{t("workflowActive")}</p>
                <p className="font-mono text-xs text-terminal-dark mt-1">{summary.workflows.active.name}</p>
                <p className="font-mono text-[10px] text-terminal-muted mt-0.5">
                  {summary.workflows.active.role === "initiator"
                    ? tPicker("workflows.initiator")
                    : tPicker("workflows.subagent")}
                  {" · "}
                  {t("sharedPlugins", { count: summary.workflows.active.sharedPluginCount })}
                  {" · "}
                  {t("sharedFolders", { count: summary.workflows.active.sharedFolderCount })}
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[210px]">
            {pluginRows.length === 0 ? (
              <div className="py-6 text-center font-mono text-xs text-terminal-muted">{t("noPlugins")}</div>
            ) : (
              pluginRows.map((plugin) => (
                <div key={plugin.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-terminal-border/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-medium text-terminal-dark truncate">{plugin.name}</p>
                    <p className="font-mono text-[9px] text-terminal-muted">
                      v{plugin.version}
                      {plugin.skillCount > 0 ? ` · ${t("skillCount", { count: plugin.skillCount })}` : ""}
                      {plugin.hookHandlerCount > 0 ? ` · ${t("hooksCount", { count: plugin.hookHandlerCount })}` : ""}
                      {plugin.hasMcp ? ` · ${t("mcpLabel")}` : ""}
                    </p>
                  </div>
                  <Switch
                    checked={plugin.enabledForAgent}
                    onCheckedChange={(checked) => void togglePlugin(plugin, checked)}
                    disabled={toggling === plugin.id}
                    className="shrink-0 scale-75 origin-right"
                  />
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-terminal-border/20 px-3 py-2 bg-terminal-cream/60">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/");
              }}
              className="flex items-center gap-1.5 font-mono text-[10px] text-terminal-green hover:text-terminal-green/80 transition-colors"
            >
              <Settings className="size-3" />
              {t("manageAgents")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
