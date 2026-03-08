"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, GlobeIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    query?: string;
    allowed_domains?: string[];
    blocked_domains?: string[];
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
  if (text && /^(error|failed)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `WebSearch` tool.
 * Shows query, result count, and search content.
 */
export const ClaudeWebSearchToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const query = args?.query || "";
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);
  const content = parseTextResult(result);

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  const DISPLAY_LIMIT = 5_000;
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
        <GlobeIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{isRunning ? "Searching..." : hasError ? "Search failed" : "Searched"}</span>
        <span className="font-medium text-terminal-dark truncate">{query}</span>

        {expanded ? (
          <ChevronDownIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {displayContent && (
            <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-64 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
              {displayContent}
            </pre>
          )}

          {hasError && content && (
            <div className="text-[11px] text-red-600">{content.slice(0, 500)}</div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Searching the web...</div>
          )}
        </div>
      )}
    </div>
  );
};
