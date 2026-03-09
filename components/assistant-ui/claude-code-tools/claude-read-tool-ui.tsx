"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { FileTextIcon, CheckCircleIcon, XCircleIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";
import { parseTextResult } from "./parse-text-result";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    file_path?: string;
    offset?: number;
    limit?: number;
    pages?: string;
  };
  result?: unknown;
}>;

function isErrorResult(result: unknown): boolean {
  if (!result) return false;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.isError === true) return true;
  }
  const text = parseTextResult(result);
  if (text && /^(error|no such file|permission denied)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `Read` tool.
 * Shows file name, line range, and content preview.
 */
export const ClaudeReadToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

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
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);
  const content = parseTextResult(result);

  // Line count from content
  const lineCount = content ? content.split("\n").length : undefined;

  // Line range info
  let rangeLabel = "";
  if (args?.offset || args?.limit) {
    const start = args.offset ?? 1;
    const end = args.limit ? start + args.limit : undefined;
    rangeLabel = end ? `L${start}–${end}` : `from L${start}`;
  }
  if (args?.pages) {
    rangeLabel = `pages ${args.pages}`;
  }

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  // Truncate for display
  const DISPLAY_LIMIT = 10_000;
  const displayContent = content && content.length > DISPLAY_LIMIT
    ? content.substring(0, DISPLAY_LIMIT) + `\n\n... [${(content.length - DISPLAY_LIMIT).toLocaleString()} more characters]`
    : content;

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <FileTextIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{isRunning ? "Reading..." : hasError ? "Read failed" : "Read"}</span>
        <span className="font-medium text-terminal-dark truncate min-w-0 flex-1" title={filePath || fileName}>{fileName}</span>

        {rangeLabel && (
          <span className="text-terminal-muted shrink-0">{rangeLabel}</span>
        )}

        {lineCount && !hasError && (
          <span className="text-terminal-muted ml-auto shrink-0">
            {lineCount} lines
          </span>
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

          {displayContent && (
            <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-96 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
              {displayContent}
            </pre>
          )}

          {hasError && content && (
            <div className="text-[11px] text-red-600">{content.slice(0, 500)}</div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Reading file...</div>
          )}
        </div>
      )}
    </div>
  );
};
