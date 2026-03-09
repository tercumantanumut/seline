"use client";

/**
 * Lightweight custom UIs for Claude Code tools that don't need
 * full expandable card treatment. These render as compact inline
 * status rows matching the style of the other claude-code-tools.
 */

import { type FC, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  ListTodoIcon,
  MapIcon,
  CheckIcon,
  GitBranchIcon,
  MessageCircleQuestionIcon,
  ZapIcon,
  ClipboardListIcon,
  SquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolExpansion } from "../tool-expansion-context";

// Shared type
type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}>;

// Shared helpers
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
  return false;
}

function useGlobalExpansion() {
  const [expanded, setExpanded] = useState(false);
  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setExpanded(expansionCtx.signal.mode === "expand");
  }, [expansionCtx?.signal]);
  return { expanded, setExpanded };
}

// Reusable compact card shell
function CompactToolCard({
  icon: Icon,
  label,
  detail,
  isRunning,
  hasError,
  expandedContent,
}: {
  icon: FC<{ className?: string }>;
  label: string;
  detail?: string;
  isRunning: boolean;
  hasError: boolean;
  expandedContent?: string;
}) {
  const { expanded, setExpanded } = useGlobalExpansion();
  const hasExpandable = !!expandedContent;

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
        onClick={() => hasExpandable && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 transition-colors text-left",
          hasExpandable && "hover:bg-accent/30 cursor-pointer",
          !hasExpandable && "cursor-default"
        )}
      >
        {StatusIcon && <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />}
        {!StatusIcon && <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-terminal-muted animate-pulse" />}
        <Icon className="h-3 w-3 shrink-0 text-terminal-muted" />
        <span className="text-terminal-muted">{label}</span>
        {detail && (
          <span className="font-medium text-terminal-dark truncate min-w-0 flex-1" title={detail}>{detail}</span>
        )}
        {hasExpandable && (
          expanded ? (
            <ChevronDownIcon className="h-3 w-3 shrink-0 text-terminal-muted ml-auto" />
          ) : (
            <ChevronRightIcon className="h-3 w-3 shrink-0 text-terminal-muted ml-auto" />
          )
        )}
      </button>
      {expanded && expandedContent && (
        <div className="border-t border-border px-3 py-2">
          <pre className="rounded bg-terminal-dark/5 p-2 overflow-x-auto max-h-48 overflow-y-auto text-terminal-dark whitespace-pre-wrap break-all font-mono text-[11px]">
            {expandedContent.length > 3000
              ? expandedContent.substring(0, 3000) + `\n\n... [${(expandedContent.length - 3000).toLocaleString()} more characters]`
              : expandedContent}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * TodoWrite — Claude Code's task list tool
 */
export const ClaudeTodoWriteToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const todos = Array.isArray(args?.todos) ? args.todos as Array<{ content?: string; status?: string }> : [];
  const todoCount = todos.length;
  const completedCount = todos.filter(t => t.status === "completed").length;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  const detail = todoCount > 0
    ? `${completedCount}/${todoCount} tasks`
    : undefined;

  return (
    <CompactToolCard
      icon={ListTodoIcon}
      label={isRunning ? "Updating tasks..." : hasError ? "Task update failed" : "Updated tasks"}
      detail={detail}
      isRunning={isRunning}
      hasError={hasError}
      expandedContent={todos.length > 0
        ? todos.map(t => `${t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○"} ${t.content || ""}`).join("\n")
        : undefined}
    />
  );
};

/**
 * EnterPlanMode — Claude Code's planning mode trigger
 */
export const ClaudeEnterPlanModeToolUI: ToolCallContentPartComponent = ({ result }) => {
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={MapIcon}
      label={isRunning ? "Entering plan mode..." : hasError ? "Plan mode failed" : "Plan mode"}
      isRunning={isRunning}
      hasError={hasError}
    />
  );
};

/**
 * ExitPlanMode — Claude Code's plan approval step
 */
export const ClaudeExitPlanModeToolUI: ToolCallContentPartComponent = ({ result }) => {
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={CheckIcon}
      label={isRunning ? "Awaiting plan approval..." : hasError ? "Plan rejected" : "Plan approved"}
      isRunning={isRunning}
      hasError={hasError}
    />
  );
};

/**
 * EnterWorktree — Claude Code's git worktree creation
 */
export const ClaudeEnterWorktreeToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const name = typeof args?.name === "string" ? args.name : undefined;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={GitBranchIcon}
      label={isRunning ? "Creating worktree..." : hasError ? "Worktree failed" : "Worktree created"}
      detail={name}
      isRunning={isRunning}
      hasError={hasError}
    />
  );
};

/**
 * AskUserQuestion — Claude Code's interactive question tool
 */
export const ClaudeAskUserQuestionToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const questions = Array.isArray(args?.questions) ? args.questions as Array<{ question?: string }> : [];
  const firstQ = questions[0]?.question;
  const detail = firstQ
    ? (firstQ.length > 80 ? firstQ.substring(0, 80) + "..." : firstQ)
    : undefined;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={MessageCircleQuestionIcon}
      label={isRunning ? "Asking..." : hasError ? "Question failed" : "Asked"}
      detail={detail}
      isRunning={isRunning}
      hasError={hasError}
      expandedContent={parseTextResult(result)}
    />
  );
};

/**
 * Skill — Claude Code's skill invocation
 */
export const ClaudeSkillToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const skill = typeof args?.skill === "string" ? args.skill : undefined;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={ZapIcon}
      label={isRunning ? "Running skill..." : hasError ? "Skill failed" : "Skill"}
      detail={skill}
      isRunning={isRunning}
      hasError={hasError}
      expandedContent={parseTextResult(result)}
    />
  );
};

/**
 * TaskOutput — Claude Code's task output reader
 */
export const ClaudeTaskOutputToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const taskId = typeof args?.task_id === "string" ? args.task_id : undefined;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);
  const content = parseTextResult(result);

  return (
    <CompactToolCard
      icon={ClipboardListIcon}
      label={isRunning ? "Reading task..." : hasError ? "Task read failed" : "Task output"}
      detail={taskId ? `#${taskId.slice(0, 8)}` : undefined}
      isRunning={isRunning}
      hasError={hasError}
      expandedContent={content}
    />
  );
};

/**
 * TaskStop — Claude Code's task stop tool
 */
export const ClaudeTaskStopToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const taskId = typeof args?.task_id === "string" ? args.task_id : undefined;
  const isRunning = result === undefined;
  const hasError = isErrorResult(result);

  return (
    <CompactToolCard
      icon={SquareIcon}
      label={isRunning ? "Stopping task..." : hasError ? "Stop failed" : "Task stopped"}
      detail={taskId ? `#${taskId.slice(0, 8)}` : undefined}
      isRunning={isRunning}
      hasError={hasError}
    />
  );
};
