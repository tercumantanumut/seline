"use client";

import { type FC, useCallback, useMemo, useState } from "react";
import { CheckCircle, CircleNotch, NotePencil, MapTrifold } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { parseNestedJsonString } from "@/lib/utils/parse-nested-json";
import { useChatSessionId } from "@/components/chat-provider";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  toolCallId: string;
  argsText?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  addResult?: (result: unknown) => void;
}>;

interface PromptOption {
  label: string;
  description?: string;
}

interface PlanApprovalArgs {
  type?: string;
  toolName?: string;
  question?: string;
  plan?: string;
  options?: PromptOption[];
}

interface PlanApprovalResult {
  status?: string;
  action?: string;
  approved?: boolean;
  message?: string;
}

function normalizeArgs(raw: Record<string, unknown> | string | undefined): PlanApprovalArgs | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const parsed = parseNestedJsonString(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeArgs(parsed as Record<string, unknown>);
    }
    return undefined;
  }
  return raw as PlanApprovalArgs;
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
      body: JSON.stringify({ sessionId, toolUseId: toolCallId, answers }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.resolved === true;
  } catch {
    return false;
  }
}

export const PlanApprovalToolUI: ToolCallContentPartComponent = ({
  toolCallId,
  args: rawArgs,
  argsText,
  result,
  addResult,
}) => {
  const sessionId = useChatSessionId();
  const args = useMemo(() => normalizeArgs(rawArgs ?? argsText), [rawArgs, argsText]);
  const plan = typeof args?.plan === "string" ? args.plan.trim() : "";
  const question = args?.question?.trim() || "Review the plan and choose how to continue.";
  const options = Array.isArray(args?.options) && args.options.length > 0
    ? args.options
    : [
        { label: "Approve & Continue", description: "Approve this plan and start implementation." },
        { label: "Reject / Edit", description: "Send feedback and keep the agent in planning mode." },
      ];

  const existingResult = (result && typeof result === "object" ? result : undefined) as PlanApprovalResult | undefined;
  const isResolved = existingResult?.approved === true || existingResult?.action === "Reject / Edit";
  const [selectedAction, setSelectedAction] = useState<string>(existingResult?.action ?? "");
  const [feedback, setFeedback] = useState(existingResult?.message ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (answers: Record<string, string>) => {
      if (submitting || isResolved) return;
      setSubmitting(true);
      try {
        if (sessionId && toolCallId) {
          const ok = await submitAnswersToServer(sessionId, toolCallId, answers);
          if (!ok) return;
        }
        addResult?.({
          status: answers.action === "Approve & Continue" ? "success" : "cancelled",
          action: answers.action,
          approved: answers.action === "Approve & Continue",
          ...(answers.message ? { message: answers.message } : {}),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [addResult, isResolved, sessionId, submitting, toolCallId],
  );

  const handleApprove = useCallback(() => {
    setSelectedAction("Approve & Continue");
    void submit({ action: "Approve & Continue" });
  }, [submit]);

  const handleReject = useCallback(() => {
    setSelectedAction("Reject / Edit");
    void submit({ action: "Reject / Edit", ...(feedback.trim() ? { message: feedback.trim() } : {}) });
  }, [feedback, submit]);

  if (!args && !isResolved) {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded border border-terminal-border/40 bg-terminal-bg/20 px-3 py-2 font-mono text-xs text-terminal-muted">
        <MapTrifold className="h-4 w-4 text-terminal-amber" weight="duotone" />
        <span>Preparing plan review...</span>
        <CircleNotch className="h-3.5 w-3.5 animate-spin text-terminal-amber" />
      </div>
    );
  }

  return (
    <div className="my-2 flex max-w-2xl flex-col gap-3 rounded-xl border border-terminal-border/50 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-terminal-amber/10 p-2 text-terminal-amber">
          {isResolved ? <CheckCircle className="h-4 w-4" weight="fill" /> : <MapTrifold className="h-4 w-4" weight="duotone" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-terminal-muted">
            Plan Approval
          </div>
          <p className="mt-1 text-sm font-mono leading-relaxed text-foreground">{question}</p>
          {existingResult?.approved === true && (
            <p className="mt-2 text-xs font-mono text-terminal-green">Approved. The agent can continue implementing.</p>
          )}
          {existingResult?.action === "Reject / Edit" && (
            <p className="mt-2 text-xs font-mono text-terminal-amber">
              Feedback sent{existingResult.message ? `: ${existingResult.message}` : "."}
            </p>
          )}
        </div>
      </div>

      <pre className="max-h-80 overflow-auto rounded-lg border border-terminal-border/40 bg-terminal-bg/30 p-3 text-xs leading-6 text-terminal-dark whitespace-pre-wrap font-mono">
        {plan || "No plan content was captured."}
      </pre>

      {!isResolved && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const isSelected = selectedAction === option.label;
              const isApprove = option.label === "Approve & Continue";
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={submitting}
                  onClick={isApprove ? handleApprove : () => setSelectedAction(option.label)}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left font-mono text-xs transition-all",
                    isSelected
                      ? isApprove
                        ? "border-terminal-green/50 bg-terminal-green/10 text-terminal-green"
                        : "border-terminal-amber/50 bg-terminal-amber/10 text-terminal-amber"
                      : "border-border bg-card text-foreground hover:border-terminal-amber/40 hover:bg-terminal-amber/5",
                  )}
                >
                  <div className="font-semibold">{option.label}</div>
                  {option.description ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">{option.description}</div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-terminal-border/40 bg-terminal-bg/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-terminal-muted">
              <NotePencil className="h-4 w-4" />
              <span>Optional feedback for plan changes</span>
            </div>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={submitting}
              rows={4}
              placeholder="Tell the agent what to revise before implementation starts."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none transition focus:border-terminal-amber/50"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={submitting || selectedAction !== "Reject / Edit"}
                onClick={handleReject}
                className={cn(
                  "rounded-lg border px-4 py-2 font-mono text-xs font-semibold transition-all",
                  selectedAction === "Reject / Edit" && !submitting
                    ? "border-terminal-amber/60 bg-terminal-amber/10 text-terminal-amber hover:bg-terminal-amber/20"
                    : "cursor-not-allowed border-border bg-muted/30 text-muted-foreground",
                )}
              >
                {submitting && selectedAction === "Reject / Edit" ? (
                  <span className="inline-flex items-center gap-2">
                    <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "Send feedback"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
