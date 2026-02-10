"use client";

import { useState, type FC } from "react";
import { ClipboardListIcon, AlertCircleIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type PlanStep, type PlanState } from "./plan-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpdatePlanArgs {
  steps: Array<{ id?: string; text: string; status?: string }>;
  explanation?: string;
  mode?: "replace" | "merge";
}

interface UpdatePlanResult {
  status: "success" | "error";
  plan?: PlanState;
  warnings?: string[];
  error?: string;
}

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args: UpdatePlanArgs;
  result?: UpdatePlanResult;
}>;

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<PlanStep["status"], { glyph: string; color: string; textClass: string }> = {
  pending:     { glyph: "[ ]", color: "text-terminal-muted",  textClass: "text-terminal-muted" },
  in_progress: { glyph: "[>]", color: "text-terminal-amber",  textClass: "text-terminal-amber font-semibold" },
  completed:   { glyph: "[x]", color: "text-terminal-green",  textClass: "text-terminal-green" },
  canceled:    { glyph: "[-]", color: "text-terminal-muted",  textClass: "text-terminal-muted line-through" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact collapsible chip for updatePlan tool results.
 * Collapsed: single row with version + status counts.
 * Expanded: full step list beneath a left border.
 */
export const PlanToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const [expanded, setExpanded] = useState(false);

  // --- Loading state ---
  if (!result) {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-terminal-border/40 bg-terminal-bg/20 font-mono text-xs text-terminal-muted">
        <ClipboardListIcon className="w-3.5 h-3.5 animate-pulse text-terminal-amber" />
        <span>{args?.mode === "merge" ? "Updating plan…" : "Creating plan…"}</span>
        <div className="w-3.5 h-3.5 rounded-full border border-terminal-amber/40 border-t-terminal-amber animate-spin" />
      </div>
    );
  }

  // --- Error state ---
  if (result.status === "error") {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-red-200 bg-red-50/60 font-mono text-xs text-red-600">
        <AlertCircleIcon className="w-3.5 h-3.5" />
        <span>Plan error: {result.error}</span>
      </div>
    );
  }

  // --- Success state ---
  const plan = result.plan;
  // Defensive check: ensure plan exists and has a valid steps array
  if (!plan || !plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;

  const counts = { completed: 0, in_progress: 0, pending: 0, canceled: 0 };
  plan.steps.forEach((s) => { counts[s.status]++; });

  return (
    <div className="my-1">
      {/* Compact header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-terminal-border/40 bg-terminal-bg/20 hover:bg-terminal-bg/40 transition-colors font-mono text-xs"
      >
        <ClipboardListIcon className="w-3.5 h-3.5 text-terminal-green" />
        <span className="text-terminal-dark font-semibold">Plan</span>
        <span className="text-terminal-muted">v{plan.version}</span>
        <span className="text-terminal-border/50">·</span>
        {counts.completed > 0   && <span className="text-terminal-green">✓ {counts.completed}</span>}
        {counts.in_progress > 0 && <span className="text-terminal-amber">▸ {counts.in_progress}</span>}
        {counts.pending > 0     && <span className="text-terminal-muted">○ {counts.pending}</span>}
        {expanded
          ? <ChevronUpIcon   className="w-3 h-3 text-terminal-muted" />
          : <ChevronDownIcon className="w-3 h-3 text-terminal-muted" />
        }
      </button>

      {/* Step list — shown when expanded */}
      {expanded && (
        <div className="mt-1.5 ml-0.5 border-l-2 border-terminal-border/30 pl-3 space-y-0.5">
          {plan.steps.map((step) => {
            const cfg = STATUS_CONFIG[step.status];
            return (
              <div key={step.id} className="flex items-baseline gap-2">
                <span className={cn("font-mono text-xs shrink-0", cfg.color)}>{cfg.glyph}</span>
                <span className={cn("font-mono text-sm", cfg.textClass)}>{step.text}</span>
              </div>
            );
          })}
          {plan.explanation && (
            <p className="mt-1.5 font-mono text-xs italic text-terminal-muted">{plan.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
};
