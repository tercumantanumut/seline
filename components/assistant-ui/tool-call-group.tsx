"use client";

import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useAssistantState, useMessage } from "@assistant-ui/react";
import type { MessagePartState } from "@assistant-ui/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChatSessionId } from "@/components/chat-provider";
import { ToolCallBadge, type ToolCallBadgeStatus } from "./tool-call-badge";
import { useBrowserActive } from "./browser-active-context";
import { useToolDisplayPreferences } from "./tool-display-context";
import { useToolExpansion } from "./tool-expansion-context";
import {
  getFallbackToolPhase,
  summarizeToolInputByName,
  summarizeToolOutputByName,
  useLiveToolStatuses,
  type LiveToolPhase,
} from "./tool-live-status";
import { getCanonicalToolName } from "./tool-name-utils";

type ToolCallPart = Extract<MessagePartState, { type: "tool-call" }>;
type ToolCallPartLike = ToolCallPart & {
  toolCallId?: string;
  args?: unknown;
  input?: unknown;
  argsText?: string;
};

interface ToolCallGroupProps {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}

interface ToolSummaryItem {
  key: string;
  label: string;
  badgeStatus: ToolCallBadgeStatus;
  phase: LiveToolPhase;
  count: number | null;
  detail?: string;
  inputPreview?: string;
  outputPreview?: string;
}

const toolGroupExpansionState = new Map<string, boolean>();

/**
 * Tools whose custom UI is the primary content and should auto-expand.
 * Without this, their rich inline UIs (audio player, interactive questions,
 * plan steps, etc.) are hidden behind the "Details" toggle.
 */
const TOOLS_AUTO_EXPAND = new Set([
  "speakAloud",
  "askUserQuestion",
  "askFollowupQuestion",
  "AskUserQuestion",
  "updatePlan",
  "ExitPlanMode",
  "showProductImages",
  "calculator",
  "chromiumWorkspace",
  "promptLibrary",
]);

function getResultCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;

  if (Array.isArray(record.sources)) return record.sources.length;
  if (Array.isArray(record.results)) return record.results.length;
  if (Array.isArray(record.images)) return record.images.length;
  if (Array.isArray(record.videos)) return record.videos.length;
  if (typeof record.matchCount === "number") return record.matchCount;

  return null;
}

function getStatus(part: ToolCallPartLike): ToolCallBadgeStatus {
  if (part.status?.type === "incomplete") return "error";
  if (part.status?.type === "running" || part.status?.type === "requires-action") {
    return "running";
  }

  const result = part.result as Record<string, unknown> | undefined;
  const status = typeof result?.status === "string" ? result.status.toLowerCase() : undefined;

  if (part.isError || status === "error" || status === "failed" || status === "denied" || typeof result?.error === "string") {
    return "error";
  }
  if (part.result === undefined || status === "processing") return "running";
  return "completed";
}

function extractMediaFromResult(result: unknown): Array<{ type: "image" | "video"; url: string }> {
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const media: Array<{ type: "image" | "video"; url: string }> = [];

  if (Array.isArray(record.images)) {
    for (const item of record.images) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        media.push({ type: "image", url: (item as { url: string }).url });
      }
    }
  }

  if (Array.isArray(record.videos)) {
    for (const item of record.videos) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        media.push({ type: "video", url: (item as { url: string }).url });
      }
    }
  }

  if (Array.isArray(record.results)) {
    for (const nested of record.results) {
      media.push(...extractMediaFromResult(nested));
    }
  }

  return media;
}

function phaseToBadgeStatus(phase: LiveToolPhase): ToolCallBadgeStatus {
  if (phase === "error") return "error";
  if (phase === "completed") return "completed";
  return "running";
}

function phaseToAccentClass(phase: LiveToolPhase): string {
  switch (phase) {
    case "error":
      return "border-red-400/40 bg-background/80 text-foreground backdrop-blur-md";
    case "completed":
      return "border-terminal-green/40 bg-background/80 text-foreground backdrop-blur-md";
    case "preparing":
      return "border-terminal-dark/20 bg-background/80 text-foreground backdrop-blur-md";
    case "running":
    default:
      return "border-terminal-amber/40 bg-background/80 text-foreground backdrop-blur-md";
  }
}

function phaseToStatusText(tStatus: ReturnType<typeof useTranslations>, phase: LiveToolPhase): string {
  switch (phase) {
    case "error":
      return tStatus("failed");
    case "completed":
      return tStatus("completed");
    case "preparing":
    case "running":
    default:
      return tStatus("processing");
  }
}

