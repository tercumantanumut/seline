"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ScheduleType = "daily" | "specific" | "advanced";

interface ScheduleTypeTabsProps {
    value: ScheduleType;
    onChange: (value: ScheduleType) => void;
}

const tabs: { value: ScheduleType; labelKey: string }[] = [
    { value: "daily", labelKey: "everyDay" },
    { value: "specific", labelKey: "specificDays" },
    { value: "advanced", labelKey: "advanced" },
];

export function ScheduleTypeTabs({ value, onChange }: ScheduleTypeTabsProps) {
    const t = useTranslations("schedules.newForm.frequency");

    return (
        <div className="bg-terminal-dark/10 p-1 rounded-lg flex text-xs font-medium font-mono">
            {tabs.map((tab) => (
                <button
                    key={tab.value}
                    type="button"
                    onClick={() => onChange(tab.value)}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-md transition-all duration-200",
                        value === tab.value
                            ? "bg-terminal-cream shadow-sm text-terminal-green font-semibold"
                            : "text-terminal-muted hover:text-terminal-dark"
                    )}
                >
                    {t(tab.labelKey)}
                </button>
            ))}
        </div>
    );
}
