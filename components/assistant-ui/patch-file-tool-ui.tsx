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
  diff?: string;
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
  const [showFullDiagnostics, setShowFullDiagnostics] = useState<{[key: number]: boolean}>({});
  const [showFullDiff, setShowFullDiff] = useState<{[key: number]: boolean}>({});
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
            const diff = "diff" in op ? (op as OperationResult).diff : undefined;
            const diffLines = diff ? diff.split("\n") : [];
            const maxDiffLines = 120;
            const isDiffTruncated = diffLines.length > maxDiffLines;
            const isDiffExpanded = showFullDiff[i] || false;
            const visibleDiff =
              isDiffTruncated && !isDiffExpanded
                ? diffLines.slice(0, maxDiffLines).join("\n")
                : diff;

            return (
              <div key={i} className="py-0.5">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-3 w-3 shrink-0", color)} />
                  <span className="truncate text-terminal-dark" title={op.filePath}>
                    {fileName}
                  </span>
                  <span className={cn("text-[11px] shrink-0", color)}>{action}</span>
                  {success === true && (
                    <CheckCircleIcon className="h-3 w-3 shrink-0 text-emerald-600 ml-auto" />
                  )}
                  {success === false && (
                    <XCircleIcon className="h-3 w-3 shrink-0 text-red-600 ml-auto" />
                  )}
                </div>
                {/* Show full error message on separate line */}
                {success === false && error && (
                  <div className="text-[11px] text-red-600 mt-0.5 ml-5 whitespace-pre-wrap break-words">
                    {error}
                  </div>
                )}
                {diff && (
                  <div className="rounded bg-terminal-dark/5 p-2 mt-1 ml-5">
                    <pre className="text-[11px] text-terminal-dark whitespace-pre-wrap break-all">
                      {visibleDiff}
                    </pre>
                    {isDiffTruncated && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowFullDiff((prev) => ({ ...prev, [i]: !prev[i] }))
                        }
                        className="text-[11px] text-blue-600 hover:text-blue-700 underline mt-1"
                      >
                        {isDiffExpanded
                          ? "▲ Show less"
                          : `▼ Show all (${diffLines.length} lines)`}
                      </button>
                    )}
                  </div>
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
          {result?.diagnostics?.map((diag, i) => {
            if (!diag.output) return null;
            
            const { errors, warnings, output, tool } = diag;
            const totalIssues = errors + warnings;
            const outputLines = output.split('\n');
            const hasMultipleIssues = totalIssues > 1;
            const isExpanded = showFullDiagnostics[i] || false;
            
            // Parse output to separate errors and warnings (basic heuristic)
            const errorLines: string[] = [];
            const warningLines: string[] = [];
            const otherLines: string[] = [];
            
            outputLines.forEach(line => {
              if (line.includes('error') || line.includes('✖')) {
                errorLines.push(line);
              } else if (line.includes('warning') || line.includes('⚠')) {
                warningLines.push(line);
              } else {
                otherLines.push(line);
              }
            });
            
            // Reconstruct output with errors first, then warnings
            const sortedOutput = [
              ...errorLines,
              ...warningLines,
              ...otherLines
            ].join('\n');
            
            return (
              <div key={i} className="rounded bg-terminal-dark/5 p-2 mt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-terminal-muted">
                    Diagnostics ({tool})
                  </div>
                  {hasMultipleIssues && (
                    <div className="text-[11px] flex gap-2">
                      {errors > 0 && (
                        <span className="text-red-600 font-medium">
                          {errors} error{errors !== 1 ? 's' : ''}
                        </span>
                      )}
                      {warnings > 0 && (
                        <span className="text-amber-600 font-medium">
                          {warnings} warning{warnings !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="relative">
                  <pre 
                    className={cn(
                      "text-[11px] text-terminal-dark whitespace-pre-wrap break-all overflow-y-auto",
                      isExpanded ? "max-h-none" : "max-h-[300px]"
                    )}
                  >
                    {sortedOutput}
                  </pre>
                  
                  {outputLines.length > 20 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDiagnostics(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="text-[11px] text-blue-600 hover:text-blue-700 underline mt-1"
                    >
                      {isExpanded ? '▲ Show less' : `▼ Show all (${outputLines.length} lines)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

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
