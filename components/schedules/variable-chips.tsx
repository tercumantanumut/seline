"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface Variable {
    name: string;
    label?: string;
}

interface VariableChipsProps {
    variables?: Variable[];
    onInsert: (variable: string) => void;
}

const DEFAULT_VARIABLES: Variable[] = [
    { name: "LAST_RUN", label: "Last Run" },
    { name: "DATE", label: "Date" },
    { name: "LAST_7_DAYS", label: "Last 7 Days" },
    { name: "AGENT_NAME", label: "Agent" },
];

export function VariableChips({
    variables = DEFAULT_VARIABLES,
    onInsert
}: VariableChipsProps) {
    const t = useTranslations("schedules.newForm.variables");

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-terminal-muted font-mono uppercase tracking-wider">
                {t("label")}:
            </span>
            {variables.map((v) => (
                <button
                    key={v.name}
                    type="button"
                    onClick={() => onInsert(`{{${v.name}}}`)}
                    className={cn(
                        "px-2 py-1 rounded text-xs font-mono",
                        "bg-terminal-green/10 text-terminal-green",
                        "border border-terminal-green/20",
                        "hover:bg-terminal-green/20 transition-colors"
                    )}
                >
                    {`{{${v.name}}}`}
                </button>
            ))}
        </div>
    );
}
