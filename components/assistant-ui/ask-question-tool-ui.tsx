"use client";

import { type FC, useCallback, useState } from "react";
import { CircleNotch, ChatCircleDots, CheckCircle, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { parseNestedJsonString } from "@/lib/utils/parse-nested-json";
import { useChatSessionId } from "@/components/chat-provider";

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
  toolCallId: string;
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

async function submitAnswersToServer(
  sessionId: string,
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch("/api/chat/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        toolUseId: toolCallId,
        answers,
      }),
    });
    if (!res.ok) {
      console.error("[AskQuestionUI] Server returned error:", res.status);
      return false;
    }
    const data = await res.json();
    return data.resolved === true;
  } catch (err) {
    console.error("[AskQuestionUI] Failed to submit answers:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AskFollowupQuestionToolUI: ToolCallContentPartComponent = ({
  toolCallId,
  args: rawArgs,
  result,
  addResult,
}) => {
  const sessionId = useChatSessionId();
  const args = normalizeArgs(rawArgs);
  const questions = getQuestions(args);

  // Track selections per question index: single-select stores label, multi-select stores Set of labels
  const [selections, setSelections] = useState<Record<number, string | Set<string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Only treat as answered when the USER has submitted (not when the SDK auto-populates result)
  const isAnswered = submitted;

  const handleSelect = useCallback(
    (qIdx: number, label: string, multiSelect: boolean) => {
      if (isAnswered || submitting) return;
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
    [isAnswered, submitting],
  );

  const doSubmit = useCallback(
    async (answers: Record<string, string>) => {
      if (isAnswered || submitting) return;
      setSubmitting(true);

      // If we have a sessionId (claudecode provider), POST to server
      if (sessionId && toolCallId) {
        await submitAnswersToServer(sessionId, toolCallId, answers);
      }
      // Also call addResult so the UI state updates
      if (addResult) {
        addResult({ answers });
      }
      setSubmitted(true);
      setSubmitting(false);
    },
    [isAnswered, submitting, sessionId, toolCallId, addResult],
  );

  const handleSubmit = useCallback(() => {
    if (isAnswered || submitting) return;
    const answers: Record<string, string> = {};
    questions.forEach((q, qi) => {
      const sel = selections[qi];
      if (sel instanceof Set) {
        answers[q.question] = Array.from(sel).join(", ");
      } else if (typeof sel === "string") {
        answers[q.question] = sel;
      }
    });
    doSubmit(answers);
  }, [isAnswered, submitting, questions, selections, doSubmit]);

  // Auto-submit for single-question, single-select
  const handleOptionClick = useCallback(
    (qIdx: number, label: string, multiSelect: boolean) => {
      handleSelect(qIdx, label, multiSelect);
      if (!multiSelect && questions.length === 1 && !isAnswered && !submitting) {
        const answers: Record<string, string> = { [questions[0].question]: label };
        doSubmit(answers);
      }
    },
    [handleSelect, questions, isAnswered, submitting, doSubmit],
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
    !submitting &&
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
            "rounded-lg border overflow-hidden bg-card",
            isAnswered
              ? "border-terminal-green/30"
              : "border-border"
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "px-3 py-2 flex items-center gap-2 border-b",
              isAnswered
                ? "bg-terminal-green/10 border-terminal-green/20"
                : "bg-muted/50 border-border"
            )}
          >
            {isAnswered ? (
              <CheckCircle className="w-4 h-4 text-terminal-green flex-shrink-0" weight="fill" />
            ) : (
              <ChatCircleDots className="w-4 h-4 text-terminal-amber flex-shrink-0" weight="duotone" />
            )}
            {q.header && (
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                {q.header}
              </span>
            )}
            {q.multiSelect && !isAnswered && (
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                Select multiple
              </span>
            )}
          </div>

          {/* Question */}
          <div className="px-3 py-2">
            <p className="text-sm font-mono text-foreground leading-relaxed">
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
                  disabled={isAnswered || submitting}
                  onClick={() => handleOptionClick(qi, opt.label, q.multiSelect)}
                  className={cn(
                    "px-3 py-2 rounded border font-mono text-xs text-left transition-all",
                    isAnswered
                      ? selected
                        ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green"
                        : "border-border/50 bg-muted/30 text-muted-foreground opacity-50"
                      : selected
                        ? "border-terminal-amber/60 bg-terminal-amber/10 text-foreground ring-1 ring-terminal-amber/30"
                        : "border-border bg-card text-foreground hover:border-terminal-amber/40 hover:bg-terminal-amber/5 cursor-pointer"
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
                            : "border-border"
                      )}
                    >
                      {selected && <Check className="w-2.5 h-2.5" weight="bold" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{opt.label}</div>
                      {opt.description && (
                        <div className="text-muted-foreground mt-0.5 text-[11px]">
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
              : "border-border bg-muted/30 text-muted-foreground cursor-not-allowed"
          )}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <CircleNotch className="w-3.5 h-3.5 animate-spin" />
              Submitting...
            </span>
          ) : (
            "Submit"
          )}
        </button>
      )}
    </div>
  );
};
