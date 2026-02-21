"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink, GitBranch, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resilientFetch, resilientPost } from "@/lib/utils/resilient-fetch";
import type { WorkspaceSummary } from "@/lib/workspace/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkspaceDashboardProps {
  onNavigateToSession?: (sessionId: string, agentId?: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSED_COUNT = 3;

const STATUS_STYLES: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  active: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
  },
  "changes-ready": {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
  },
  "pr-open": {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
  },
  merged: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
  },
  "cleanup-pending": {
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-600",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RelativeTimeFn = (key: string, values?: Record<string, string | number | Date>) => string;

function formatRelativeTime(dateStr: string | undefined, t: RelativeTimeFn): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { n: days });
}

function formatBranch(branch?: string): string {
  if (!branch) return "unknown";
  return branch.replace(/^(feature|fix|chore|bugfix|hotfix)\//, "");
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceDashboard({ onNavigateToSession }: WorkspaceDashboardProps) {
  const t = useTranslations("workspace.dashboard");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);

  const getStatusLabel = useCallback((status: string): string => {
    const map: Record<string, string> = {
      active: t("statusActive"),
      "changes-ready": t("statusChangesReady"),
      "pr-open": t("statusPrOpen"),
      merged: t("statusMerged"),
      "cleanup-pending": t("statusCleanup"),
    };
    return map[status] ?? status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cleaningUp, setCleaningUp] = useState<Set<string>>(new Set());

  // ---- Fetch -----------------------------------------------------------

  const fetchWorkspaces = useCallback(async () => {
    try {
      const { data } = await resilientFetch<{ workspaces: WorkspaceSummary[] }>(
        "/api/workspaces",
      );
      setWorkspaces(data?.workspaces ?? []);
    } catch {
      // Silently ignore — dashboard is non-critical
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Re-fetch on custom event
  useEffect(() => {
    const handler = () => fetchWorkspaces();
    window.addEventListener("workspace-status-changed", handler);
    return () => window.removeEventListener("workspace-status-changed", handler);
  }, [fetchWorkspaces]);

  // ---- Actions ---------------------------------------------------------

  const handleCleanup = async (sessionId: string) => {
    setCleaningUp((prev) => new Set(prev).add(sessionId));
    try {
      const { error } = await resilientPost(`/api/sessions/${sessionId}/workspace`, {
        action: "cleanup",
      });
      if (error) throw new Error(error);
      toast.success(t("cleanedUp"));
      await fetchWorkspaces();
    } catch {
      toast.error(t("cleanupFailed"));
    } finally {
      setCleaningUp((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  // ---- Render ----------------------------------------------------------

  if (!loaded || workspaces.length === 0) return null;

  const visible = expanded ? workspaces : workspaces.slice(0, COLLAPSED_COUNT);
  const hasMore = workspaces.length > COLLAPSED_COUNT;

  return (
    <section className="mb-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="h-4 w-4 text-terminal-muted" />
        <h2 className="text-sm font-mono font-medium text-terminal-dark">
          {t("activeWorkspaces")}
        </h2>
        <Badge variant="outline" className="font-mono text-xs text-terminal-muted">
          {workspaces.length}
        </Badge>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence mode="popLayout">
          {visible.map((ws, i) => {
            const style = STATUS_STYLES[ws.status] ?? STATUS_STYLES.active;
            const isCleaning = cleaningUp.has(ws.sessionId);

            return (
              <motion.div
                key={ws.sessionId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  "border-terminal-border bg-terminal-cream/50",
                  "hover:border-terminal-dark/20 hover:shadow-sm",
                )}
              >
                {/* Top row: avatar + agent name + status badge */}
                <div className="flex items-center gap-2 mb-2">
                  {ws.agentAvatarUrl ? (
                    <img
                      src={ws.agentAvatarUrl}
                      alt={ws.agentName ?? "Agent"}
                      className="h-6 w-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-terminal-dark/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-mono font-medium text-terminal-dark">
                        {getInitials(ws.agentName)}
                      </span>
                    </div>
                  )}
                  <span className="text-xs font-mono font-medium text-terminal-dark truncate">
                    {ws.agentName ?? "Agent"}
                  </span>
                  <Badge
                    className={cn(
                      "ml-auto text-[10px] font-mono px-1.5 py-0 shrink-0",
                      style.bg,
                      style.border,
                      style.text,
                    )}
                    variant="outline"
                  >
                    {getStatusLabel(ws.status)}
                  </Badge>
                </div>

                {/* Branch */}
                <div className="flex items-center gap-1.5 mb-2">
                  <GitBranch className="h-3 w-3 text-terminal-muted shrink-0" />
                  <span className="text-xs font-mono text-terminal-muted truncate">
                    {formatBranch(ws.branch)}
                  </span>
                </div>

                {/* Info row: file count / PR info + age */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-terminal-muted">
                    {ws.prNumber
                      ? `PR #${ws.prNumber}${ws.prStatus ? ` (${ws.prStatus})` : ""}`
                      : ws.changedFiles != null
                        ? t("filesChanged", { count: ws.changedFiles })
                        : t("noChanges")}
                  </span>
                  {(ws.lastSyncedAt || ws.createdAt) && (
                    <span className="text-[10px] font-mono text-terminal-muted/70">
                      {formatRelativeTime(ws.lastSyncedAt ?? ws.createdAt, t)}
                    </span>
                  )}
                </div>

                {/* Action button */}
                <div className="flex justify-end">
                  {(ws.status === "merged" || ws.status === "cleanup-pending") ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-mono text-terminal-muted hover:text-red-600"
                      disabled={isCleaning}
                      onClick={() => handleCleanup(ws.sessionId)}
                    >
                      {isCleaning ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 mr-1" />
                      )}
                      {t("cleanup")}
                    </Button>
                  ) : ws.status === "pr-open" && ws.prUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-mono text-terminal-muted hover:text-blue-600"
                      asChild
                    >
                      <a href={ws.prUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {t("viewPR")}
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-mono text-terminal-green hover:text-terminal-green/80"
                      onClick={() => onNavigateToSession?.(ws.sessionId, ws.agentId)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {t("continue")}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Expand / collapse */}
      {hasMore && (
        <div className="flex justify-center mt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs font-mono text-terminal-muted"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                {t("showLess")}
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                {t("showAll", { count: workspaces.length })}
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
