"use client";

import { useEffect, useState, type FC } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalPlan, type PlanStep } from "./plan-context";

// ---------------------------------------------------------------------------
// Status glyph + style map
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<PlanStep["status"], { glyph: string; color: string; textClass: string }> = {
  pending:     { glyph: "[ ]", color: "text-terminal-muted",  textClass: "text-terminal-muted" },
  in_progress: { glyph: "[>]", color: "text-terminal-amber",  textClass: "text-terminal-amber font-semibold" },
  completed:   { glyph: "[x]", color: "text-terminal-green",  textClass: "text-terminal-green" },
  canceled:    { glyph: "[-]", color: "text-terminal-muted",  textClass: "text-terminal-muted line-through" },
};

const STORAGE_KEY = "seline-plan-panel-collapsed";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sticky plan panel rendered at the top of the thread viewport.
 * Reads plan state from PlanContext. Renders nothing when no plan exists.
 */
export const PlanPanel: FC = () => {
  const ctx = useOptionalPlan();
  const plan = ctx?.plan ?? null;

  // Collapse state — persisted to localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 w-full max-w-4xl mx-auto mb-3">
      <div className="rounded-lg border border-terminal-border/50 bg-terminal-cream/95 backdrop-blur-sm shadow-sm overflow-hidden">
        {/* Header row */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-terminal-dark/5 transition-colors"
        >
          <span className="font-mono text-xs font-semibold text-terminal-dark uppercase tracking-wider">
            Plan
            <span className="ml-2 text-terminal-muted font-normal normal-case">v{plan.version}</span>
          </span>
          {collapsed
            ? <ChevronDownIcon className="size-3.5 text-terminal-muted" />
            : <ChevronUpIcon  className="size-3.5 text-terminal-muted" />
          }
        </button>

        {/* Steps list — hidden when collapsed */}
        {!collapsed && (
          <div className="border-t border-terminal-border/30 px-3 py-2 space-y-1">
            {plan.steps.map((step) => {
              const cfg = STATUS_CONFIG[step.status];
              return (
                <div key={step.id} className="flex items-start gap-2">
                  <span className={cn("font-mono text-xs shrink-0 mt-0.5", cfg.color)}>
                    {cfg.glyph}
                  </span>
                  <span className={cn("font-mono text-sm", cfg.textClass)}>
                    {step.text}
                  </span>
                </div>
              );
            })}

            {/* Explanation note */}
            {plan.explanation && (
              <p className="mt-2 pt-2 border-t border-terminal-border/20 font-mono text-xs italic text-terminal-muted">
                Plan updated: {plan.explanation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
