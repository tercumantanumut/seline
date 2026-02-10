"use client";

import { FC, useState } from "react";
import { FileIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticResult {
  tool: string;
  errors: number;
  warnings: number;
  output: string;
}

interface OperationResult {
  filePath: string;
  action: "update" | "create" | "delete";
  success: boolean;
  error?: string;
}

interface PatchFileResult {
  status: "success" | "error" | "partial";
  message: string;
  filesChanged: number;
  operations: OperationResult[];
  diagnostics?: DiagnosticResult[];
}

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args: { operations?: Array<{ action: string; filePath: string }> };
  result?: PatchFileResult;
}>;

const ACTION_ICONS = {
  update: PencilIcon,
  create: PlusIcon,
  delete: Trash2Icon,
} as const;

const ACTION_COLORS = {
  update: "text-blue-600",
  create: "text-emerald-600",
  delete: "text-red-600",
} as const;

export const PatchFileToolUI: ToolCallContentPartComponent = ({
  args,
  result,
}) => {
  const [expanded, setExpanded] = useState(false);
  const opCount = args?.operations?.length || result?.operations?.length || 0;

  const StatusIcon = !result
    ? FileIcon
    : result.status === "success"
      ? CheckCircleIcon
      : result.status === "partial"
        ? AlertTriangleIcon
        : XCircleIcon;

  const statusColor = !result
    ? "text-terminal-muted"
    : result.status === "success"
      ? "text-emerald-600"
      : result.status === "partial"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />
        <span className="text-terminal-muted">Patch</span>
        <span className="font-medium text-terminal-dark">
          {opCount} file{opCount !== 1 ? "s" : ""}
        </span>

        {result && (
          <span className={cn("ml-auto shrink-0", statusColor)}>
            {result.filesChanged} changed
          </span>
        )}

        {expanded ? (
          <ChevronDownIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          {/* Operations list */}
          {(result?.operations || args?.operations)?.map((op, i) => {
            const action = ("success" in op ? op.action : op.action) as keyof typeof ACTION_ICONS;
            const Icon = ACTION_ICONS[action] || FileIcon;
            const color = ACTION_COLORS[action] || "text-terminal-muted";
            const fileName = op.filePath.split("/").pop() || op.filePath;
            const success = "success" in op ? (op as OperationResult).success : undefined;
            const error = "error" in op ? (op as OperationResult).error : undefined;

            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <Icon className={cn("h-3 w-3 shrink-0", color)} />
                <span className="truncate text-terminal-dark" title={op.filePath}>
                  {fileName}
                </span>
                <span className={cn("text-[11px] shrink-0", color)}>{action}</span>
                {success === true && (
                  <CheckCircleIcon className="h-3 w-3 shrink-0 text-emerald-600 ml-auto" />
                )}
                {success === false && (
                  <span className="text-[11px] text-red-600 ml-auto truncate max-w-[200px]" title={error}>
                    {error || "failed"}
                  </span>
                )}
              </div>
            );
          })}

          {/* Result message */}
          {result && (
            <div className={cn("text-[11px] mt-1 pt-1 border-t border-border/50", statusColor)}>
              {result.message}
            </div>
          )}

          {/* Diagnostics */}
          {result?.diagnostics?.map((diag, i) => (
            diag.output && (
              <div key={i} className="rounded bg-terminal-dark/5 p-2 mt-1">
                <div className="text-[11px] text-terminal-muted mb-1">
                  Diagnostics ({diag.tool})
                </div>
                <pre className="text-[11px] text-terminal-dark whitespace-pre-wrap break-all max-h-[80px] overflow-y-auto">
                  {diag.output}
                </pre>
              </div>
            )
          ))}

          {/* Loading state */}
          {!result && (
            <div className="text-terminal-muted animate-pulse mt-1">
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
