"use client";

import { type FC, useCallback, useState } from "react";
import { CircleNotch, ChatCircleDots, CheckCircle, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { parseNestedJsonString } from "@/lib/utils/parse-nested-json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface AskFollowupQuestionArgs {
  questions?: Question[];
  // Single-question variant (Claude Code sometimes uses flat shape)
  question?: string;
  options?: QuestionOption[];
}

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: AskFollowupQuestionArgs;
  result?: unknown;
  addResult?: (result: unknown) => void;
}>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeArgs(
  raw: AskFollowupQuestionArgs | Record<string, unknown> | string | undefined,
): AskFollowupQuestionArgs | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const parsed = parseNestedJsonString(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeArgs(parsed as Record<string, unknown>);
    }
    return undefined;
  }
  return raw as AskFollowupQuestionArgs;
}

function getQuestions(args: AskFollowupQuestionArgs | undefined): Question[] {
  if (!args) return [];
  if (Array.isArray(args.questions) && args.questions.length > 0) {
    return args.questions;
  }
  // Flat single-question format
  if (args.question && Array.isArray(args.options)) {
    return [
      {
        question: args.question,
        header: "",
        options: args.options,
        multiSelect: false,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AskFollowupQuestionToolUI: ToolCallContentPartComponent = ({
  args: rawArgs,
  result,
  addResult,
}) => {
  const args = normalizeArgs(rawArgs);
  const questions = getQuestions(args);

  // Track selections per question index: single-select stores label, multi-select stores Set of labels
  const [selections, setSelections] = useState<Record<number, string | Set<string>>>({});
  const [submitted, setSubmitted] = useState(false);

  const hasResult = result !== undefined && result !== null;
  const isAnswered = hasResult || submitted;

  const handleSelect = useCallback(
    (qIdx: number, label: string, multiSelect: boolean) => {
      if (isAnswered) return;
      setSelections((prev) => {
        if (multiSelect) {
          const current = (prev[qIdx] instanceof Set ? prev[qIdx] : new Set<string>()) as Set<string>;
          const next = new Set(current);
          if (next.has(label)) next.delete(label);
          else next.add(label);
          return { ...prev, [qIdx]: next };
        }
        return { ...prev, [qIdx]: label };
      });
    },
    [isAnswered],
  );

  const handleSubmit = useCallback(() => {
    if (!addResult || isAnswered) return;
    // Build answers: { [questionText]: selectedLabel(s) }
    const answers: Record<string, string> = {};
    questions.forEach((q, qi) => {
      const sel = selections[qi];
      if (sel instanceof Set) {
        answers[q.question] = Array.from(sel).join(", ");
      } else if (typeof sel === "string") {
        answers[q.question] = sel;
      }
    });
    setSubmitted(true);
    addResult({ answers });
  }, [addResult, isAnswered, questions, selections]);

  // Auto-submit for single-question, single-select
  const handleOptionClick = useCallback(
    (qIdx: number, label: string, multiSelect: boolean) => {
      handleSelect(qIdx, label, multiSelect);
      // Auto-submit for single-select with a single question
      if (!multiSelect && questions.length === 1 && addResult && !isAnswered) {
        const answers: Record<string, string> = { [questions[0].question]: label };
        setSubmitted(true);
        addResult({ answers });
      }
    },
    [handleSelect, questions, addResult, isAnswered],
  );

  // Check if an option is selected
  const isSelected = (qIdx: number, label: string): boolean => {
    const sel = selections[qIdx];
    if (sel instanceof Set) return sel.has(label);
    return sel === label;
  };

  // Check if ready to submit (all questions have at least one selection)
  const canSubmit =
    !isAnswered &&
    questions.length > 0 &&
    questions.every((_, qi) => {
      const sel = selections[qi];
      if (sel instanceof Set) return sel.size > 0;
      return typeof sel === "string" && sel.length > 0;
    });

  // Determine if we need a manual submit button (multi-select or multiple questions)
  const needsSubmitButton =
    questions.length > 1 || questions.some((q) => q.multiSelect);

  // --- Streaming / loading state ---
  if (questions.length === 0 && !isAnswered) {
    return (
      <div className="my-2 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-terminal-border/40 bg-terminal-bg/20 font-mono text-xs text-terminal-muted">
        <ChatCircleDots className="w-4 h-4 animate-pulse text-terminal-amber" weight="duotone" />
        <span>Preparing question...</span>
        <CircleNotch className="w-3.5 h-3.5 animate-spin text-terminal-amber" />
      </div>
    );
  }

  return (
    <div className="my-2 flex flex-col gap-3 max-w-lg">
      {questions.map((q, qi) => (
        <div
          key={qi}
          className={cn(
            "rounded-lg border bg-terminal-bg/30 overflow-hidden",
            isAnswered
              ? "border-terminal-green/30"
              : "border-terminal-amber/40"
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "px-3 py-2 flex items-center gap-2 border-b",
              isAnswered
                ? "bg-terminal-green/5 border-terminal-green/20"
                : "bg-terminal-amber/5 border-terminal-amber/20"
            )}
          >
            {isAnswered ? (
              <CheckCircle className="w-4 h-4 text-terminal-green flex-shrink-0" weight="fill" />
            ) : (
              <ChatCircleDots className="w-4 h-4 text-terminal-amber flex-shrink-0" weight="duotone" />
            )}
            {q.header && (
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-terminal-muted">
                {q.header}
              </span>
            )}
            {q.multiSelect && !isAnswered && (
              <span className="ml-auto text-[10px] font-mono text-terminal-muted">
                Select multiple
              </span>
            )}
          </div>

          {/* Question */}
          <div className="px-3 py-2">
            <p className="text-sm font-mono text-terminal-dark leading-relaxed">
              {q.question}
            </p>
          </div>

          {/* Options */}
          <div className="px-3 pb-3 flex flex-col gap-1.5">
            {q.options.map((opt, oi) => {
              const selected = isSelected(qi, opt.label);
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleOptionClick(qi, opt.label, q.multiSelect)}
                  className={cn(
                    "px-3 py-2 rounded border font-mono text-xs text-left transition-all",
                    isAnswered
                      ? selected
                        ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green"
                        : "border-terminal-border/20 bg-terminal-bg/10 text-terminal-muted opacity-50"
                      : selected
                        ? "border-terminal-amber/60 bg-terminal-amber/10 text-terminal-dark ring-1 ring-terminal-amber/30"
                        : "border-terminal-border/30 bg-white/50 text-terminal-dark hover:border-terminal-amber/40 hover:bg-terminal-amber/5 cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Checkbox/radio indicator */}
                    <div
                      className={cn(
                        "w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors",
                        q.multiSelect ? "rounded-sm" : "rounded-full",
                        isAnswered && selected
                          ? "border-terminal-green bg-terminal-green text-white"
                          : selected
                            ? "border-terminal-amber bg-terminal-amber text-white"
                            : "border-terminal-border/50"
                      )}
                    >
                      {selected && <Check className="w-2.5 h-2.5" weight="bold" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{opt.label}</div>
                      {opt.description && (
                        <div className="text-terminal-muted mt-0.5 text-[11px]">
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Answered indicator */}
          {isAnswered && (
            <div className="px-3 pb-3 border-t border-terminal-green/20">
              <div className="mt-2 text-xs font-mono text-terminal-green">
                Answered
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Submit button for multi-select or multiple questions */}
      {needsSubmitButton && !isAnswered && (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={cn(
            "px-4 py-2 rounded-lg border font-mono text-xs font-semibold transition-all",
            canSubmit
              ? "border-terminal-amber/60 bg-terminal-amber/10 text-terminal-amber hover:bg-terminal-amber/20 cursor-pointer"
              : "border-terminal-border/30 bg-terminal-bg/20 text-terminal-muted cursor-not-allowed"
          )}
        >
          Submit
        </button>
      )}
    </div>
  );
};
