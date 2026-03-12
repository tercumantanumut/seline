"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, CircleStop, Clock3, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActiveRunState } from "@/components/chat/chat-interface-types";
import type { UnifiedTask } from "@/lib/background-tasks/types";

function formatTimeAgo(startedAt: string) {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
}

function taskLabel(task: UnifiedTask, t: ReturnType<typeof useTranslations<"schedules.notifications">>) {
    if (task.type === "scheduled") return task.taskName;
    if (task.type === "chat") return t("chatRun");
    return t("channelTask", { channelType: task.channelType });
}

export function SessionActiveTasksBanner({
    tasks,
}: {
    tasks: UnifiedTask[];
}) {
    const t = useTranslations("schedules.notifications");

    if (tasks.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border border-terminal-border/60 bg-terminal-cream/80 shadow-sm">
            <div className="flex flex-col gap-3 p-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-1.5 rounded-full bg-terminal-green/60" />
                    <div className="space-y-1 min-w-0">
                        <p className="font-mono text-sm text-terminal-dark">
                            {t("activeTasks", { count: tasks.length })}
                        </p>
                        <p className="text-xs text-terminal-muted">
                            {t("sessionActiveTasksDescription")}
                        </p>
                    </div>
                </div>
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <div
                            key={task.runId}
                            className="flex items-center justify-between gap-3 rounded-lg border border-terminal-border/40 bg-terminal-paper/40 px-3 py-2"
                        >
                            <span className="min-w-0 truncate text-sm font-mono text-terminal-dark">
                                {taskLabel(task, t)}
                            </span>
                            <span className="shrink-0 text-xs font-mono text-terminal-muted inline-flex items-center gap-1">
                                <Clock3 className="h-3 w-3" />
                                {t("startedAgo", { time: formatTimeAgo(task.startedAt) })}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


export function ChatSidebarHeader({
    label,
    onBack,
}: {
    label: string;
    onBack: () => void;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2 text-terminal-dark hover:bg-terminal-dark/8 transition-all duration-200"
        >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-mono">{label}</span>
        </Button>
    );
}

export function ScheduledRunBanner({
    run,
    onCancel,
    cancelling,
}: {
    run: ActiveRunState;
    onCancel: () => void;
    cancelling: boolean;
}) {
    const t = useTranslations("chat");

    return (
        <div className="rounded-xl border border-terminal-border/60 bg-terminal-cream/80 shadow-sm">
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-1.5 rounded-full bg-terminal-green/60" />
                    <div className="space-y-1">
                        <p className="font-mono text-sm text-terminal-dark">
                            {t("scheduledRun.active", { taskName: run.taskName || t("scheduledRun.backgroundTask") })}
                        </p>
                        <p className="text-xs text-terminal-muted">
                            {t("scheduledRun.description")}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-xs font-mono text-terminal-muted">
                        {t("scheduledRun.startedAt", {
                            time: new Date(run.startedAt).toLocaleTimeString(),
                        })}
                    </span>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="font-mono"
                        onClick={onCancel}
                        disabled={cancelling}
                    >
                        {cancelling ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("scheduledRun.stopping")}
                            </>
                        ) : (
                            <>
                                <CircleStop className="mr-2 h-4 w-4" />
                                {t("scheduledRun.stop")}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
