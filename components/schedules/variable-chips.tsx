"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { TEMPLATE_VARIABLES } from "@/lib/scheduler/template-variables";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface VariableChipsProps {
    onInsert: (variable: string) => void;
}

export function VariableChips({
    onInsert
}: VariableChipsProps) {
    const t = useTranslations("schedules.newForm.variables");

    return (
        <TooltipProvider>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-terminal-muted font-mono uppercase tracking-wider">
                    {t("label")}:
                </span>
                {TEMPLATE_VARIABLES.map((v) => (
                    <Tooltip key={v.syntax}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onInsert(v.syntax)}
                                className={cn(
                                    "px-2 py-1 rounded text-xs font-mono",
                                    "bg-terminal-green/10 text-terminal-green",
                                    "border border-terminal-green/20",
                                    "hover:bg-terminal-green/20 transition-colors"
                                )}
                            >
                                {v.syntax}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs p-3">
                            <div className="space-y-1">
                                <p className="font-semibold text-terminal-green">{v.label}</p>
                                <p className="text-xs text-muted-foreground">{v.description}</p>
                                <div className="mt-2 pt-2 border-t border-muted">
                                    <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("exampleOutput")}</p>
                                    <p className="text-[10px] font-mono bg-terminal-green/5 p-1 rounded border border-terminal-green/10">
                                        {v.example}
                                    </p>
                                </div>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    );
}
