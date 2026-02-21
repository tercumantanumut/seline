"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Clock,
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ExternalLink,
  Globe,
  Pencil,
  Trash2,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { parseTimezoneValue, formatTimezoneDisplay } from "@/lib/hooks/use-local-timezone";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";

interface ScheduleRun {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  sessionId?: string;
  resultSummary?: string;
  durationMs?: number;
}

interface ScheduleCardProps {
  schedule: ScheduledTask & { runs?: ScheduleRun[] };
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  onToggle: (enabled: boolean) => void;
  isHighlighted?: boolean;
  highlightRunId?: string;
  expandHistory?: boolean;
}

export function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onTrigger,
  onToggle,
  isHighlighted = false,
  highlightRunId,
  expandHistory = false,
}: ScheduleCardProps) {
  const t = useTranslations("schedules.card");
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(expandHistory);
  const [triggering, setTriggering] = useState(false);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await onTrigger();
    } finally {
      setTriggering(false);
    }
  };

  const handleViewChat = (sessionId: string) => {
    router.push(`/chat/${schedule.characterId}?sessionId=${sessionId}`);
  };

  const getScheduleDescription = () => {
    switch (schedule.scheduleType) {
      case "cron":
        return schedule.cronExpression || t("cronDefault");
      case "interval":
        return t("intervalMinutes", { minutes: schedule.intervalMinutes ?? 60 });
      case "once":
        return schedule.scheduledAt
          ? new Date(schedule.scheduledAt).toLocaleString()
          : t("onceDefault");
      default:
        return schedule.scheduleType;
    }
  };

  const getTimezoneDisplay = () => {
    if (!schedule.timezone || schedule.timezone === "UTC") {
      return "UTC";
    }
    const { isLocal, timezone } = parseTimezoneValue(schedule.timezone);
    const display = formatTimezoneDisplay(timezone);
    return isLocal ? display : timezone;
  };

  const isLocalTimezone = schedule.timezone?.startsWith("local::");

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "succeeded":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "queued":
      case "pending":
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-terminal-muted" />;
    }
  };

  const lastRun = schedule.runs?.[0];
  const recentRuns = schedule.runs?.slice(0, 5) || [];
  const isInactive = !schedule.enabled;

  return (
    <div
      className={cn(
        "group bg-terminal-cream rounded-lg border border-terminal-border/30 hover:border-terminal-green/50 transition-all duration-200 overflow-hidden",
        isHighlighted && "ring-2 ring-terminal-green ring-offset-2 shadow-lg",
        isInactive && "opacity-75"
      )}
    >
      {/* Main Content */}
      <div className="p-6">
        {/* Header: Title + Badges + Toggle */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3
              className={cn(
                "text-lg font-semibold font-mono tracking-tight",
                isInactive ? "text-terminal-muted" : "text-terminal-dark"
              )}
            >
              {schedule.name}
            </h3>
            {schedule.status === "draft" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                {t("draft")}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono",
                schedule.enabled
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              )}
            >
              {schedule.enabled ? t("enabled") : t("disabled")}
            </span>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border border-terminal-border/30",
                schedule.priority === "high"
                  ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                  : schedule.priority === "low"
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              )}
            >
              {t(`priority.${schedule.priority}`)}
            </span>
          </div>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-terminal-green"
          />
        </div>

        {/* Description */}
        {schedule.description && (
          <p
            className={cn(
              "text-sm mb-4",
              isInactive ? "text-terminal-muted/70" : "text-terminal-muted"
            )}
          >
            {schedule.description}
          </p>
        )}

        {/* Schedule Info */}
        <div
          className={cn(
            "flex items-center gap-2 text-xs font-mono mb-4",
            isInactive ? "text-terminal-muted/60" : "text-terminal-muted"
          )}
        >
          <Clock className="h-4 w-4" />
          <span>{getScheduleDescription()}</span>
          {schedule.timezone && schedule.timezone !== "UTC" && (
            <>
              {isLocalTimezone && <Globe className="h-3 w-3 text-blue-500 ml-2" />}
              <span>({getTimezoneDisplay()})</span>
            </>
          )}
        </div>

        {/* Code Block - Prompt Preview */}
        <div
          className={cn(
            "bg-terminal-dark/5 dark:bg-terminal-dark/20 rounded-md p-3 mb-4 border border-terminal-border/20 overflow-x-auto custom-code-scrollbar",
            isInactive && "opacity-70"
          )}
        >
          <code
            className={cn(
              "text-xs font-mono whitespace-pre-wrap break-words line-clamp-3",
              isInactive ? "text-terminal-muted" : "text-terminal-dark dark:text-terminal-text"
            )}
          >
            {schedule.initialPrompt}
          </code>
        </div>

        {/* Last Run Status */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-terminal-border/20">
          <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
            {lastRun ? (
              <>
                {getStatusIcon(lastRun.status)}
                <span>
                  {t("lastRun")}: {new Date(lastRun.createdAt).toLocaleString()}
                </span>
                {lastRun.durationMs && (
                  <span className="text-terminal-muted/70">
                    ({formatDuration(lastRun.durationMs)})
                  </span>
                )}
              </>
            ) : (
              <>
                <History className="h-4 w-4 text-terminal-muted/50" />
                <span className="text-terminal-muted/70">{t("neverRun")}</span>
              </>
            )}
          </div>
          {lastRun?.sessionId && (lastRun.status === "succeeded" || lastRun.status === "running") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewChat(lastRun.sessionId!)}
              className="gap-1.5 font-mono text-terminal-green hover:text-terminal-green/80 hover:bg-terminal-green/10 h-7 px-2 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("viewChat")}
            </Button>
          )}
        </div>
      </div>

      {/* Footer Action Bar */}
      <div className="bg-terminal-cream-dark/30 dark:bg-terminal-dark/10 px-6 py-2 border-t border-terminal-border/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={triggering || isInactive}
            className={cn(
              "gap-1.5 font-mono text-xs h-8",
              isInactive && "opacity-50 cursor-not-allowed"
            )}
          >
            {triggering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            {t("runNow")}
          </Button>
          {recentRuns.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-1.5 font-mono text-xs h-8 text-terminal-muted hover:text-terminal-dark"
            >
              <History className="h-3.5 w-3.5" />
              {t("history")}
              {showHistory ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={t("editSchedule")}
            className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={t("deleteSchedule")}
            className="h-8 w-8 p-0 text-terminal-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Run History (Expandable) */}
      {showHistory && recentRuns.length > 0 && (
        <div className="px-6 py-4 border-t border-terminal-border/20 bg-terminal-cream/50">
          <p className="text-xs font-mono text-terminal-muted mb-3">{t("recentRuns")}</p>
          <div className="space-y-2">
            {recentRuns.map((run) => {
              const isRunHighlighted = highlightRunId === run.id;
              return (
                <div
                  key={run.id}
                  className={cn(
                    "flex flex-col gap-1 p-2 rounded-md transition-colors",
                    isRunHighlighted
                      ? "bg-terminal-green/20 ring-1 ring-terminal-green"
                      : "bg-terminal-dark/5 hover:bg-terminal-dark/10"
                  )}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <span className="text-terminal-muted">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                      {run.durationMs && (
                        <span className="text-terminal-muted/70">
                          ({formatDuration(run.durationMs)})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {run.error && (
                        <span className="text-red-500 truncate max-w-[150px]" title={run.error}>
                          {run.error}
                        </span>
                      )}
                      {run.sessionId && (run.status === "succeeded" || run.status === "running") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewChat(run.sessionId!)}
                          className="gap-1 font-mono text-terminal-green hover:text-terminal-green/80 hover:bg-terminal-green/10 h-6 px-2 text-xs"
                        >
                          <MessageSquare className="h-3 w-3" />
                          {t("viewChat")}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Show result summary if available */}
                  {run.resultSummary && run.status === "succeeded" && (
                    <p className="text-xs font-mono text-terminal-muted/80 line-clamp-2 pl-6">
                      {run.resultSummary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
