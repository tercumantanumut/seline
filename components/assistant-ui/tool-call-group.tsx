"use client";

import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useAssistantState, useMessage } from "@assistant-ui/react";
import type { MessagePartState } from "@assistant-ui/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToolCallBadge, type ToolCallBadgeStatus } from "./tool-call-badge";
import { getCanonicalToolName } from "./tool-name-utils";
import { useBrowserActive } from "./browser-active-context";
import { useToolExpansion } from "./tool-expansion-context";

type ToolCallPart = Extract<MessagePartState, { type: "tool-call" }>;

interface ToolCallGroupProps {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
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
  "updatePlan",
  "showProductImages",
  "calculator",
  "chromiumWorkspace",
  "promptLibrary",
]);

function getResultCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (Array.isArray(r.sources)) return r.sources.length;
  if (Array.isArray(r.results)) return r.results.length;
  if (Array.isArray(r.images)) return r.images.length;
  if (Array.isArray(r.videos)) return r.videos.length;
  if (typeof r.matchCount === "number") return r.matchCount;

  return null;
}

function getStatus(part: ToolCallPart): ToolCallBadgeStatus {
  if (part.status?.type === "incomplete") return "error";
  if (part.status?.type === "running" || part.status?.type === "requires-action") {
    return "running";
  }

  const result = part.result as Record<string, unknown> | undefined;
  const status = result?.status;

  if (status === "error") return "error";
  if (part.result === undefined || status === "processing") return "running";
  return "completed";
}

function extractMediaFromResult(result: unknown): Array<{ type: "image" | "video"; url: string }> {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const media: Array<{ type: "image" | "video"; url: string }> = [];

  if (Array.isArray(r.images)) {
    for (const item of r.images) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        media.push({ type: "image", url: (item as { url: string }).url });
      }
    }
  }
  if (Array.isArray(r.videos)) {
    for (const item of r.videos) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        media.push({ type: "video", url: (item as { url: string }).url });
      }
    }
  }
  if (Array.isArray(r.results)) {
    for (const nested of r.results) {
      media.push(...extractMediaFromResult(nested));
    }
  }

  return media;
}

export const ToolCallGroup: FC<ToolCallGroupProps> = ({
  startIndex,
  endIndex,
  children,
}) => {
  const t = useTranslations("assistantUi.tools");
  const messageParts = useAssistantState((state) => state.message.parts);
  const messageId = useMessage((state) => state.id);
  const { isBrowserActive } = useBrowserActive();

  const toolParts = useMemo(() => {
    return messageParts
      .slice(startIndex, endIndex + 1)
      .filter((part): part is ToolCallPart => part?.type === "tool-call");
  }, [messageParts, startIndex, endIndex]);

  const isAllChromium = useMemo(() => {
    return toolParts.length > 0 && toolParts.every((p) => getCanonicalToolName(p.toolName) === "chromiumWorkspace");
  }, [toolParts]);

  const isGlass = isBrowserActive && isAllChromium;

  const fallbackKey = useMemo(() => {
    return toolParts
      .map((part, index) => `${part.toolName}:${index}`)
      .join("|");
  }, [toolParts]);

  const expansionKey = useMemo(() => {
    const resolvedMessageId =
      typeof messageId === "string" ? messageId : fallbackKey || "unknown-message";
    return `${resolvedMessageId}:${startIndex}`;
  }, [fallbackKey, messageId, startIndex]);

  const [isExpanded, setIsExpanded] = useState<boolean>(
    () => toolGroupExpansionState.get(expansionKey) ?? false
  );

  const hasError = useMemo(() => {
    return toolParts.some((part) => getStatus(part) === "error");
  }, [toolParts]);

  const hasInteractiveUI = useMemo(() => {
    return toolParts.some((part) =>
      TOOLS_AUTO_EXPAND.has(getCanonicalToolName(part.toolName))
    );
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

  const hasMedia = mediaPreviews.length > 0;

  useEffect(() => {
    if (toolGroupExpansionState.has(expansionKey)) {
      setIsExpanded(Boolean(toolGroupExpansionState.get(expansionKey)));
      return;
    }
    setIsExpanded(false);
  }, [expansionKey]);

  useEffect(() => {
    if ((hasError || hasMedia || hasInteractiveUI) && !toolGroupExpansionState.has(expansionKey)) {
      setIsExpanded(true);
      toolGroupExpansionState.set(expansionKey, true);
    }
  }, [expansionKey, hasError, hasMedia, hasInteractiveUI]);

  // React to global expand/collapse signal
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

  const handleToggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      toolGroupExpansionState.set(expansionKey, next);
      return next;
    });
  };

  if (toolParts.length === 0) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "my-2 rounded-lg p-2 shadow-sm transition-all duration-150 ease-in-out",
        isGlass
          ? "bg-black/20 backdrop-blur-md border border-white/10"
          : "bg-terminal-cream/80"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {toolParts.map((part, index) => {
          const canonicalToolName = getCanonicalToolName(part.toolName);
          const label = t.has(canonicalToolName)
            ? t(canonicalToolName)
            : t.has(part.toolName)
              ? t(part.toolName)
              : canonicalToolName;
          const status = getStatus(part);
          const count = getResultCount(part.result);
          return (
            <ToolCallBadge
              key={`${part.toolName}-${index}`}
              label={label}
              status={status}
              count={count}
            />
          );
        })}
      </div>

      {!isExpanded && mediaPreviews.length > 0 && (
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

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleExpanded}
          className={cn(
            "h-7 px-2 text-xs font-mono",
            isGlass
              ? "text-white/60 hover:text-white/90"
              : "text-terminal-muted hover:text-terminal-dark"
          )}
        >
          {isExpanded ? t("hide") : t("details")}
          {isExpanded ? (
            <ChevronUpIcon className="ml-1 size-3" />
          ) : (
            <ChevronDownIcon className="ml-1 size-3" />
          )}
        </Button>
      </div>

      {isExpanded && (
        <div className={cn("mt-2 border-t pt-2", isGlass ? "border-white/10" : "border-terminal-dark/10")}>
          {children}
        </div>
      )}
    </div>
  );
};
