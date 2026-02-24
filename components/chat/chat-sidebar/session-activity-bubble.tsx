"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitPullRequest,
  Loader2,
  Sparkles,
  Workflow,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SessionActivityIndicator,
  SessionActivityState,
  SessionContextStatusState,
} from "@/lib/stores/session-sync-store";

interface SessionActivityBubbleProps {
  activity?: SessionActivityState;
  contextStatus?: SessionContextStatusState;
  hasActiveRun: boolean;
  isCurrent: boolean;
}

type BubbleTone = "neutral" | "info" | "warning" | "critical" | "success";
type BubblePhase = "entering" | "live" | "settling" | "archived";

interface ResolvedBubbleModel {
  primary: SessionActivityIndicator;
  secondary?: SessionActivityIndicator;
  isRunning: boolean;
  signature: string;
  updatedAt: number;
}

interface VisualBubbleModel extends ResolvedBubbleModel {
  phase: BubblePhase;
}

const STATUS_SWAP_COOLDOWN_MS = 700;
const SETTLING_PHASE_MS = 2800;
const ARCHIVED_HIDE_MS = 18000;

function toneClasses(tone: BubbleTone): { bubble: string; tail: string; dot: string } {
  switch (tone) {
    case "success":
      return {
        bubble:
          "border-emerald-500/45 bg-emerald-500/12 text-emerald-200 shadow-[0_1px_2px_rgba(16,185,129,0.2)]",
        tail: "after:border-emerald-500/45 after:bg-emerald-500/12",
        dot: "bg-emerald-300",
      };
    case "warning":
      return {
        bubble:
          "border-amber-500/50 bg-amber-500/12 text-amber-200 shadow-[0_1px_2px_rgba(245,158,11,0.2)]",
        tail: "after:border-amber-500/50 after:bg-amber-500/12",
        dot: "bg-amber-300",
      };
    case "critical":
      return {
        bubble:
          "border-red-500/50 bg-red-500/12 text-red-200 shadow-[0_1px_2px_rgba(239,68,68,0.24)]",
        tail: "after:border-red-500/50 after:bg-red-500/12",
        dot: "bg-red-300",
      };
    case "info":
      return {
        bubble:
          "border-sky-500/40 bg-sky-500/10 text-sky-200 shadow-[0_1px_2px_rgba(14,165,233,0.2)]",
        tail: "after:border-sky-500/40 after:bg-sky-500/10",
        dot: "bg-sky-300",
      };
    default:
      return {
        bubble:
          "border-terminal-border/70 bg-terminal-dark/35 text-terminal-muted shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
        tail: "after:border-terminal-border/70 after:bg-terminal-dark/35",
        dot: "bg-terminal-muted",
      };
  }
}

function indicatorIcon(indicator: SessionActivityIndicator) {
  if (indicator.kind === "tool") return Wrench;
  if (indicator.kind === "hook") return Sparkles;
  if (indicator.kind === "skill") return Sparkles;
  if (indicator.kind === "delegation") return Workflow;
  if (indicator.kind === "workspace") return GitBranch;
  if (indicator.kind === "pr") return GitPullRequest;
  if (indicator.kind === "context") return AlertTriangle;
  if (indicator.kind === "success") return CheckCircle2;
  if (indicator.kind === "error") return XCircle;
  return Loader2;
}

function indicatorPriority(indicator: SessionActivityIndicator, isRunning: boolean): number {
  if (indicator.tone === "critical") return 500;
  if (indicator.tone === "warning") return 400;

  const liveKinds = new Set(["run", "tool", "hook", "skill", "delegation", "workspace", "pr"]);
  if (isRunning && liveKinds.has(indicator.kind)) return 300;

  if (indicator.tone === "success") return 200;
  return 100;
}

