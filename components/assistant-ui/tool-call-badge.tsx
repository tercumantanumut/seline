"use client";

import type { FC } from "react";
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolCallBadgeStatus = "running" | "completed" | "error";

interface ToolCallBadgeProps {
  label: string;
  status: ToolCallBadgeStatus;
  count?: number | null;
}

const statusStyles: Record<ToolCallBadgeStatus, string> = {
  running: "bg-terminal-amber/20 text-terminal-amber",
  completed: "bg-terminal-green/15 text-terminal-green",
  error: "bg-red-50 text-red-600",
};

const statusIcons: Record<ToolCallBadgeStatus, FC<{ className?: string }>> = {
  running: Loader2Icon,
  completed: CheckCircleIcon,
  error: XCircleIcon,
};

export const ToolCallBadge: FC<ToolCallBadgeProps> = ({ label, status, count }) => {
  const Icon = statusIcons[status];
  return (
    <span
      className={cn(
        "inline-flex max-w-[180px] items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono",
        statusStyles[status]
      )}
    >
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span className="text-terminal-muted">({count})</span>
      )}
    </span>
  );
};
