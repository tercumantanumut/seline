"use client";

import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolDependencyBadgeProps {
    warning: string;
    className?: string;
}

export function ToolDependencyBadge({ warning, className }: ToolDependencyBadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-terminal-amber/10 px-2.5 py-0.5 text-xs font-medium text-terminal-amber border border-terminal-amber/20",
                className
            )}
        >
            <AlertTriangleIcon className="w-3 h-3" />
            <span className="font-mono">{warning}</span>
        </div>
    );
}
