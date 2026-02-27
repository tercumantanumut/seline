"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  anchorRef: RefObject<HTMLDivElement | null>;
  onDismissed?: () => void;
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
const SETTLING_PHASE_MS = 4000;
const ARCHIVED_HIDE_MS = 5000;
// Grace period after hasActiveRun drops before clearing the bubble.
// task:completed arrives via a second SSE stream (/api/tasks/events) which has
// extra network RTT vs the chat stream — without this, the bubble clears before
// the completion indicator arrives and "Completed" is never shown.
const RUN_ENDED_GRACE_MS = 2500;

function toneClasses(tone: BubbleTone): { bubble: string; dot: string; tail: string } {
  switch (tone) {
    case "success":
      return {
        bubble: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
        dot: "bg-emerald-500",
        tail: "before:border-r-emerald-50 dark:before:border-r-emerald-950/50",
      };
    case "warning":
      return {
        bubble: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
        dot: "bg-amber-500",
        tail: "before:border-r-amber-50 dark:before:border-r-amber-950/50",
      };
    case "critical":
      return {
        bubble: "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300",
        dot: "bg-red-500",
        tail: "before:border-r-red-50 dark:before:border-r-red-950/50",
      };
    case "info":
      return {
        bubble: "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300",
        dot: "bg-sky-500",
        tail: "before:border-r-sky-50 dark:before:border-r-sky-950/50",
      };
    default:
      return {
        bubble: "bg-terminal-cream dark:bg-terminal-bg text-terminal-dark dark:text-terminal-muted",
        dot: "bg-terminal-muted",
        tail: "before:border-r-terminal-cream dark:before:border-r-[hsl(var(--terminal-bg))]",
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

  // Keep the generic run indicator available as fallback, but deprioritize it
  // so concrete tool/skill/hook updates become the primary bubble label.
  if (isRunning && indicator.kind === "run") return 140;

  const liveKinds = new Set(["tool", "hook", "skill", "delegation", "workspace", "pr"]);
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
  anchorRef,
  onDismissed,
}: SessionActivityBubbleProps) {
  const swapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grace period: when hasActiveRun drops to false, keep a brief window open so
  // the task:completed SSE event (which travels via a separate stream) can arrive
  // and set the completion indicator before we clear the bubble.
  const [graceActive, setGraceActive] = useState(false);
  const prevHasActiveRunRef = useRef(hasActiveRun);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasActive = prevHasActiveRunRef.current;
    prevHasActiveRunRef.current = hasActiveRun;
    if (wasActive && !hasActiveRun) {
      setGraceActive(true);
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = setTimeout(() => {
        setGraceActive(false);
        graceTimeoutRef.current = null;
      }, RUN_ENDED_GRACE_MS);
    }
    return () => {
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, [hasActiveRun]);

  const incoming = useMemo(
    () => resolveIncomingModel(activity, contextStatus, hasActiveRun || graceActive),
    [activity, contextStatus, hasActiveRun, graceActive]
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
        setVisualModel((current) => {
          if (current && current.signature === visualModel.signature) {
            onDismissed?.();
            return null;
          }
          return current;
        });
      }, ARCHIVED_HIDE_MS);
    }
  }, [visualModel, onDismissed]);

  // --- Portal positioning ---
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !visualModel) {
      setPos(null);
      return;
    }

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const scrollContainer = anchor.closest("[data-radix-scroll-area-viewport]");
      const sidebarRect = scrollContainer?.getBoundingClientRect();

      // Hide bubble if session item is scrolled out of sidebar viewport
      if (sidebarRect) {
        const visible = rect.bottom > sidebarRect.top && rect.top < sidebarRect.bottom;
        if (!visible) {
          setPos(null);
          return;
        }
      }

      setPos({
        top: rect.top + rect.height / 2 - 14, // vertically centered on the session item
        left: rect.right + 8, // 8px to the right of the session item (into chat area)
      });
    };

    update();

    const scrollContainer = anchor.closest("[data-radix-scroll-area-viewport]");
    scrollContainer?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    return () => {
      scrollContainer?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, visualModel]);

  if (!visualModel || !pos) {
    return null;
  }

  const { primary, secondary } = visualModel;
  const Icon = indicatorIcon(primary);
  const tone = toneClasses(primary.tone);
  const shouldSpin =
    visualModel.isRunning &&
    (primary.kind === "run" || primary.kind === "tool" || primary.kind === "workspace");

  const bubble = (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <div
        role="status"
        aria-label={formatAccessibilityLabel(visualModel)}
        title={formatTitle(visualModel)}
        className={cn(
          // Flat RPG speech bubble
          "relative inline-flex items-center gap-1.5 pointer-events-auto",
          "rounded-xl px-3 py-1.5 text-[10px] font-mono leading-tight",
          "max-w-[200px]",
          "shadow-md backdrop-blur-sm",
          // Left-pointing tail toward session item
          "before:absolute before:top-1/2 before:-translate-y-1/2 before:-left-[6px]",
          "before:border-y-[6px] before:border-r-[6px] before:border-y-transparent",
          tone.tail,
          // Smooth calm transitions
          "transition-all duration-500 ease-out",
          tone.bubble,
          // Phase animations
          visualModel.phase === "entering" && "translate-y-1 opacity-0 scale-95",
          visualModel.phase === "live" && "translate-y-0 opacity-100 scale-100",
          visualModel.phase === "settling" && "translate-y-0 opacity-75 scale-100",
          visualModel.phase === "archived" && "translate-y-0 opacity-40 scale-100",
        )}
      >
        <Icon className={cn("h-3 w-3 shrink-0", shouldSpin ? "animate-spin" : "")} />
        <span className="truncate">{primary.label}</span>
        {secondary ? (
          <span className="truncate shrink-0 max-w-[4rem] text-[9px] opacity-60">
            · {secondary.label}
          </span>
        ) : null}
        {visualModel.isRunning ? (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 animate-pulse", tone.dot)} />
        ) : null}
      </div>
    </div>
  );

  return createPortal(bubble, document.body);
}