function buildContextIndicator(contextStatus?: SessionContextStatusState): SessionActivityIndicator | null {
  if (!contextStatus) return null;

  if (contextStatus.status === "exceeded") {
    return {
      key: "context-limit-reached",
      kind: "context",
      label: "Context limit reached",
      detail: `${Math.round(contextStatus.percentage)}% used`,
      tone: "critical",
    };
  }

  if (contextStatus.status === "critical") {
    return {
      key: "context-near-limit",
      kind: "context",
      label: "Context nearly full",
      detail: `${Math.round(contextStatus.percentage)}% used`,
      tone: "warning",
    };
  }

  return {
    key: "context-warning",
    kind: "context",
    label: "Context climbing",
    detail: `${Math.round(contextStatus.percentage)}% used`,
    tone: "info",
  };
}

function resolveIncomingModel(
  activity: SessionActivityState | undefined,
  contextStatus: SessionContextStatusState | undefined,
  hasActiveRun: boolean
): ResolvedBubbleModel | null {
  const contextIndicator = buildContextIndicator(contextStatus);
  const rawIndicators: SessionActivityIndicator[] = [];

  if (activity?.indicators?.length) {
    rawIndicators.push(...activity.indicators);
  }
  if (contextIndicator) {
    rawIndicators.push(contextIndicator);
  }

  const isRunning = activity?.isRunning ?? hasActiveRun;

  if (rawIndicators.length === 0 && isRunning) {
    rawIndicators.push({
      key: "running-fallback",
      kind: "run",
      label: "Working",
      tone: "info",
    });
  }

  if (rawIndicators.length === 0) {
    return null;
  }

  const deduped = Array.from(
    rawIndicators.reduce((acc, item) => {
      acc.set(item.key, item);
      return acc;
    }, new Map<string, SessionActivityIndicator>()).values()
  );

  deduped.sort((a, b) => {
    const priorityDiff = indicatorPriority(b, isRunning) - indicatorPriority(a, isRunning);
    if (priorityDiff !== 0) return priorityDiff;
    return a.label.localeCompare(b.label);
  });

  const [primary, secondary] = deduped;
  const signature = `${primary.key}:${primary.label}:${primary.tone}|${secondary?.key ?? ""}:${secondary?.label ?? ""}|${isRunning}`;

  return {
    primary,
    secondary,
    isRunning,
    signature,
    updatedAt: Math.max(activity?.updatedAt ?? 0, contextStatus?.updatedAt ?? 0),
  };
}

function formatAccessibilityLabel(model: VisualBubbleModel): string {
  const secondaryText = model.secondary ? `, hint ${model.secondary.label}` : "";
  const detailText = model.primary.detail ? `, ${model.primary.detail}` : "";
  return `Session status: ${model.primary.label}${detailText}${secondaryText}`;
}

