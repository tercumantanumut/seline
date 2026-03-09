"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XCircleIcon, BookOpenIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    notebook_path?: string;
    new_source?: string;
    cell_id?: string;
    cell_type?: string;
    edit_mode?: string;
  };
  result?: unknown;
}>;

function parseResultText(result: unknown): string | undefined {
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
    if (typeof r.message === "string") return r.message;
  }
  return undefined;
}

function isErrorResult(result: unknown): boolean {
  if (!result) return false;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.isError === true) return true;
  }
  const text = parseResultText(result);
  if (text && /^(error|failed)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `NotebookEdit` tool.
 * Shows notebook file name, cell edit info, and source preview.
 */
export const ClaudeNotebookEditToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);

  const filePath = args?.notebook_path || "";
  const fileName = filePath.split("/").pop() || filePath;
  const editMode = args?.edit_mode || "replace";
  const cellType = args?.cell_type;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  const actionLabel = editMode === "insert"
    ? "Insert cell"
    : editMode === "delete"
      ? "Delete cell"
      : "Edit cell";

  const StatusIcon = isRunning ? null : hasError ? XCircleIcon : CheckCircleIcon;
  const statusColor = isRunning
    ? "text-terminal-muted"
    : hasError
      ? "text-red-600"
      : "text-emerald-600";

  const newSource = args?.new_source || "";
  const lineCount = newSource ? newSource.split("\n").length : 0;

  return (
    <div className="my-1 rounded-md border border-border bg-terminal-cream/50 font-mono text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <BookOpenIcon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">
          {isRunning ? `${actionLabel}...` : hasError ? `${actionLabel} failed` : actionLabel}
        </span>
        <span className="font-medium text-terminal-dark truncate min-w-0 flex-1" title={fileName}>{fileName}</span>

        {cellType && (
          <span className="text-[10px] text-terminal-muted shrink-0 bg-terminal-dark/5 rounded px-1 py-0.5">
            {cellType}
          </span>
        )}

        {lineCount > 0 && editMode !== "delete" && (
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

          {newSource && (
            <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-64 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
              {newSource.length > 5000
                ? newSource.substring(0, 5000) + `\n\n... [${(newSource.length - 5000).toLocaleString()} more characters]`
                : newSource}
            </pre>
          )}

          {result !== undefined && (
            <div className={cn("text-[11px]", statusColor)}>
              {parseResultText(result) || (hasError ? "Edit failed" : "Cell updated")}
            </div>
          )}

          {isRunning && (
            <div className="text-terminal-muted animate-pulse">Editing notebook...</div>
          )}
        </div>
      )}
    </div>
  );
};
