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
  diff?: string;
}

interface WriteFileResult {
  status: "success" | "error" | "warning";
  filePath: string;
  message: string;
  bytesWritten?: number;
  lineCount?: number;
  created?: boolean;
  diagnostics?: DiagnosticResult;
  diff?: string;
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
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [showFullDiagnostics, setShowFullDiagnostics] = useState(false);
  const filePath = (args?.filePath as string) || "";
  const fileName = filePath.split("/").pop() || filePath;

  // Determine action label based on tool type and result status
  const isWrite = toolName === "writeFile";
  const isCreating = isWrite
    ? (result as WriteFileResult)?.created
    : !(args?.oldString as string);

  // Dynamic label based on result status
  const getActionLabel = () => {
    if (!result) {
      return isCreating ? "Creating..." : isWrite ? "Writing..." : "Editing...";
    }

    switch (result.status) {
      case "error":
        return isCreating ? "Create failed" : isWrite ? "Write failed" : "Edit failed";
      case "warning":
        return isCreating ? "Created with warnings" : isWrite ? "Wrote with warnings" : "Edited with warnings";
      case "success":
      default:
        return isCreating ? "Created" : isWrite ? "Wrote" : "Edited";
    }
  };

  const actionLabel = getActionLabel();
  const ActionIcon = isCreating ? PlusIcon : PencilIcon;

  const resultDiff = result?.diff;
  const fallbackDiff =
    !isWrite && args?.oldString && args?.newString
      ? `- ${String(args.oldString)}\n+ ${String(args.newString)}`
      : null;
  const diffText = resultDiff || fallbackDiff;
  const diffLines = diffText ? diffText.split("\n") : [];
  const maxDiffLines = 150;
  const isDiffTruncated = diffLines.length > maxDiffLines;
  const visibleDiffLines =
    !showFullDiff && isDiffTruncated
      ? diffLines.slice(0, maxDiffLines)
      : diffLines;

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

        {/* Error message in collapsed header (truncated) */}
        {result?.status === "error" && result.message && (
          <span 
            className="text-red-600 text-[10px] truncate max-w-[150px] ml-1" 
            title={result.message}
          >
            {result.message}
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

          {/* Show backend-provided diff first, fallback to args-derived diff */}
          {diffText && (
            <div className="space-y-2">
              <div className="rounded bg-terminal-dark/5 p-2 overflow-x-auto">
                <pre className="text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
                  {visibleDiffLines.join("\n")}
                </pre>
              </div>

              {isDiffTruncated && (
                <button
                  type="button"
                  onClick={() => setShowFullDiff(!showFullDiff)}
                  className="text-[11px] text-blue-600 hover:text-blue-700 underline"
                >
                  {showFullDiff ? "▲ Show less" : `▼ Show all (${diffLines.length} lines)`}
                </button>
              )}
            </div>
          )}

          {/* Result message */}
          {result && (
            <div className={cn("text-[11px]", statusColor)}>
              {result.message}
            </div>
          )}

          {/* Diagnostics */}
          {result?.diagnostics && result.diagnostics.output && (() => {
            const { errors, warnings, output, tool } = result.diagnostics;
            const totalIssues = errors + warnings;
            const outputLines = output.split('\n');
            const hasMultipleIssues = totalIssues > 1;
            
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
              <div className="rounded bg-terminal-dark/5 p-2 space-y-2">
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
                      showFullDiagnostics ? "max-h-none" : "max-h-[300px]"
                    )}
                  >
                    {sortedOutput}
                  </pre>
                  
                  {outputLines.length > 20 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDiagnostics(!showFullDiagnostics)}
                      className="text-[11px] text-blue-600 hover:text-blue-700 underline mt-1"
                    >
                      {showFullDiagnostics ? '▲ Show less' : `▼ Show all (${outputLines.length} lines)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

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
