"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposerPrimitive,
  MessagePrimitive,
  BranchPickerPrimitive,
  ActionBarPrimitive,
  AttachmentPrimitive,
  useThreadComposerAttachment,
  useMessageAttachment,
  useMessage,
} from "@assistant-ui/react";
import {
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  PencilIcon,
  CircleStopIcon,
  Volume2Icon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MarkdownText, UserMarkdownText } from "./markdown-text";
import { ToolFallback } from "./tool-fallback";
import { ToolCallGroup } from "./tool-call-group";
import { VectorSearchToolUI } from "./vector-search-inline";
import { ProductGalleryToolUI } from "./product-gallery-inline";
import { ExecuteCommandToolUI } from "./execute-command-tool-ui";
import { EditFileToolUI } from "./edit-file-tool-ui";
import { PatchFileToolUI } from "./patch-file-tool-ui";
import { CalculatorToolUI } from "./calculator-tool-ui";
import { PlanToolUI } from "./plan-tool-ui";
import { SpeakAloudToolUI, TranscribeToolUI } from "./voice-tool-ui";
import { ChromiumWorkspaceToolUI } from "./chromium-workspace-tool-ui";
import { useOptionalVoice } from "./voice-context";
import { YouTubeInlinePreview } from "./youtube-inline";
import { TooltipIconButton } from "./tooltip-icon-button";
import { useCharacter, DEFAULT_CHARACTER } from "./character-context";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";

export const ComposerAttachment: FC = () => {
  const attachment = useThreadComposerAttachment((a) => a);
  const isUploading = attachment.status?.type === "running";

  // Get image URL from content if available
  const imageContent = attachment.content?.find(
    (c): c is { type: "image"; image: string } => c.type === "image"
  );
  const imageUrl = imageContent?.image;

  return (
    <AttachmentPrimitive.Root className="relative flex size-16 items-center justify-center rounded-lg bg-terminal-cream shadow-sm overflow-hidden">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={attachment.name}
          className="size-full object-cover"
        />
      ) : (
        <AttachmentPrimitive.unstable_Thumb className="size-full flex items-center justify-center text-xs text-terminal-muted font-mono" />
      )}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-cream/80">
          <div className="size-4 animate-spin rounded-full border-2 border-terminal-green border-t-transparent" />
        </div>
      )}
      <AttachmentPrimitive.Remove className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-terminal-cream shadow-sm text-xs font-mono hover:bg-red-50 hover:text-red-600">
        ×
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};

export const UserMessage: FC = () => {
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!messageRef.current || prefersReducedMotion || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    animate(messageRef.current, {
      opacity: [0, 1],
      translateX: [10, 0],
      duration: ZLUTTY_DURATIONS.fast,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  return (
    <MessagePrimitive.Root
      ref={messageRef}
      className="relative mb-6 flex w-full max-w-[80rem] min-w-0 flex-col items-end gap-2 pl-8 transform-gpu"
      style={{
        opacity: prefersReducedMotion ? 1 : 0,
        contain: 'layout style'
      }}
    >
      <div className="flex items-start gap-3">
        <UserActionBar />
        <div className="flex min-w-0 max-w-[80rem] flex-col gap-1">
          <div className="flex flex-wrap gap-2 justify-end empty:hidden">
            <MessagePrimitive.Attachments
              components={{ Attachment: UserAttachment }}
            />
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-terminal-dark px-4 py-2.5 text-terminal-cream font-mono text-sm [overflow-wrap:anywhere]">
            <MessagePrimitive.Content components={{ Text: UserMarkdownText }} />
          </div>
        </div>
        <Avatar className="size-8 shadow-sm">
          <AvatarFallback className="bg-terminal-amber/20 text-terminal-amber text-xs font-mono">
            U
          </AvatarFallback>
        </Avatar>
      </div>
      <BranchPicker />
    </MessagePrimitive.Root>
  );
};

export const UserAttachment: FC = () => {
  const attachment = useMessageAttachment((a) => a);

  // Get image URL from content if available
  const imageContent = attachment.content?.find(
    (c): c is { type: "image"; image: string } => c.type === "image"
  );
  const imageUrl = imageContent?.image;

  return (
    <AttachmentPrimitive.Root className="relative flex size-20 items-center justify-center rounded-lg bg-terminal-cream shadow-sm overflow-hidden">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={attachment.name}
          className="size-full object-cover"
        />
      ) : (
        <AttachmentPrimitive.unstable_Thumb className="size-full flex items-center justify-center text-xs text-terminal-muted font-mono" />
      )}
    </AttachmentPrimitive.Root>
  );
};

