"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    pattern?: string;
    path?: string;
  };
  result?: unknown;
}>;

function parseTextResult(result: unknown): string | undefined {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content)) {
      const textItem = r.content.find(
        (item: unknown) =>
          item && typeof item === "object" && (item as { type?: string }).type === "text"
      ) as { text?: string } | undefined;
      if (textItem?.text) return textItem.text;
    }
    if (typeof r.text === "string") return r.text;
  }
  return undefined;
}

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
 * Custom UI for Claude Code's `Glob` tool.
 * Shows pattern, directory scope, and matched file list.
 */
export const ClaudeGlobToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const pattern = args?.pattern || "";
  const searchPath = args?.path;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);
  const content = parseTextResult(result);

  // Parse file list from result
  const files = content ? content.split("\n").filter(l => l.trim()) : [];
  const fileCount = files.length;

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <SearchIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{isRunning ? "Finding..." : hasError ? "Find failed" : "Find"}</span>
        <span className="font-medium text-terminal-dark truncate">{pattern}</span>

        {!isRunning && !hasError && fileCount > 0 && (
          <span className="text-terminal-muted ml-auto shrink-0">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
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
          {searchPath && (
            <div className="text-terminal-muted truncate" title={searchPath}>
              in {searchPath}
            </div>
          )}

          {files.length > 0 && (
            <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-64 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
              {files.slice(0, 200).join("\n")}
              {files.length > 200 && `\n\n... and ${files.length - 200} more files`}
            </pre>
          )}

          {hasError && content && (
            <div className="text-[11px] text-red-600">{content.slice(0, 500)}</div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Searching files...</div>
          )}
        </div>
      )}
    </div>
  );
};
