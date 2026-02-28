"use client";

import { memo, useMemo, useState, type FC } from "react";
import {
  Globe,
  CursorClick,
  TextT,
  TreeStructure,
  Code,
  Eye,
  X,
  CaretDown,
  CaretRight,
  CheckCircle,
  XCircle,
  CircleNotch,
  Play,
  ArrowRight,
  Clock,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: ChromiumWorkspaceArgs;
  result?: ChromiumWorkspaceResult;
  state?: string;
}>;

interface ChromiumWorkspaceArgs {
  action?: string;
  url?: string;
  selector?: string;
  text?: string;
  expression?: string;
  timeout?: number;
}

interface ActionRecord {
  seq: number;
  timestamp: string;
  action: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  durationMs: number;
  pageUrl?: string;
  pageTitle?: string;
  domSnapshot?: string;
  error?: string;
}

interface HistorySummary {
  sessionId: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  totalDurationMs?: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actions?: ActionRecord[];
}

interface ChromiumWorkspaceResult {
  status: "success" | "error";
  action?: string;
  durationMs?: number;
  data?: unknown;
  pageUrl?: string;
  pageTitle?: string;
  error?: string;
}

// ─── Action icon mapping ──────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, typeof Globe> = {
  open: Globe,
  navigate: ArrowRight,
  click: CursorClick,
  type: TextT,
  snapshot: TreeStructure,
  extract: Eye,
  replay: Play,
  evaluate: Code,
  close: X,
};

function getActionIcon(action: string) {
  return ACTION_ICONS[action] ?? Globe;
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    open: "Open",
    navigate: "Navigate",
    click: "Click",
    type: "Type",
    snapshot: "Snapshot",
    extract: "Extract",
    evaluate: "Evaluate",
    close: "Close",
    replay: "Replay",
  };
  return labels[action] ?? action;
}

// ─── Action summary ───────────────────────────────────────────────────────────

function getActionSummary(args?: ChromiumWorkspaceArgs): string {
  if (!args?.action) return "Browser action";

  switch (args.action) {
    case "open":
    case "navigate":
      return args.url
        ? truncateUrl(args.url, 50)
        : args.action === "open" ? "Opening browser..." : "Navigating...";
    case "click":
      return args.selector ? `→ ${args.selector}` : "Clicking...";
    case "type":
      return args.selector
        ? `→ ${args.selector}: "${(args.text ?? "").slice(0, 30)}${(args.text?.length ?? 0) > 30 ? "..." : ""}"`
        : "Typing...";
    case "snapshot":
      return "Capturing accessibility tree";
    case "extract":
      return args.selector ? `→ ${args.selector}` : "Extracting...";
    case "evaluate":
      return args.expression
        ? `${args.expression.slice(0, 40)}${args.expression.length > 40 ? "..." : ""}`
        : "Running JS...";
    case "close":
      return "Closing session";
    default:
      return args.action;
  }
}

function formatUnknown(value: unknown, maxLen: number): string {
  if (typeof value === "string") return value.slice(0, maxLen);
  try {
    return (JSON.stringify(value, null, 2) ?? "null").slice(0, maxLen);
  } catch {
    return String(value).slice(0, maxLen);
  }
}

