"use client";

import type { FC } from "react";
import { ComposerPrimitive } from "@assistant-ui/react";
import {
  SendHorizontalIcon,
  PaperclipIcon,
  CheckIcon,
  RefreshCwIcon,
  ClockIcon,
  FlaskConicalIcon,
  SparklesIcon,
  Loader2Icon,
  CircleStopIcon,
  MicIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { ModelBagPopover } from "./model-bag-popover";

interface ComposerActionBarProps {
  // Operation state
  isOperationRunning: boolean;
  isCancelling: boolean;
  isQueueBlocked: boolean;
  isRunning: boolean;
  isDeepResearchMode: boolean;
  isDeepResearchActive: boolean;
  isDeepResearchLoading: boolean;
  mcpIsReloading: boolean;
  mcpEstimatedTimeRemaining: number;
  // Session / model
  sessionId?: string;
  // Deep research
  onToggleDeepResearch?: () => void;
  // Voice
  sttEnabled: boolean;
  isRecordingVoice: boolean;
  isTranscribingVoice: boolean;
  onVoiceInput: () => void;
  // Attachment / send
  inputHasText: boolean;
  attachmentCount: number;
  // Enhance
  showEnhanceButton: boolean;
  isEnhancing: boolean;
  enhancedContext: string | null;
  enhancementFilesFound: number;
  onEnhance: () => void;
  // Cancel / send
  onCancel: () => void;
  onSubmit: () => void;
}

export const ComposerActionBar: FC<ComposerActionBarProps> = ({
  isOperationRunning,
  isCancelling,
  isQueueBlocked,
  isRunning,
  isDeepResearchMode,
  isDeepResearchActive,
  isDeepResearchLoading,
  mcpIsReloading,
  mcpEstimatedTimeRemaining: _mcpEstimatedTimeRemaining,
  sessionId,
  onToggleDeepResearch,
  sttEnabled,
  isRecordingVoice,
  isTranscribingVoice,
  onVoiceInput,
  inputHasText,
  attachmentCount,
  showEnhanceButton,
  isEnhancing,
  enhancedContext,
  enhancementFilesFound,
  onEnhance,
  onCancel,
  onSubmit,
}) => {
  const t = useTranslations("assistantUi");

  return (
    <div className="flex items-center gap-1 p-2">
      {isOperationRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling || mcpIsReloading}
              className="h-8 px-2 text-xs font-mono"
            >
              {isCancelling ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <CircleStopIcon className="size-3" />
              )}
              {mcpIsReloading ? t("composer.initializing") : t("composer.stop")}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
            {mcpIsReloading ? t("tooltips.toolsInitializing") : t("tooltips.stopResponse")}
          </TooltipContent>
        </Tooltip>
      )}

      {sessionId && <ModelBagPopover sessionId={sessionId} />}

      {onToggleDeepResearch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleDeepResearch}
              disabled={isDeepResearchActive || isRunning}
              className={cn(
                "size-8",
                isDeepResearchMode
                  ? "text-purple-600 bg-purple-100 hover:bg-purple-200"
                  : "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
              )}
            >
              <FlaskConicalIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
            {isDeepResearchMode ? t("deepResearch.disable") : t("deepResearch.enable")}
          </TooltipContent>
        </Tooltip>
      )}

      {sttEnabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onVoiceInput}
              disabled={isTranscribingVoice || mcpIsReloading}
              className={cn(
                "size-8",
                isRecordingVoice
                  ? "text-red-600 bg-red-100 hover:bg-red-200"
                  : "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
              )}
            >
              {isTranscribingVoice ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : isRecordingVoice ? (
                <CircleStopIcon className="size-4" />
              ) : (
                <MicIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
            {isTranscribingVoice
              ? t("tooltips.transcribingAudio")
              : isRecordingVoice
                ? t("tooltips.stopVoiceInput")
                : t("tooltips.voiceInput")}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <ComposerPrimitive.AddAttachment asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
              disabled={isDeepResearchMode}
            >
              <PaperclipIcon className="size-4" />
            </Button>
          </ComposerPrimitive.AddAttachment>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          {t("tooltips.addImage")}
        </TooltipContent>
      </Tooltip>

      {showEnhanceButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEnhance}
              disabled={isEnhancing || isRunning || !inputHasText || isDeepResearchMode}
              className={cn(
                "size-8 relative",
                enhancedContext
                  ? "text-emerald-600 bg-emerald-100 hover:bg-emerald-200"
                  : "text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200"
              )}
            >
              {isEnhancing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {enhancedContext && (
                <span className="absolute -top-1 -right-1 size-3 bg-emerald-500 rounded-full flex items-center justify-center">
                  <CheckIcon className="size-2 text-white" />
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs max-w-xs">
            {enhancedContext
              ? t("enhance.tooltipEnhanced", { files: enhancementFilesFound })
              : t("enhance.tooltipDefault")}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            onClick={onSubmit}
            size="icon"
            className={cn(
              "size-8 text-terminal-cream",
              isDeepResearchMode
                ? "bg-purple-600 hover:bg-purple-700"
                : isQueueBlocked
                  ? "bg-terminal-amber hover:bg-terminal-amber/90"
                  : "bg-terminal-dark hover:bg-terminal-dark/90"
            )}
            disabled={(!inputHasText && attachmentCount === 0) || isDeepResearchLoading}
          >
            {isDeepResearchLoading ? (
              <RefreshCwIcon className="size-4 animate-spin" />
            ) : isDeepResearchMode ? (
              <FlaskConicalIcon className="size-4" />
            ) : isQueueBlocked ? (
              <ClockIcon className="size-4" />
            ) : (
              <SendHorizontalIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          {isDeepResearchMode
            ? t("tooltips.startResearch")
            : isQueueBlocked
              ? t("tooltips.queueMessage")
              : t("tooltips.sendMessage")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
