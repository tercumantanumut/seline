/**
 * Web Browse Inline Component
 *
 * Displays web browsing progress inline in the chat.
 * Shows fetching status, pages loaded, and final synthesis.
 * Designed to be unobtrusive and flow with chat messages.
 */

"use client";

import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { WebBrowsePhase, WebBrowseContentEvent } from "@/lib/ai/web-browse";
import {
  GlobeIcon,
  LoaderIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

// ============================================================================
// Types
// ============================================================================

interface WebBrowseInlineProps {
  phase: WebBrowsePhase;
  phaseMessage: string;
  fetchedPages: WebBrowseContentEvent[];
  error: string | null;
  onCancel?: () => void;
  className?: string;
}

// ============================================================================
// Phase Configuration (icons and colors only — labels are translated at render)
// ============================================================================

const PHASE_STATIC: Record<
  WebBrowsePhase,
  { icon: typeof GlobeIcon; color: string }
> = {
  idle: { icon: GlobeIcon, color: "text-terminal-muted" },
  fetching: { icon: LoaderIcon, color: "text-blue-500" },
  caching: { icon: LoaderIcon, color: "text-blue-500" },
  synthesizing: { icon: LoaderIcon, color: "text-purple-500" },
  complete: { icon: CheckCircleIcon, color: "text-green-600" },
  error: { icon: AlertCircleIcon, color: "text-red-500" },
};

// ============================================================================
// Component
// ============================================================================

export const WebBrowseInline: FC<WebBrowseInlineProps> = ({
  phase,
  phaseMessage,
  fetchedPages,
  error,
  onCancel,
  className,
}) => {
  const t = useTranslations("assistantUi.webBrowse");
  const [showPages, setShowPages] = useState(false);
  const phaseLabels: Record<WebBrowsePhase, string> = {
    idle: "",
    fetching: t("phaseFetching"),
    caching: t("phaseCaching"),
    synthesizing: t("phaseAnalyzing"),
    complete: t("phaseComplete"),
    error: t("phaseError"),
  };
  const config = PHASE_STATIC[phase];
  const Icon = config.icon;
  const label = phaseLabels[phase];
  const isActive = phase === "fetching" || phase === "caching" || phase === "synthesizing";

  // Don't render if idle
  if (phase === "idle") return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 py-2 px-3 rounded-md bg-terminal-dark/5 text-sm",
        className
      )}
    >
      {/* Status Line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-4",
              config.color,
              isActive && "animate-spin"
            )}
          />
          <span className={cn("font-mono text-xs", config.color)}>
            {label}
            {phaseMessage && `: ${phaseMessage}`}
          </span>
        </div>

        {isActive && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-6 px-2 text-xs"
          >
            <XIcon className="size-3" />
          </Button>
        )}
      </div>

      {/* Fetched Pages */}
      {fetchedPages.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowPages(!showPages)}
            className="flex items-center gap-1 text-xs font-mono text-terminal-muted hover:text-terminal-dark"
          >
            {showPages ? (
              <ChevronUpIcon className="size-3" />
            ) : (
              <ChevronDownIcon className="size-3" />
            )}
            {t("pagesLoaded", { count: fetchedPages.length })}
          </button>

          {showPages && (
            <div className="mt-1.5 space-y-1 pl-4">
              {fetchedPages.map((page, index) => (
                <div key={index} className="flex items-center gap-1.5 text-xs">
                  <ExternalLinkIcon className="size-3 text-terminal-muted flex-shrink-0" />
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-[250px]"
                  >
                    {page.title || page.url}
                  </a>
                  <span className="text-terminal-muted">
                    ({Math.round(page.contentLength / 1024)}KB)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-1 text-xs text-red-600 font-mono">
          {t("errorPrefix", { message: error })}
        </div>
      )}
    </div>
  );
};

export default WebBrowseInline;

