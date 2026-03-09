"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";
import { parseTextResult } from "./parse-text-result";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    file_path?: string;
    content?: string;
  };
  result?: unknown;
}>;

function isErrorResult(result: unknown): boolean {
  if (!result) return false;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.isError === true) return true;
    const status = typeof r.status === "string" ? r.status.toLowerCase() : "";
    if (status === "error" || status === "failed" || status === "denied") return true;
  }
  const text = parseTextResult(result);
  if (text && /^(error|failed|permission denied)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `Write` tool.
 * Shows file name, content preview, and line count.
 */
export const ClaudeWriteToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

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
  const fileContent = args?.content || "";
  const lineCount = fileContent ? fileContent.split("\n").length : 0;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  const maxContentLines = 100;
  const contentLines = fileContent.split("\n");
  const isContentTruncated = contentLines.length > maxContentLines;
  const visibleContent = !showFullContent && isContentTruncated
    ? contentLines.slice(0, maxContentLines).join("\n")
    : fileContent;

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <PlusIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">
          {isRunning ? "Writing..." : hasError ? "Write failed" : "Wrote"}
        </span>
        <span className="font-medium text-terminal-dark truncate">{fileName}</span>

        {lineCount > 0 && (
          <span className="text-terminal-muted ml-auto shrink-0">
            <span className="text-emerald-600">+{lineCount}</span>
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

          {fileContent && (
            <div className="space-y-2">
              <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-96 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
                {visibleContent}
              </pre>

              {isContentTruncated && (
                <button
                  type="button"
                  onClick={() => setShowFullContent(!showFullContent)}
                  className="text-[11px] text-blue-600 hover:text-blue-700 underline"
                >
                  {showFullContent ? "▲ Show less" : `▼ Show all (${contentLines.length} lines)`}
                </button>
              )}
            </div>
          )}

          {result !== undefined && (
            <div className={cn("text-[11px]", statusColor)}>
              {parseTextResult(result) || (hasError ? "Write failed" : "File written")}
            </div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Writing file...</div>
          )}
        </div>
      )}
    </div>
  );
};
