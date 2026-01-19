"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Clock,
  Play,
  Pause,
  Pencil,
  Trash2,
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ExternalLink,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AnimatedCard } from "@/components/ui/animated-card";
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
    router.push(`/chat/${sessionId}`);
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

  return (
    <AnimatedCard
      className={cn(
        "bg-terminal-cream transition-all duration-500",
        isHighlighted && "ring-2 ring-terminal-green ring-offset-2 shadow-lg"
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold font-mono text-terminal-dark truncate">
                {schedule.name}
              </h3>
              <span
                className={cn(
                  "px-2 py-0.5 text-xs font-mono rounded",
                  schedule.enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                {schedule.enabled ? t("enabled") : t("disabled")}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 text-xs font-mono rounded",
                  schedule.priority === "high"
                    ? "bg-red-100 text-red-700"
                    : schedule.priority === "low"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                )}
              >
                {t(`priority.${schedule.priority}`)}
              </span>
            </div>
            {schedule.description && (
              <p className="text-sm font-mono text-terminal-muted mt-1 line-clamp-2">
                {schedule.description}
              </p>
            )}
          </div>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-terminal-green"
          />
        </div>

        {/* Schedule Info */}
        <div className="flex items-center gap-4 text-sm font-mono text-terminal-muted mb-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>{getScheduleDescription()}</span>
          </div>
          {schedule.timezone && schedule.timezone !== "UTC" && (
            <span className="flex items-center gap-1 text-xs">
              {isLocalTimezone && <Globe className="h-3 w-3 text-blue-500" />}
              ({getTimezoneDisplay()})
            </span>
          )}
        </div>

        {/* Prompt Preview */}
        <div className="bg-terminal-dark/5 rounded p-3 mb-3">
          <p className="text-sm font-mono text-terminal-dark line-clamp-2">
            {schedule.initialPrompt}
          </p>
        </div>

        {/* Last Run Status */}
        {lastRun && (
          <div className="flex items-center justify-between text-sm font-mono mb-3">
            <div className="flex items-center gap-2">
              {getStatusIcon(lastRun.status)}
              <span className="text-terminal-muted">
                {t("lastRun")}: {new Date(lastRun.createdAt).toLocaleString()}
              </span>
              {lastRun.durationMs && (
                <span className="text-xs text-terminal-muted/70">
                  ({formatDuration(lastRun.durationMs)})
                </span>
              )}
            </div>
            {lastRun.sessionId && (lastRun.status === "succeeded" || lastRun.status === "running") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleViewChat(lastRun.sessionId!)}
                className="gap-1.5 font-mono text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("viewChat")}
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-terminal-border">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTrigger}
              disabled={triggering}
              className="gap-1.5 font-mono"
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
                className="gap-1.5 font-mono text-terminal-muted"
              >
                {showHistory ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {t("history")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-dark"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 w-8 p-0 text-terminal-muted hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Run History */}
        {showHistory && recentRuns.length > 0 && (
          <div className="mt-3 pt-3 border-t border-terminal-border">
            <p className="text-xs font-mono text-terminal-muted mb-2">{t("recentRuns")}</p>
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
                          className="gap-1 font-mono text-blue-600 hover:text-blue-700 hover:bg-blue-100 h-6 px-2 text-xs"
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
    </AnimatedCard>
  );
}

