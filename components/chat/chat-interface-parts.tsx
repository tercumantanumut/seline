"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, CircleStop, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActiveRunState } from "@/components/chat/chat-interface-types";

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