export const SystemMessage: FC = () => {
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!messageRef.current || prefersReducedMotion || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    animate(messageRef.current, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: ZLUTTY_DURATIONS.fast,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  return (
    <MessagePrimitive.Root
      ref={messageRef}
      className="relative mb-6 flex w-full max-w-[80rem] justify-center px-4 transform-gpu"
      style={{
        opacity: prefersReducedMotion ? 1 : 0,
        contain: 'layout style'
      }}
    >
      <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-mono text-red-700 shadow-sm">
        <CircleStopIcon className="size-3" />
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
};

export const UserActionBar: FC = () => {
  const t = useTranslations("assistantUi");
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end gap-1 mt-2"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton
          tooltip={t("tooltips.edit")}
          side="left"
          className="text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
        >
          <PencilIcon className="size-3" />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

export const EditComposer: FC = () => {
  const t = useTranslations("assistantUi");

  return (
    <ComposerPrimitive.Root className="mb-6 flex w-full max-w-[80rem] flex-col gap-2 pl-8">
      <div className="flex flex-col gap-2 rounded-2xl bg-terminal-dark/5 p-4">
        <ComposerPrimitive.Input
          className="flex-1 resize-none bg-transparent text-sm font-mono outline-none placeholder:text-terminal-muted text-terminal-dark min-h-[60px]"
          placeholder={t("composer.editPlaceholder")}
        />
        <div className="flex items-center justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs text-terminal-muted hover:text-terminal-dark"
            >
              {t("composer.cancel")}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button
              size="sm"
              className="font-mono text-xs bg-terminal-dark text-terminal-cream hover:bg-terminal-dark/90"
            >
              {t("composer.save")}
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

export const AssistantMessage: FC<{ ttsEnabled?: boolean }> = ({ ttsEnabled = false }) => {
  const { character } = useCharacter();
  const displayChar = character || DEFAULT_CHARACTER;
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  // Access message metadata for token usage
  // assistant-ui stores custom metadata in message.metadata.custom
  // and step-level usage in message.metadata.steps
  const message = useMessage();
  const customMetadata = message?.metadata?.custom as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } | undefined;
  const steps = message?.metadata?.steps as Array<{ usage?: { promptTokens?: number; completionTokens?: number } }> | undefined;

  // Try custom metadata first (from our database), then fall back to step usage
  const tokenUsage = customMetadata?.usage || (steps?.length ? {
    inputTokens: steps.reduce((sum, s) => sum + (s.usage?.promptTokens || 0), 0),
    outputTokens: steps.reduce((sum, s) => sum + (s.usage?.completionTokens || 0), 0),
  } : undefined);

  // Extract text content from message for YouTube preview detection
  const messageText = useMemo(() => {
    const content = message?.content;
    if (!content || !Array.isArray(content)) return "";
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }, [message?.content]);

  useEffect(() => {
    if (!messageRef.current || prefersReducedMotion || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    animate(messageRef.current, {
      opacity: [0, 1],
      translateX: [-10, 0],
      duration: ZLUTTY_DURATIONS.fast,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  return (
    <MessagePrimitive.Root
      ref={messageRef}
      className="relative mb-6 flex w-full max-w-[80rem] min-w-0 gap-3 pr-8 transform-gpu"
      style={{
        opacity: prefersReducedMotion ? 1 : 0,
        contain: 'layout style'
      }}
    >
      <Avatar className="size-8 shrink-0 shadow-sm">
        {displayChar.avatarUrl || displayChar.primaryImageUrl ? (
          <AvatarImage
            src={displayChar.avatarUrl || displayChar.primaryImageUrl || undefined}
            alt={displayChar.name}
          />
        ) : null}
        <AvatarFallback className="bg-terminal-green/20 text-terminal-green text-xs font-mono">
          {displayChar.initials || displayChar.name.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-1 font-mono text-sm text-terminal-dark [overflow-wrap:anywhere]">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
              ToolGroup: ToolCallGroup,
              tools: {
                by_name: {
                  vectorSearch: VectorSearchToolUI,
                  showProductImages: ProductGalleryToolUI,
                  executeCommand: ExecuteCommandToolUI,
                  editFile: EditFileToolUI,
                  writeFile: EditFileToolUI,
                  patchFile: PatchFileToolUI,
                  calculator: CalculatorToolUI,
                  updatePlan: PlanToolUI,
                  speakAloud: SpeakAloudToolUI,
                  transcribe: TranscribeToolUI,
                  chromiumWorkspace: ChromiumWorkspaceToolUI,
                },
                Fallback: ToolFallback,
              },
            }}
          />
        </div>

        {/* YouTube video preview for any YouTube URLs in the message */}
        {messageText && <YouTubeInlinePreview messageText={messageText} />}

        {/* Token usage display */}
        {(tokenUsage?.inputTokens || tokenUsage?.outputTokens) && (
          <div className="text-[10px] text-terminal-muted/60 font-mono">
            {tokenUsage.inputTokens?.toLocaleString() || 0}↓ {tokenUsage.outputTokens?.toLocaleString() || 0}↑
          </div>
        )}

        <BranchPicker />
        <AssistantActionBar ttsEnabled={ttsEnabled} messageText={messageText} />
      </div>
    </MessagePrimitive.Root>
  );
};

export const BranchPicker: FC = () => {
  const t = useTranslations("assistantUi");
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center gap-1 text-xs text-terminal-muted font-mono"
    >
      <BranchPickerPrimitive.Previous asChild>
        <Button variant="ghost" size="icon" aria-label={t("prevBranch")} className="size-6 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10">
          ←
        </Button>
      </BranchPickerPrimitive.Previous>
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      <BranchPickerPrimitive.Next asChild>
        <Button variant="ghost" size="icon" aria-label={t("nextBranch")} className="size-6 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10">
          →
        </Button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

export const AssistantActionBar: FC<{ ttsEnabled?: boolean; messageText?: string }> = ({
  ttsEnabled = false,
  messageText,
}) => {
  const t = useTranslations("assistantUi");
  const voiceCtx = useOptionalVoice();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioUrlRef = useRef<string | null>(null);
  const sanitizedMessageText = (messageText || "").trim();
  const handleCopyClick = useCallback(() => {
    toast.success(t("toast.copied"));
  }, [t]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const isPlayingCurrentMessage = Boolean(
    voiceCtx?.voice.isPlaying &&
    audioUrlRef.current &&
    voiceCtx.voice.currentAudioUrl === audioUrlRef.current
  );

  const handleSpeakClick = useCallback(async () => {
    if (!ttsEnabled || !sanitizedMessageText) {
      return;
    }

    if (isPlayingCurrentMessage && voiceCtx) {
      voiceCtx.stopAudio();
      return;
    }

    setIsSpeaking(true);
    voiceCtx?.setSynthesizing(true);
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sanitizedMessageText }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || t("toast.synthesizeFailed"));
      }

      const audioBlob = await response.blob();
      if (!audioBlob.size) {
        throw new Error("No audio generated");
      }

      const nextAudioUrl = URL.createObjectURL(audioBlob);
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioUrlRef.current = nextAudioUrl;

      if (voiceCtx) {
        voiceCtx.playAudio(nextAudioUrl);
      } else {
        const audio = new Audio(nextAudioUrl);
        void audio.play();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("toast.synthesizeFailed");
      toast.error(errorMessage);
    } finally {
      setIsSpeaking(false);
      voiceCtx?.setSynthesizing(false);
    }
  }, [isPlayingCurrentMessage, sanitizedMessageText, ttsEnabled, voiceCtx]);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex gap-1"
    >
      {ttsEnabled && sanitizedMessageText.length > 0 && (
        <TooltipIconButton
          tooltip={isPlayingCurrentMessage ? t("tooltips.stopAudio") : t("tooltips.readAloud")}
          side="bottom"
          className="text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
          onClick={handleSpeakClick}
          disabled={isSpeaking}
        >
          {isSpeaking ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : isPlayingCurrentMessage ? (
            <CircleStopIcon className="size-3" />
          ) : (
            <Volume2Icon className="size-3" />
          )}
        </TooltipIconButton>
      )}
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton
          tooltip={t("tooltips.copy")}
          side="bottom"
          className="text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
          onClick={handleCopyClick}
        >
          <MessagePrimitive.If copied>
            <CheckIcon className="size-3" />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon className="size-3" />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton
          tooltip={t("tooltips.regenerate")}
          side="bottom"
          className="text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
        >
          <RefreshCwIcon className="size-3" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};
