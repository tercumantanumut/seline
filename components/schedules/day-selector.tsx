"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface DaySelectorProps {
    selectedDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    onChange: (days: number[]) => void;
    disabled?: boolean;
}

// Display order: Mon-Sun (1,2,3,4,5,6,0)
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Day labels corresponding to cron indices (0=Sun)
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function DaySelector({ selectedDays, onChange, disabled }: DaySelectorProps) {
    const t = useTranslations("schedules.newForm.days");

    const toggleDay = (day: number) => {
        if (disabled) return;
        const newDays = selectedDays.includes(day)
            ? selectedDays.filter((d) => d !== day)
            : [...selectedDays, day].sort((a, b) => a - b);
        onChange(newDays);
    };

    return (
        <div className="space-y-3">
            <label className="text-xs font-medium text-terminal-muted uppercase tracking-wider">
                {t("repeatsOn")}
            </label>
            <div className="flex justify-between gap-2">
                {DAYS_ORDER.map((day) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                        <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            disabled={disabled}
                            className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center",
                                "text-sm font-semibold border-2 transition-all duration-200",
                                isSelected
                                    ? "bg-terminal-green border-terminal-green text-white shadow-lg shadow-terminal-green/25"
                                    : "bg-transparent border-terminal-border text-terminal-muted hover:border-terminal-green hover:text-terminal-green",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {t(DAY_KEYS[day])}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
