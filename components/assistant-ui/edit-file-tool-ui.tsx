"use client";

import { FC, useState } from "react";
import { FileIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticResult {
  tool: string;
  errors: number;
  warnings: number;
  output: string;
}

interface EditFileResult {
  status: "success" | "error" | "warning";
  filePath: string;
  message: string;
  linesChanged?: number;
  diagnostics?: DiagnosticResult;
}

interface WriteFileResult {
  status: "success" | "error" | "warning";
  filePath: string;
  message: string;
  bytesWritten?: number;
  lineCount?: number;
  created?: boolean;
  diagnostics?: DiagnosticResult;
}

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args: { filePath?: string; oldString?: string; newString?: string; content?: string };
  result?: EditFileResult | WriteFileResult;
}>;

export const EditFileToolUI: ToolCallContentPartComponent = ({
  toolName,
  args,
  result,
}) => {
  const [expanded, setExpanded] = useState(false);
  const filePath = (args?.filePath as string) || "";
  const fileName = filePath.split("/").pop() || filePath;

  // Determine action label
  const isWrite = toolName === "writeFile";
  const isCreating = isWrite
    ? (result as WriteFileResult)?.created
    : !(args?.oldString as string);

  const actionLabel = isCreating ? "Created" : isWrite ? "Wrote" : "Edited";
  const ActionIcon = isCreating ? PlusIcon : PencilIcon;

  // Status icon
  const StatusIcon = !result
    ? FileIcon
    : result.status === "success"
      ? CheckCircleIcon
      : result.status === "warning"
        ? AlertTriangleIcon
        : XCircleIcon;

  const statusColor = !result
    ? "text-terminal-muted"
    : result.status === "success"
      ? "text-emerald-600"
      : result.status === "warning"
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
        <ActionIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{actionLabel}</span>
        <span className="font-medium text-terminal-dark truncate">{fileName}</span>

        {result && "linesChanged" in result && result.linesChanged !== undefined && (
          <span className="text-terminal-muted ml-auto shrink-0">
            {result.linesChanged} line{result.linesChanged !== 1 ? "s" : ""}
          </span>
        )}
        {result && "lineCount" in result && result.lineCount !== undefined && (
          <span className="text-terminal-muted ml-auto shrink-0">
            {result.lineCount} line{result.lineCount !== 1 ? "s" : ""}
          </span>
        )}

        {result?.diagnostics && (result.diagnostics.errors > 0 || result.diagnostics.warnings > 0) && (
          <span className={cn(
            "ml-1 shrink-0",
            result.diagnostics.errors > 0 ? "text-red-600" : "text-amber-600"
          )}>
            {result.diagnostics.errors > 0 && `${result.diagnostics.errors}E`}
            {result.diagnostics.errors > 0 && result.diagnostics.warnings > 0 && " "}
            {result.diagnostics.warnings > 0 && `${result.diagnostics.warnings}W`}
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
        <div className="border-t border-border px-3 py-2 space-y-2">
          <div className="text-terminal-muted truncate" title={filePath}>
            {filePath}
          </div>

          {/* Show edit diff preview */}
          {!isWrite && args?.oldString && args?.newString && (() => {
            const oldStr = String(args.oldString);
            const newStr = String(args.newString);
            return (
              <div className="rounded bg-terminal-dark/5 p-2 overflow-x-auto">
                <div className="text-red-600/80 whitespace-pre-wrap break-all">
                  - {oldStr.slice(0, 200)}
                  {oldStr.length > 200 ? "..." : null}
                </div>
                <div className="text-emerald-600/80 whitespace-pre-wrap break-all mt-1">
                  + {newStr.slice(0, 200)}
                  {newStr.length > 200 ? "..." : null}
                </div>
              </div>
            );
          })()}

          {/* Result message */}
          {result && (
            <div className={cn("text-[11px]", statusColor)}>
              {result.message}
            </div>
          )}

          {/* Diagnostics */}
          {result?.diagnostics && result.diagnostics.output && (
            <div className="rounded bg-terminal-dark/5 p-2">
              <div className="text-[11px] text-terminal-muted mb-1">
                Diagnostics ({result.diagnostics.tool})
              </div>
              <pre className="text-[11px] text-terminal-dark whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">
                {result.diagnostics.output}
              </pre>
            </div>
          )}

          {/* Loading state */}
          {!result && (
            <div className="text-terminal-muted animate-pulse">
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