function formatTitle(model: VisualBubbleModel): string {
  const parts = [model.primary.label];
  if (model.primary.detail) {
    parts.push(model.primary.detail);
  }
  if (model.secondary) {
    parts.push(`Hint: ${model.secondary.label}`);
  }
  if (model.updatedAt) {
    parts.push(
      `Updated ${new Date(model.updatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    );
  }
  return parts.join(" - ");
}

export function SessionActivityBubble({
  activity,
  contextStatus,
  hasActiveRun,
  isCurrent,
}: SessionActivityBubbleProps) {
  const swapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const incoming = useMemo(
    () => resolveIncomingModel(activity, contextStatus, hasActiveRun),
    [activity, contextStatus, hasActiveRun]
  );

  const [visualModel, setVisualModel] = useState<VisualBubbleModel | null>(null);

  useEffect(() => {
    return () => {
      if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
      if (archiveTimeoutRef.current) clearTimeout(archiveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!incoming) {
      setVisualModel(null);
      if (swapTimeoutRef.current) {
        clearTimeout(swapTimeoutRef.current);
        swapTimeoutRef.current = null;
      }
      return;
    }

    setVisualModel((previous) => {
      if (!previous) {
        return { ...incoming, phase: "entering" };
      }

      if (previous.signature === incoming.signature) {
        const phase = incoming.isRunning ? "live" : previous.phase;
        return { ...previous, ...incoming, phase };
      }

      const elapsed = Date.now() - Math.max(previous.updatedAt, 0);
      const shouldDelaySwap =
        previous.isRunning && incoming.isRunning && previous.phase !== "archived" && elapsed < STATUS_SWAP_COOLDOWN_MS;

      if (shouldDelaySwap) {
        if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
        swapTimeoutRef.current = setTimeout(() => {
          setVisualModel({ ...incoming, phase: "entering" });
          swapTimeoutRef.current = null;
        }, STATUS_SWAP_COOLDOWN_MS - elapsed);
        return previous;
      }

      return { ...incoming, phase: "entering" };
    });
  }, [incoming]);

  useEffect(() => {
    if (!visualModel) return;

    if (visualModel.phase === "entering") {
      const frame = requestAnimationFrame(() => {
        setVisualModel((current) => {
          if (!current || current.signature !== visualModel.signature) return current;
          return { ...current, phase: "live" };
        });
      });
      return () => cancelAnimationFrame(frame);
    }

    if (visualModel.isRunning) {
      if (visualModel.phase === "settling" || visualModel.phase === "archived") {
        setVisualModel((current) =>
          current && current.signature === visualModel.signature
            ? { ...current, phase: "live" }
            : current
        );
      }
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }
      if (archiveTimeoutRef.current) {
        clearTimeout(archiveTimeoutRef.current);
        archiveTimeoutRef.current = null;
      }
      return;
    }

    if (visualModel.phase === "live") {
      setVisualModel((current) =>
        current && current.signature === visualModel.signature
          ? { ...current, phase: "settling" }
          : current
      );
      return;
    }

    if (visualModel.phase === "settling") {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = setTimeout(() => {
        setVisualModel((current) =>
          current && current.signature === visualModel.signature
            ? { ...current, phase: "archived" }
            : current
        );
      }, SETTLING_PHASE_MS);
      return;
    }

    if (visualModel.phase === "archived") {
      if (archiveTimeoutRef.current) clearTimeout(archiveTimeoutRef.current);
      archiveTimeoutRef.current = setTimeout(() => {
        setVisualModel((current) =>
          current && current.signature === visualModel.signature ? null : current
        );
      }, ARCHIVED_HIDE_MS);
    }
  }, [visualModel]);

  if (!visualModel) {
    return null;
  }

  const { primary, secondary } = visualModel;
  const Icon = indicatorIcon(primary);
  const tone = toneClasses(primary.tone);
  const shouldSpin =
    visualModel.isRunning &&
    (primary.kind === "run" || primary.kind === "tool" || primary.kind === "workspace");

  return (
    <div
      role="status"
      aria-label={formatAccessibilityLabel(visualModel)}
      title={formatTitle(visualModel)}
      className={cn(
        "relative inline-flex max-w-full items-center gap-1.5 rounded-[12px] border px-2.5 py-[5px] text-[10px] font-mono leading-none",
        "transition-all duration-200 ease-out",
        "after:absolute after:left-4 after:top-full after:h-2 after:w-2 after:-translate-y-1/2 after:rotate-45 after:border-b after:border-r",
        tone.bubble,
        tone.tail,
        visualModel.phase === "entering" && "translate-y-1 opacity-0",
        visualModel.phase === "live" && "translate-y-0 opacity-100",
        visualModel.phase === "settling" && "translate-y-0 opacity-95",
        visualModel.phase === "archived" && "translate-y-0 opacity-65 saturate-75",
        isCurrent && "ring-1 ring-current/20"
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", shouldSpin ? "animate-spin" : "")} />
      <span className="max-w-[11rem] truncate">{primary.label}</span>
      {secondary ? (
        <span className="max-w-[9rem] truncate text-[9px] opacity-80">- {secondary.label}</span>
      ) : null}
      {visualModel.isRunning ? (
        <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", tone.dot)} />
      ) : null}
    </div>
  );
}
