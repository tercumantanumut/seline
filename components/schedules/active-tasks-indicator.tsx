/**
 * Active Tasks Indicator
 *
 * Header component showing currently running background tasks.
 * Displays live activity labels from session progress events.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Clock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  Sparkles,
  Workflow,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useActiveTaskCount, useActiveTasks } from "@/lib/stores/unified-tasks-store";
import {
  useSessionActivity,
  useSessionSyncStore,
  type SessionActivityIndicator,
  type SessionActivityKind,
} from "@/lib/stores/session-sync-store";
import type { UnifiedTask } from "@/lib/background-tasks/types";
import { cn } from "@/lib/utils";

function indicatorIcon(kind: SessionActivityKind) {
  if (kind === "tool") return Wrench;
  if (kind === "hook") return Sparkles;
  if (kind === "skill") return Sparkles;
  if (kind === "delegation") return Workflow;
  if (kind === "workspace") return GitBranch;
  if (kind === "pr") return GitPullRequest;
  if (kind === "error") return XCircle;
  return Loader2;
}

function TaskRow({
  task,
  onNavigate,
}: {
  task: UnifiedTask;
  onNavigate: (url: string) => void;
}) {
  const t = useTranslations("schedules.notifications");
  const activity = useSessionActivity(task.sessionId);
  const primaryIndicator = activity?.indicators?.[0];

  const fallbackTitle =
    task.type === "scheduled"
      ? task.taskName
      : task.type === "chat"
        ? t("chatRun")
        : t("channelTask", { channelType: task.channelType });

  const subtitle =
    task.type === "channel"
      ? task.peerName || task.peerId
      : task.type === "scheduled"
        ? task.taskId
        : task.pipelineName;

  const formatTimeAgo = (startedAt: string) => {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  const label = primaryIndicator?.label ?? fallbackTitle;
  const Icon = primaryIndicator ? indicatorIcon(primaryIndicator.kind) : Clock;
  const shouldSpin = primaryIndicator && (
    primaryIndicator.kind === "run" || primaryIndicator.kind === "tool" || primaryIndicator.kind === "workspace"
  );

  return (
    <div className="p-3 border-b border-terminal-green/10 last:border-0 hover:bg-terminal-green/5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("h-3.5 w-3.5 shrink-0 text-terminal-green", shouldSpin && "animate-spin")} />
            <p className="font-mono text-sm font-medium text-terminal-dark truncate">
              {label}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-terminal-muted font-mono">
            <Clock className="h-3 w-3" />
            <span>{t("startedAgo", { time: formatTimeAgo(task.startedAt) })}</span>
            {subtitle ? <span className="truncate">· {subtitle}</span> : null}
          </div>
        </div>

        {task.sessionId && task.characterId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-mono text-terminal-green hover:text-terminal-green/80"
            onClick={() => onNavigate(`/chat/${task.characterId}?sessionId=${task.sessionId}`)}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            {t("viewTask")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Pick the freshest activity label across all active tasks. */
function useLatestActivityLabel(tasks: UnifiedTask[]): SessionActivityIndicator | null {
  const sessionActivityById = useSessionSyncStore((s) => s.sessionActivityById);

  let best: { indicator: SessionActivityIndicator; updatedAt: number } | null = null;
  for (const task of tasks) {
    if (!task.sessionId) continue;
    const activity = sessionActivityById.get(task.sessionId);
    if (!activity?.indicators?.length) continue;
    const updatedAt = activity.updatedAt ?? 0;
    if (!best || updatedAt > best.updatedAt) {
      best = { indicator: activity.indicators[0], updatedAt };
    }
  }
  return best?.indicator ?? null;
}

export function ActiveTasksIndicator() {
  const t = useTranslations("schedules.notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = useActiveTaskCount();
  const tasks = useActiveTasks();
  const latestIndicator = useLatestActivityLabel(tasks);

  // Don't render if no active tasks
  if (count === 0) {
    return null;
  }

  const triggerLabel = latestIndicator?.label ?? t("activeTasks", { count });

  const handleNavigate = (url: string) => {
    router.push(url);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative gap-2 font-mono text-sm overflow-hidden",
            "text-terminal-green hover:text-terminal-green/80",
            "hover:bg-terminal-green/10"
          )}
        >
          {/* Live activity label with text-shine sweep */}
          <span className="relative truncate max-w-[180px] animate-text-shine bg-[length:200%_100%] bg-clip-text bg-gradient-to-r from-terminal-green via-[hsl(var(--terminal-green)/0.4)] to-terminal-green">
            {triggerLabel}
          </span>

          {count > 1 && (
            <span className="text-xs text-terminal-muted">({count})</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0 bg-terminal-cream border-terminal-green/30"
        align="end"
      >
        <div className="p-3 border-b border-terminal-green/20">
          <h4 className="font-mono font-semibold text-terminal-dark text-sm">
            {t("activeTasks", { count })}
          </h4>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {tasks.map((task) => (
            <TaskRow key={task.runId} task={task} onNavigate={handleNavigate} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
