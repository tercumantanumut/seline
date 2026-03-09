"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, BotIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";
import { parseTextResult } from "./parse-text-result";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    description?: string;
    prompt?: string;
    subagent_type?: string;
    model?: string;
    isolation?: string;
    run_in_background?: boolean;
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
  if (text && /^(error|failed)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `Agent` tool.
 * Shows agent type, description, and result summary.
 */
export const ClaudeAgentToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const description = args?.description || "";
  const subagentType = args?.subagent_type;
  const model = args?.model;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);
  const content = parseTextResult(result);

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  // Truncate result for display
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
        <BotIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">
          {isRunning ? "Running agent..." : hasError ? "Agent failed" : "Agent"}
        </span>
        <span className="font-medium text-terminal-dark truncate">{description}</span>

        {subagentType && (
          <span className="text-[10px] text-terminal-muted shrink-0 bg-terminal-dark/5 rounded px-1 py-0.5">
            {subagentType}
          </span>
        )}

        {model && (
          <span className="text-[10px] text-terminal-muted shrink-0">
            {model}
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
          {args?.prompt && (
            <div className="space-y-1">
              <div className="text-[10px] text-terminal-muted uppercase tracking-wider">Prompt</div>
              <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-48 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
                {args.prompt.length > 2000
                  ? args.prompt.substring(0, 2000) + `\n\n... [${(args.prompt.length - 2000).toLocaleString()} more characters]`
                  : args.prompt}
              </pre>
            </div>
          )}

          {displayContent && (
            <div className="space-y-1">
              <div className="text-[10px] text-terminal-muted uppercase tracking-wider">Result</div>
              <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-96 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
                {displayContent}
              </pre>
            </div>
          )}

          {hasError && content && (
            <div className="text-[11px] text-red-600">{content.slice(0, 500)}</div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Agent working...</div>
          )}
        </div>
      )}
    </div>
  );
};