export const ToolCallGroup: FC<ToolCallGroupProps> = ({
  startIndex,
  endIndex,
  children,
}) => {
  const t = useTranslations("assistantUi.tools");
  const tStatus = useTranslations("assistantUi.toolStatus");
  const sessionId = useChatSessionId();
  const liveStatuses = useLiveToolStatuses(sessionId);
  const { effectiveDisplayMode } = useToolDisplayPreferences();
  const isDetailedMode = effectiveDisplayMode === "detailed";
  const messageParts = useAssistantState((state) => state.message.parts);
  const messageId = useMessage((state) => state.id);
  const { isBrowserActive } = useBrowserActive();
  const [isCompactRevealPinned, setIsCompactRevealPinned] = useState(false);
  const [isCompactRevealHovered, setIsCompactRevealHovered] = useState(false);

  const toolParts = useMemo(() => {
    return messageParts
      .slice(startIndex, endIndex + 1)
      .filter((part): part is ToolCallPart => part?.type === "tool-call");
  }, [messageParts, startIndex, endIndex]);

  const isAllChromium = useMemo(() => {
    return toolParts.length > 0 && toolParts.every((part) => getCanonicalToolName(part.toolName) === "chromiumWorkspace");
  }, [toolParts]);

  const isGlass = isBrowserActive && isAllChromium;

  const fallbackKey = useMemo(() => {
    return toolParts
      .map((part, index) => `${part.toolName}:${index}`)
      .join("|");
  }, [toolParts]);

  const expansionKey = useMemo(() => {
    const resolvedMessageId = typeof messageId === "string" ? messageId : fallbackKey || "unknown-message";
    return `${resolvedMessageId}:${startIndex}`;
  }, [fallbackKey, messageId, startIndex]);

  const [isExpanded, setIsExpanded] = useState<boolean>(
    () => toolGroupExpansionState.get(expansionKey) ?? false
  );

  const hasInteractiveUI = useMemo(() => {
    return toolParts.some((part) => TOOLS_AUTO_EXPAND.has(getCanonicalToolName(part.toolName)));
  }, [toolParts]);

  const mediaPreviews = useMemo(() => {
    if (toolParts.length === 0 || toolParts.every((part) => part.result == null)) {
      return [];
    }

    const seen = new Set<string>();
    const collected: Array<{ type: "image" | "video"; url: string }> = [];

    for (const part of toolParts) {
      for (const media of extractMediaFromResult(part.result)) {
        if (seen.has(media.url)) continue;
        seen.add(media.url);
        collected.push(media);
      }
    }

    return collected;
  }, [toolParts]);

  const summaryItems = useMemo<ToolSummaryItem[]>(() => {
    return toolParts.map((part, index) => {
      const partLike = part as ToolCallPartLike;
      const canonicalToolName = getCanonicalToolName(part.toolName);
      const label = t.has(canonicalToolName)
        ? t(canonicalToolName)
        : t.has(part.toolName)
          ? t(part.toolName)
          : canonicalToolName;
      const canonicalStatus = getStatus(partLike);
      const liveStatus = canonicalStatus === "running" && partLike.toolCallId
        ? liveStatuses[partLike.toolCallId]
        : undefined;
      const phase = liveStatus?.phase ?? getFallbackToolPhase(part.result, canonicalStatus === "running");
      const detail = liveStatus?.detail;
      const inputPreview = liveStatus?.argsPreview ?? summarizeToolInputByName(canonicalToolName, partLike.input ?? partLike.args ?? partLike.argsText);
      const outputPreview = liveStatus?.outputPreview ?? summarizeToolOutputByName(canonicalToolName, part.result);

      return {
        key: partLike.toolCallId ?? `${part.toolName}-${index}`,
        label,
        badgeStatus: liveStatus ? phaseToBadgeStatus(liveStatus.phase) : canonicalStatus,
        phase,
        count: getResultCount(part.result),
        detail,
        inputPreview,
        outputPreview,
      };
    });
  }, [liveStatuses, t, toolParts]);

  const hasMedia = mediaPreviews.length > 0;
  const hasCompactReveal = !isDetailedMode && summaryItems.some(
    (item) => item.phase !== "error" && (item.detail || item.inputPreview || item.outputPreview)
  );
  const showCompactReveal = hasCompactReveal && !isExpanded && (isCompactRevealHovered || isCompactRevealPinned);
  const showChildren = isDetailedMode || isExpanded;

  useEffect(() => {
    if (toolGroupExpansionState.has(expansionKey)) {
      setIsExpanded(Boolean(toolGroupExpansionState.get(expansionKey)));
      return;
    }
    setIsExpanded(false);
  }, [expansionKey]);

  useEffect(() => {
    if ((isDetailedMode || hasMedia || hasInteractiveUI) && !toolGroupExpansionState.has(expansionKey)) {
      setIsExpanded(true);
      toolGroupExpansionState.set(expansionKey, true);
    }
  }, [expansionKey, hasInteractiveUI, hasMedia, isDetailedMode]);

  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    const next = expansionCtx.signal.mode === "expand";
    setIsExpanded(next);
    toolGroupExpansionState.set(expansionKey, next);
  }, [expansionCtx?.signal, expansionKey]);

  useEffect(() => {
    if (isDetailedMode) {
      setIsCompactRevealPinned(false);
      setIsCompactRevealHovered(false);
    }
  }, [isDetailedMode]);

  const handleToggleExpanded = () => {
    setIsExpanded((previous) => {
      const next = !previous;
      toolGroupExpansionState.set(expansionKey, next);
      return next;
    });
  };

  const handleCompactPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDetailedMode || event.pointerType === "mouse" || !hasCompactReveal) return;
    setIsCompactRevealPinned((previous) => !previous);
  };

  if (toolParts.length === 0) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "my-2 border-l-2 pl-3 transition-all duration-150 ease-in-out",
        isGlass ? "border-white/20" : "border-terminal-dark/15"
      )}
      onMouseEnter={() => setIsCompactRevealHovered(true)}
      onMouseLeave={() => setIsCompactRevealHovered(false)}
      onFocusCapture={() => setIsCompactRevealHovered(true)}
      onBlurCapture={() => setIsCompactRevealHovered(false)}
    >
      <div
        className="flex flex-wrap items-center gap-2 pb-1"
        onPointerDown={handleCompactPointerDown}
      >
        {summaryItems.map((item) => (
          <ToolCallBadge
            key={item.key}
            label={item.label}
            status={item.badgeStatus}
            count={item.count}
          />
        ))}
      </div>

      {showCompactReveal && (
        <div className={cn("mt-2 space-y-2 border-t pt-2", isGlass ? "border-white/10" : "border-terminal-dark/10")}>
          {summaryItems.map((item) => {
            if (item.phase === "error") return null;
            const previewText = item.detail
              ?? (item.phase === "completed"
                ? item.outputPreview ?? item.inputPreview
                : item.inputPreview ?? item.outputPreview);
            if (!previewText) return null;

            return (
              <div
                key={`reveal-${item.key}`}
                className={cn(
                  "rounded-md border px-3 py-2 font-mono text-xs shadow-sm",
                  phaseToAccentClass(item.phase)
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {phaseToStatusText(tStatus, item.phase)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90 [overflow-wrap:anywhere]">
                  {previewText}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!showChildren && mediaPreviews.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {mediaPreviews.map((media, index) =>
            media.type === "image" ? (
              <a
                key={`${media.url}-${index}`}
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={media.url}
                  alt={t("toolOutputPreview", { index: index + 1 })}
                  className="h-24 w-auto rounded-md border border-terminal-dark/10 object-cover shadow-sm"
                />
              </a>
            ) : (
              <video
                key={`${media.url}-${index}`}
                src={media.url}
                controls
                className="h-24 w-auto rounded-md border border-terminal-dark/10 shadow-sm"
              />
            )
          )}
        </div>
      )}

      {isDetailedMode && (
        <div className={cn("mt-2 space-y-2 border-t pt-2", isGlass ? "border-white/10" : "border-terminal-dark/10")}>
          {summaryItems.map((item) => (
            <div
              key={`detailed-${item.key}`}
              className={cn(
                "rounded-lg border px-3 py-2.5 font-mono shadow-sm",
                phaseToAccentClass(item.phase)
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] opacity-80">
                    {item.label}
                  </div>
                  {(item.detail || item.inputPreview || item.outputPreview) && (
                    <p className="mt-1 text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {item.detail
                        ?? (item.phase === "completed"
                          ? item.outputPreview ?? item.inputPreview
                          : item.inputPreview ?? item.outputPreview)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 rounded-full border border-current/15 bg-white/30 px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                  {phaseToStatusText(tStatus, item.phase)}
                </div>
              </div>
              {item.inputPreview && item.detail !== item.inputPreview && (
                <div className="mt-2 text-[11px] opacity-85">
                  <span className="font-semibold">Input:</span> {item.inputPreview}
                </div>
              )}
              {item.outputPreview && item.detail !== item.outputPreview && item.outputPreview !== item.inputPreview && (
                <div className="mt-1 text-[11px] opacity-85">
                  <span className="font-semibold">Output:</span> {item.outputPreview}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleExpanded}
          className={cn(
            "h-6 px-2 text-[11px] font-mono rounded-md",
            isGlass
              ? "text-white/50 hover:text-white/80 hover:bg-white/5"
              : "text-terminal-muted/70 hover:text-terminal-dark hover:bg-terminal-dark/5"
          )}
        >
          {showChildren ? t("hide") : t("details")}
          {showChildren ? (
            <ChevronUpIcon className="ml-1 size-3" />
          ) : (
            <ChevronDownIcon className="ml-1 size-3" />
          )}
        </Button>
      </div>

      {showChildren && (
        <div className={cn("mt-2 border-t pt-2", isGlass ? "border-white/10" : "border-terminal-dark/10")}>
          {children}
        </div>
      )}
    </div>
  );
};
