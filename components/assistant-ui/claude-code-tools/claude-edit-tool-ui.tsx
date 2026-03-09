"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, PencilIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };
  result?: unknown;
}>;

function parseResultText(result: unknown): string | undefined {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    // assistant-ui sometimes wraps in content array
    if (Array.isArray(r.content)) {
      const textItem = r.content.find(
        (item: unknown) =>
          item && typeof item === "object" && (item as { type?: string }).type === "text"
      ) as { text?: string } | undefined;
      if (textItem?.text) return textItem.text;
    }
    if (typeof r.text === "string") return r.text;
    if (typeof r.message === "string") return r.message;
  }
  return undefined;
}

function isErrorResult(result: unknown): boolean {
  if (!result) return false;
  const text = parseResultText(result);
  if (text && /error|failed|denied/i.test(text.slice(0, 100))) return true;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.isError === true) return true;
    const status = typeof r.status === "string" ? r.status.toLowerCase() : "";
    if (status === "error" || status === "failed" || status === "denied") return true;
  }
  return false;
}

/**
 * Custom UI for Claude Code's `Edit` tool.
 * Shows file name, diff preview (old_string → new_string), and result status.
 */
export const ClaudeEditToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);
  const [showFullDiff, setShowFullDiff] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const filePath = args?.file_path || "";
  const fileName = filePath.split("/").pop() || filePath;
  const isCreating = !args?.old_string && !!args?.new_string;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  const getActionLabel = () => {
    if (isRunning) return isCreating ? "Creating..." : "Editing...";
    if (hasError) return isCreating ? "Create failed" : "Edit failed";
    return isCreating ? "Created" : "Edited";
  };

  const ActionIcon = isCreating ? PlusIcon : PencilIcon;
  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  // Build diff from args
  const diffLines: string[] = [];
  if (args?.old_string) {
    for (const line of args.old_string.split("\n")) {
      diffLines.push(`- ${line}`);
    }
  }
  if (args?.new_string) {
    for (const line of args.new_string.split("\n")) {
      diffLines.push(`+ ${line}`);
    }
  }

  const maxDiffLines = 150;
  const isDiffTruncated = diffLines.length > maxDiffLines;
  const visibleDiffLines = !showFullDiff && isDiffTruncated
    ? diffLines.slice(0, maxDiffLines)
    : diffLines;

  // Count additions/removals
  const additions = diffLines.filter(l => l.startsWith("+ ")).length;
  const removals = diffLines.filter(l => l.startsWith("- ")).length;

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <ActionIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{getActionLabel()}</span>
        <span className="font-medium text-terminal-dark truncate min-w-0 flex-1" title={filePath || fileName}>{fileName}</span>

        {(additions > 0 || removals > 0) && (
          <span className="ml-auto shrink-0 text-terminal-muted">
            {additions > 0 && <span className="text-emerald-600">+{additions}</span>}
            {additions > 0 && removals > 0 && " "}
            {removals > 0 && <span className="text-red-500">-{removals}</span>}
          </span>
        )}

        {args?.replace_all && (
          <span className="text-terminal-muted text-[10px] ml-1">(all)</span>
        )}

        {expanded ? (
          <ChevronDownIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          <div className="text-terminal-muted truncate" title={filePath}>
            {filePath}
          </div>

          {diffLines.length > 0 && (
            <div className="space-y-2">
              <div className="rounded bg-terminal-dark/5 p-2 overflow-x-auto">
                <pre className="text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
                  {visibleDiffLines.map((line, i) => (
                    <span
                      key={i}
                      className={cn(
                        "block",
                        line.startsWith("+ ") && "text-emerald-700 bg-emerald-50/50",
                        line.startsWith("- ") && "text-red-700 bg-red-50/50"
                      )}
                    >
                      {line}
                    </span>
                  ))}
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
          {result !== undefined && (
            <div className={cn("text-[11px]", statusColor)}>
              {parseResultText(result) || (hasError ? "Edit failed" : "Edit applied")}
            </div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Processing...</div>
          )}
        </div>
      )}
    </div>
  );
};
