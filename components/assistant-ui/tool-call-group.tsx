"use client";

import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMessage } from "@assistant-ui/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToolCallBadge, type ToolCallBadgeStatus } from "./tool-call-badge";

type ToolCallPart = {
  type: "tool-call";
  toolName: string;
  result?: unknown;
  isError?: boolean;
};

interface ToolCallGroupProps {
  startIndex: number;
  endIndex: number;
  children: ReactNode;
}

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
  const result = part.result as Record<string, unknown> | undefined;
  const status = result?.status;

  if (part.isError || status === "error") return "error";
  if (part.result === undefined || status === "processing") return "running";
  return "completed";
}

export const ToolCallGroup: FC<ToolCallGroupProps> = ({
  startIndex,
  endIndex,
  children,
}) => {
  const t = useTranslations("assistantUi.tools");
  const message = useMessage();
  const [isExpanded, setIsExpanded] = useState(false);

  const toolParts = useMemo(() => {
    const parts = (message?.parts ?? []) as Array<{ type?: string }>;
    return parts
      .slice(startIndex, endIndex + 1)
      .filter((part): part is ToolCallPart => part?.type === "tool-call");
  }, [message?.parts, startIndex, endIndex]);

  const hasError = useMemo(() => {
    return toolParts.some((part) => getStatus(part) === "error");
  }, [toolParts]);

  useEffect(() => {
    if (hasError) setIsExpanded(true);
  }, [hasError]);

  if (toolParts.length === 0) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "my-2 rounded-lg bg-terminal-cream/80 p-2 shadow-sm transition-all duration-150 ease-in-out [contain:layout_style]",
        isExpanded ? "max-h-[2000px]" : "max-h-[64px] overflow-hidden"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {toolParts.map((part, index) => {
          const label = t.has(part.toolName) ? t(part.toolName) : part.toolName;
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="ml-auto h-7 px-2 text-xs font-mono text-terminal-muted hover:text-terminal-dark"
        >
          {isExpanded ? "Hide" : "Details"}
          {isExpanded ? (
            <ChevronUpIcon className="ml-1 size-3" />
          ) : (
            <ChevronDownIcon className="ml-1 size-3" />
          )}
        </Button>
      </div>

      {isExpanded && (
        <div className="mt-2 border-t border-terminal-dark/10 pt-2">
          {children}
        </div>
      )}
    </div>
  );
};
