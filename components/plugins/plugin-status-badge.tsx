/**
 * Plugin Status Badge — Chat Header Indicator
 *
 * Shows a compact badge near the composer indicating how many plugins
 * are active for the current session. Clicking opens a popover with
 * quick enable/disable toggles and a link to full plugin settings.
 *
 * Step 9: Plugin Status Indicators in Chat
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plug,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface PluginSummary {
  id: string;
  name: string;
  version: string;
  status: "active" | "disabled" | "error";
  skillCount: number;
  hasHooks: boolean;
  hasMcp: boolean;
  lastError?: string;
}

export function PluginStatusBadge() {
  const t = useTranslations("plugins.chatBadge");
  const tPlugins = useTranslations("plugins");
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins");
      if (!res.ok) return;
      const data = await res.json();
      const mapped: PluginSummary[] = (data.plugins || []).map(
        (p: {
          id: string;
          name: string;
          version: string;
          status: string;
          lastError?: string;
          components: {
            skills?: { name: string }[];
            hooks?: unknown;
            mcpServers?: Record<string, unknown> | null;
          };
        }) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          status: p.status,
          skillCount: p.components?.skills?.length || 0,
          hasHooks: !!p.components?.hooks,
          hasMcp:
            !!p.components?.mcpServers &&
            Object.keys(p.components.mcpServers).length > 0,
          lastError: p.lastError,
        })
      );
      setPlugins(mapped);
    } catch {
      // Silent fail — badge is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeCount = plugins.filter((p) => p.status === "active").length;
  const errorCount = plugins.filter((p) => p.status === "error").length;
  const totalCount = plugins.length;

  // Don't render badge if no plugins installed
  if (!loading && totalCount === 0) return null;

  const togglePlugin = async (pluginId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    setToggling(pluginId);
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Plugin ${newStatus === "active" ? "enabled" : "disabled"}`);
      loadPlugins();
    } catch {
      toast.error("Failed to update plugin");
    } finally {
      setToggling(null);
    }
  };

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
                : errorCount > 0
                  ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                  : activeCount > 0
                    ? "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
                    : "text-terminal-muted/50 hover:text-terminal-muted hover:bg-terminal-dark/5"
            )}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plug className="size-4" />
            )}
            {/* Count badge */}
            {!loading && activeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-terminal-green text-[8px] font-bold text-white">
                {activeCount}
              </span>
            )}
            {/* Error indicator */}
            {!loading && errorCount > 0 && activeCount === 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                !
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          {loading
            ? t("loading")
            : activeCount > 0
              ? t("active", { count: activeCount })
              : t("noActive")}
        </TooltipContent>
      </Tooltip>

      {open && !loading && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-[320px] max-h-[400px] flex flex-col rounded-xl border border-terminal-border/60 bg-white shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-terminal-dark">
            <div className="flex items-center gap-2">
              <Plug className="size-3.5 text-terminal-green" />
              <span className="font-mono text-xs font-bold text-terminal-cream">
                {tPlugins("title")}
              </span>
              <Badge
                variant="secondary"
                className="font-mono text-[9px] px-1.5 py-0 h-4 bg-terminal-cream/10 text-terminal-cream/70"
              >
                {activeCount}/{totalCount}
              </Badge>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-terminal-cream/40 hover:text-terminal-cream hover:bg-white/10 transition-colors"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          {/* Plugin list */}
          <div className="flex-1 overflow-y-auto max-h-[280px]">
            {plugins.length === 0 ? (
              <div className="py-8 text-center">
                <Plug className="mx-auto size-6 text-terminal-muted/30 mb-2" />
                <p className="font-mono text-xs text-terminal-muted">
                  {t("noPlugins")}
                </p>
              </div>
            ) : (
              plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 border-b border-terminal-border/10 last:border-0",
                    plugin.status === "disabled" && "opacity-60",
                    plugin.status === "error" && "bg-red-50/50"
                  )}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {plugin.status === "active" && (
                      <CheckCircle className="size-3.5 text-terminal-green" />
                    )}
                    {plugin.status === "disabled" && (
                      <XCircle className="size-3.5 text-terminal-muted" />
                    )}
                    {plugin.status === "error" && (
                      <AlertTriangle className="size-3.5 text-amber-500" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-medium text-terminal-dark truncate">
                      {plugin.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[9px] text-terminal-muted">
                        v{plugin.version}
                      </span>
                      {plugin.skillCount > 0 && (
                        <span className="font-mono text-[9px] text-terminal-muted">
                          · {t("skillCount", { count: plugin.skillCount })}
                        </span>
                      )}
                      {plugin.hasHooks && (
                        <span className="font-mono text-[9px] text-terminal-green">
                          · {t("hooksLabel")}
                        </span>
                      )}
                      {plugin.hasMcp && (
                        <span className="font-mono text-[9px] text-blue-500">
                          · {t("mcpLabel")}
                        </span>
                      )}
                    </div>
                    {plugin.status === "error" && plugin.lastError && (
                      <p className="font-mono text-[9px] text-red-500 mt-0.5 truncate">
                        {plugin.lastError}
                      </p>
                    )}
                  </div>

                  {/* Toggle */}
                  <Switch
                    checked={plugin.status === "active"}
                    onCheckedChange={() =>
                      togglePlugin(plugin.id, plugin.status)
                    }
                    disabled={toggling === plugin.id}
                    className="shrink-0 scale-75 origin-right"
                  />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-terminal-border/20 px-3 py-2 bg-terminal-cream/60">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings?section=plugins");
              }}
              className="flex items-center gap-1.5 font-mono text-[10px] text-terminal-green hover:text-terminal-green/80 transition-colors"
            >
              <Settings className="size-3" />
              {t("managePlugins")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
