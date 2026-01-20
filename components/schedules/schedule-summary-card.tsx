"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Calendar } from "lucide-react";
import { parseCronExpression, describeDays, getNextRunDate, formatNextRun } from "@/lib/utils/cron-helpers";

interface ScheduleSummaryCardProps {
    cronExpression: string;
    timezone: string;
}

export function ScheduleSummaryCard({ cronExpression, timezone }: ScheduleSummaryCardProps) {
    const t = useTranslations("schedules.newForm.summary");

    const { description, nextRun } = useMemo(() => {
        try {
            const { time, days, isSimple } = parseCronExpression(cronExpression);

            if (!isSimple) {
                return {
                    description: t("customSchedule"),
                    nextRun: null,
                };
            }

            const daysDescription = describeDays(days);
            const [hours, minutes] = time.split(":").map(Number);
            const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

            const description = t("runsEvery", { days: daysDescription, time: formattedTime });

            const nextRunDate = getNextRunDate(cronExpression, timezone);
            const nextRun = nextRunDate ? formatNextRun(nextRunDate, timezone) : null;

            return { description, nextRun };
        } catch {
            return { description: null, nextRun: null };
        }
    }, [cronExpression, timezone, t]);

    if (!description) return null;

    return (
        <div className="rounded-lg border border-terminal-green/20 bg-terminal-green/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-terminal-green">
                <Sparkles className="w-4 h-4" />
                <span>{description}</span>
            </div>
            {nextRun && (
                <div className="flex items-center gap-2 text-xs text-terminal-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{t("nextRun", { date: nextRun })}</span>
                </div>
            )}
        </div>
    );
}
