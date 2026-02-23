"use client";

import { useTranslations } from "next-intl";
import { HelpCircle, ChevronRight, ChevronDown } from "lucide-react";
import { TEMPLATE_VARIABLES } from "@/lib/scheduler/template-variables";

export const TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "America/Denver",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Istanbul",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Australia/Sydney",
    "Pacific/Auckland",
];

export function SectionHeader({ number, title }: { number: number; title: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-terminal-green/10 border border-terminal-green/20 flex items-center justify-center text-terminal-green text-xs font-bold font-mono">
                {number}
            </span>
            <h3 className="text-sm font-semibold text-terminal-dark">{title}</h3>
        </div>
    );
}

interface VariableHelpPanelProps {
    show: boolean;
    onToggle: () => void;
}

export function VariableHelpPanel({ show, onToggle }: VariableHelpPanelProps) {
    const t = useTranslations("schedules.newForm");

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-1.5 text-xs text-terminal-muted hover:text-terminal-green transition-colors w-fit ml-8"
            >
                <HelpCircle className="w-3 h-3" />
                <span>{t("variables.helpTitle")}</span>
                {show ? (
                    <ChevronDown className="w-3 h-3" />
                ) : (
                    <ChevronRight className="w-3 h-3" />
                )}
            </button>

            {show && (
                <div className="ml-8 p-4 bg-terminal-cream/50 rounded-lg border border-terminal-border space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-terminal-dark">{t("variables.helpTitle")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("variables.helpDescription")}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(["time", "context"] as const).map((category) => (
                            <div key={category} className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-terminal-muted border-b border-terminal-border/50 pb-1">
                                    {t(`variables.categories.${category}`)}
                                </p>
                                <div className="space-y-2">
                                    {TEMPLATE_VARIABLES.filter(v => v.category === category).map(v => (
                                        <div key={v.syntax} className="flex flex-col gap-0.5">
                                            <code className="text-[11px] font-mono text-terminal-green">{v.syntax}</code>
                                            <span className="text-[10px] text-muted-foreground leading-tight">{v.description}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
