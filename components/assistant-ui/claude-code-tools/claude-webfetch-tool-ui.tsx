"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, GlobeIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";
import { parseTextResult } from "./parse-text-result";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    url?: string;
    prompt?: string;
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
  if (text && /^(error|failed|404|403|500)/im.test(text.slice(0, 200))) return true;
  return false;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

/**
 * Custom UI for Claude Code's `WebFetch` tool.
 * Shows URL domain, fetch status, and content preview.
 */
export const ClaudeWebFetchToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const url = args?.url || "";
  const domain = getDomain(url);
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
        <span className="text-terminal-muted">{isRunning ? "Fetching..." : hasError ? "Fetch failed" : "Fetched"}</span>
        <span className="font-medium text-terminal-dark truncate">{domain}</span>

        {content && !hasError && (
          <span className="text-terminal-muted ml-auto shrink-0">
            {Math.round(content.length / 1024)}KB
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
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline truncate block text-[11px]"
            >
              {url}
            </a>
          )}

          {args?.prompt && (
            <div className="text-[11px] text-terminal-muted">
              Prompt: {args.prompt.length > 200 ? args.prompt.substring(0, 200) + "..." : args.prompt}
            </div>
          )}

          {displayContent && (
            <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-64 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
              {displayContent}
            </pre>
          )}

          {hasError && content && (
            <div className="text-[11px] text-red-600">{content.slice(0, 500)}</div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Fetching URL...</div>
          )}
        </div>
      )}
    </div>
  );
};