function truncateUrl(url: string, maxLen: number): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > maxLen
      ? display.slice(0, maxLen) + "..."
      : display;
  } catch {
    return url.slice(0, maxLen);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single action row in the execution timeline */
const ActionTimelineRow: FC<{
  record: ActionRecord;
  isExpanded: boolean;
  onToggle: () => void;
}> = memo(({ record, isExpanded, onToggle }) => {
  const Icon = getActionIcon(record.action);

  return (
    <div className="group">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-terminal-dark/5 transition-colors"
      >
        {/* Expand indicator */}
        {isExpanded ? (
          <CaretDown className="size-3 text-terminal-muted shrink-0" weight="bold" />
        ) : (
          <CaretRight className="size-3 text-terminal-muted shrink-0" weight="bold" />
        )}

        {/* Sequence number */}
        <span className="text-[10px] text-terminal-muted/60 font-mono w-4 shrink-0 text-right">
          {record.seq}
        </span>

        {/* Action icon */}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            record.success ? "text-terminal-green" : "text-red-500"
          )}
          weight="bold"
        />

        {/* Action label + summary */}
        <span className="text-xs font-mono text-terminal-dark truncate">
          <span className="font-medium">{getActionLabel(record.action)}</span>
          {record.pageUrl && (
            <span className="text-terminal-muted ml-1.5">
              {truncateUrl(record.pageUrl, 35)}
            </span>
          )}
        </span>

        {/* Status + duration */}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {record.success ? (
            <CheckCircle className="size-3 text-terminal-green" weight="fill" />
          ) : (
            <XCircle className="size-3 text-red-500" weight="fill" />
          )}
          <span className="text-[10px] text-terminal-muted/60 font-mono">
            {record.durationMs}ms
          </span>
        </span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="ml-9 mr-2 mb-1 space-y-1">
          {/* Input params */}
          {Object.keys(record.input).length > 1 && (
            <div className="text-[10px] font-mono text-terminal-muted">
              <span className="text-terminal-muted/60">input: </span>
              <span className="text-terminal-dark">
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(record.input).filter(([k]) => k !== "action")
                  )
                )}
              </span>
            </div>
          )}

          {/* Output preview */}
          {record.output != null && (
            <details className="text-[10px] font-mono text-terminal-muted">
              <summary className="cursor-pointer hover:text-terminal-dark">
                output
              </summary>
              <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-terminal-dark/5 p-1.5 text-terminal-dark whitespace-pre-wrap break-words">
                {formatUnknown(record.output, 1000)}
              </pre>
            </details>
          )}

          {/* DOM Snapshot preview */}
          {record.domSnapshot && (
            <details className="text-[10px] font-mono text-terminal-muted">
              <summary className="cursor-pointer hover:text-terminal-dark">
                dom snapshot ({record.domSnapshot.length} chars)
              </summary>
              <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-terminal-dark/5 p-1.5 text-terminal-dark whitespace-pre-wrap break-words">
                {record.domSnapshot.slice(0, 1000)}
              </pre>
            </details>
          )}

          {/* Error message */}
          {record.error && (
            <div className="text-[10px] font-mono text-red-600 bg-red-50 rounded p-1.5">
              {record.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
ActionTimelineRow.displayName = "ActionTimelineRow";

/** Full execution history panel (shown on close) */
const ExecutionHistory: FC<{ history: HistorySummary }> = memo(({ history }) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showTimeline, setShowTimeline] = useState(true);

  const toggleRow = (seq: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="flex items-center gap-1 text-terminal-green">
          <CheckCircle className="size-3" weight="fill" />
          {history.successfulActions}
        </span>
        {history.failedActions > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <XCircle className="size-3" weight="fill" />
            {history.failedActions}
          </span>
        )}
        {history.totalDurationMs != null && (
          <span className="flex items-center gap-1 text-terminal-muted">
            <Clock className="size-3" />
            {(history.totalDurationMs / 1000).toFixed(1)}s total
          </span>
        )}
        {history.agentId && (
          <span className="text-terminal-muted/60 text-[10px] ml-auto truncate max-w-[120px]">
            agent: {history.agentId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Timeline toggle */}
      {history.actions && history.actions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowTimeline(!showTimeline)}
            className="flex items-center gap-1 text-xs font-mono text-terminal-muted hover:text-terminal-dark transition-colors"
          >
            {showTimeline ? (
              <CaretDown className="size-3" weight="bold" />
            ) : (
              <CaretRight className="size-3" weight="bold" />
            )}
            <Play className="size-3" weight="fill" />
            Execution Timeline ({history.actions.length} actions)
          </button>

          {showTimeline && (
            <div className="rounded-lg border border-terminal-dark/10 bg-white/50 divide-y divide-terminal-dark/5">
              {history.actions.map((record) => (
                <ActionTimelineRow
                  key={record.seq}
                  record={record}
                  isExpanded={expandedRows.has(record.seq)}
                  onToggle={() => toggleRow(record.seq)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});
ExecutionHistory.displayName = "ExecutionHistory";

// ─── Main Component ───────────────────────────────────────────────────────────

export const ChromiumWorkspaceToolUI: ToolCallContentPartComponent = memo(({
  args,
  result,
}) => {
  const isRunning = result === undefined;
  const parsed = result as ChromiumWorkspaceResult | undefined;
  const isClose = args?.action === "close";
  const isReplay = args?.action === "replay";
  const isError = parsed?.status === "error";

  // Extract history from close action result
  const history = useMemo<HistorySummary | null>(() => {
    if (!isClose || !parsed?.data) return null;
    const d = parsed.data as { history?: HistorySummary };
    return d.history ?? null;
  }, [isClose, parsed]);

  // Extract replay results
  const replayData = useMemo(() => {
    if (!isReplay || !parsed?.data) return null;
    return parsed.data as {
      message?: string;
      totalActions?: number;
      successfulActions?: number;
      failedActions?: number;
      outputMatchCount?: number | null;
      aborted?: boolean;
      results?: Array<{
        action: string;
        seq: number;
        originalOutput: unknown;
        replayOutput: unknown;
        outputMatches: boolean;
        success: boolean;
        error?: string;
      }>;
    };
  }, [isReplay, parsed]);

  const ActionIcon = getActionIcon(args?.action ?? "open");
  const summary = getActionSummary(args);

  return (
    <div
      className={cn(
        "my-2 rounded-lg bg-terminal-cream/80 p-3 font-mono shadow-sm transition-all duration-150",
        isRunning && "animate-pulse"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        {isRunning ? (
          <CircleNotch
            className="size-4 animate-spin text-terminal-green"
            weight="bold"
          />
        ) : isError ? (
          <XCircle className="size-4 text-red-500" weight="fill" />
        ) : (
          <ActionIcon className="size-4 text-terminal-green" weight="bold" />
        )}

        <span className="text-sm font-medium text-terminal-dark">
          {isClose ? "Browser Session" : getActionLabel(args?.action ?? "")}
        </span>

        {/* Status badge */}
        <span
          className={cn(
            "ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            isRunning
              ? "bg-terminal-green/10 text-terminal-green"
              : isError
                ? "bg-red-50 text-red-600"
                : "bg-terminal-green/10 text-terminal-green"
          )}
        >
          {isRunning ? "running" : isError ? "failed" : "done"}
        </span>

        {/* Duration */}
        {parsed?.durationMs != null && (
          <span className="text-[10px] text-terminal-muted/60">
            {parsed.durationMs}ms
          </span>
        )}
      </div>

      {/* Action summary (non-close) */}
      {!isClose && (
        <div className="text-xs text-terminal-muted ml-6 mb-1 truncate">
          {summary}
        </div>
      )}

      {/* Page info */}
      {parsed?.pageUrl && !isClose && (
        <div className="text-[10px] text-terminal-muted/60 ml-6 truncate">
          {parsed.pageTitle && (
            <span className="text-terminal-dark mr-2">{parsed.pageTitle}</span>
          )}
          {truncateUrl(parsed.pageUrl, 60)}
        </div>
      )}

      {/* Error display */}
      {isError && parsed?.error && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600 font-mono">
          {parsed.error}
        </div>
      )}

      {/* Snapshot data (collapsible) */}
      {!isClose && parsed?.data != null && typeof parsed.data === "object" && "accessibilityTree" in (parsed.data as Record<string, unknown>) && (
        <details className="mt-2 text-xs text-terminal-muted">
          <summary className="cursor-pointer hover:text-terminal-dark ml-6">
            View accessibility tree
          </summary>
          <pre className="mt-1 ml-6 max-h-48 overflow-y-auto rounded bg-terminal-dark/5 p-2 text-[10px] text-terminal-dark whitespace-pre-wrap break-words">
            {((parsed.data as Record<string, unknown>).accessibilityTree as string)?.slice(0, 3000)}
          </pre>
        </details>
      )}

      {/* Extract/evaluate data (collapsible) */}
      {!isClose && parsed?.data != null && typeof parsed.data === "string" && (parsed.data as string).length > 80 && (
        <details className="mt-2 text-xs text-terminal-muted">
          <summary className="cursor-pointer hover:text-terminal-dark ml-6">
            View output
          </summary>
          <pre className="mt-1 ml-6 max-h-48 overflow-y-auto rounded bg-terminal-dark/5 p-2 text-[10px] text-terminal-dark whitespace-pre-wrap break-words">
            {(parsed.data as string).slice(0, 3000)}
          </pre>
        </details>
      )}

      {/* Execution History (close action with full history) */}
      {isClose && history && (
        <div className="mt-2 border-t border-terminal-dark/10 pt-2">
          <ExecutionHistory history={history} />
        </div>
      )}

      {/* Replay Results */}
      {isReplay && replayData && (
        <div className="mt-2 border-t border-terminal-dark/10 pt-2 space-y-2">
          <div className="text-xs font-mono text-terminal-dark">
            {replayData.message}
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1 text-terminal-green">
              <CheckCircle className="size-3" weight="fill" />
              {replayData.successfulActions ?? 0}
            </span>
            {(replayData.failedActions ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="size-3" weight="fill" />
                {replayData.failedActions}
              </span>
            )}
            {replayData.outputMatchCount != null && (
              <span className="text-terminal-muted">
                {replayData.outputMatchCount}/{replayData.totalActions} outputs match
              </span>
            )}
            {replayData.aborted && (
              <span className="text-red-500 text-[10px]">ABORTED</span>
            )}
          </div>
          {replayData.results && replayData.results.length > 0 && (
            <details className="text-xs text-terminal-muted">
              <summary className="cursor-pointer hover:text-terminal-dark">
                View replay details ({replayData.results.length} actions)
              </summary>
              <div className="mt-1 space-y-1">
                {replayData.results.map((r) => (
                  <div
                    key={r.seq}
                    className={cn(
                      "flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono",
                      r.success ? "text-terminal-dark" : "text-red-600 bg-red-50/50"
                    )}
                  >
                    <span className="w-4 text-right text-terminal-muted/60">{r.seq}</span>
                    {r.success ? (
                      <CheckCircle className="size-2.5 text-terminal-green shrink-0" weight="fill" />
                    ) : (
                      <XCircle className="size-2.5 text-red-500 shrink-0" weight="fill" />
                    )}
                    <span>{getActionLabel(r.action)}</span>
                    {r.outputMatches === false && (
                      <span className="text-amber-600 ml-auto">output mismatch</span>
                    )}
                    {r.error && (
                      <span className="text-red-500 ml-auto truncate max-w-[200px]">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
});
ChromiumWorkspaceToolUI.displayName = "ChromiumWorkspaceToolUI";
