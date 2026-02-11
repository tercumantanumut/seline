"use client";

import type { FC } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  Loader2Icon,
  ZapIcon,
  PlusCircleIcon,
  ArrowRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ContextWindowBlockedPayload {
  message: string;
  details?: string;
  status?: string;
  recovery?: { action?: string; message?: string };
  compactionResult?: {
    success?: boolean;
    tokensFreed?: number;
    messagesCompacted?: number;
  };
}

interface ContextWindowBlockedBannerProps {
  payload: ContextWindowBlockedPayload;
  onCompact?: () => Promise<{ success: boolean; compacted: boolean }>;
  onNewSession?: () => void;
  onDismiss?: () => void;
  isCompacting?: boolean;
}

/**
 * Banner displayed when the chat API returns a 413 context-window-exceeded error.
 *
 * Shows:
 * - Error description with details
 * - Compaction result (if auto-compaction was attempted)
 * - Action buttons: Try Compact / Start New Session
 */
export const ContextWindowBlockedBanner: FC<ContextWindowBlockedBannerProps> = ({
  payload,
  onCompact,
  onNewSession,
  onDismiss,
  isCompacting = false,
}) => {
  const t = useTranslations("chat.contextWindow.blocked");
  const [compactResult, setCompactResult] = useState<{
    success: boolean;
    compacted: boolean;
  } | null>(null);

  const handleCompact = async () => {
    if (!onCompact) return;
    const result = await onCompact();
    setCompactResult(result);
  };

  const autoCompactAttempted = payload.compactionResult != null;
  const autoCompactSucceeded = payload.compactionResult?.success === true;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-lg border border-red-200 bg-red-50/80 p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="size-5 shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-mono font-semibold text-red-700">
              {t("title")}
            </h4>
            <p className="mt-1 text-xs font-mono text-red-600/80">
              {payload.details || t("message")}
            </p>

            {/* Auto-compaction result */}
            {autoCompactAttempted && (
              <div
                className={cn(
                  "mt-2 rounded-md px-3 py-2 text-xs font-mono",
                  autoCompactSucceeded
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                )}
              >
                {autoCompactSucceeded
                  ? t("compactSuccess", {
                      messagesCompacted:
                        payload.compactionResult?.messagesCompacted ?? 0,
                      tokensFreed:
                        payload.compactionResult?.tokensFreed ?? 0,
                    })
                  : t("compactFailed")}
              </div>
            )}

            {/* Manual compact result */}
            {compactResult && (
              <div
                className={cn(
                  "mt-2 rounded-md px-3 py-2 text-xs font-mono",
                  compactResult.success
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                )}
              >
                {compactResult.success
                  ? "Compaction succeeded — try sending your message again."
                  : t("compactFailed")}
              </div>
            )}

            {/* Recovery hint from server */}
            {payload.recovery?.message && (
              <p className="mt-2 text-[11px] font-mono text-red-500/70 italic">
                {payload.recovery.message}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 pl-8">
          {onCompact && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs font-mono border-red-200 text-red-700 hover:bg-red-100"
              onClick={handleCompact}
              disabled={isCompacting}
            >
              {isCompacting ? (
                <Loader2Icon className="size-3 animate-spin mr-1.5" />
              ) : (
                <ZapIcon className="size-3 mr-1.5" />
              )}
              {t("actions.tryCompact")}
            </Button>
          )}
          {onNewSession && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs font-mono border-red-200 text-red-700 hover:bg-red-100"
              onClick={onNewSession}
            >
              <PlusCircleIcon className="size-3 mr-1.5" />
              {t("actions.newSession")}
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs font-mono text-red-500/60 hover:text-red-700"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
