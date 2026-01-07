"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  BranchPickerPrimitive,
  ActionBarPrimitive,
  AttachmentPrimitive,
  useThreadComposerAttachment,
  useMessageAttachment,
  useThread,
  useThreadRuntime,
  useThreadComposer,
  useMessage,
  useComposer,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  SendHorizontalIcon,
  PaperclipIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  PencilIcon,
  User,
  ClockIcon,
  XIcon,
  FlaskConicalIcon,
  SparklesIcon,
  Loader2Icon,
  CircleStopIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MarkdownText, UserMarkdownText } from "./markdown-text";
import { ToolFallback } from "./tool-fallback";
import { VectorSearchToolUI } from "./vector-search-inline";
import { ProductGalleryToolUI } from "./product-gallery-inline";
import { ExecuteCommandToolUI } from "./execute-command-tool-ui";
import { YouTubeInlinePreview } from "./youtube-inline";
import { TooltipIconButton } from "./tooltip-icon-button";
import { useCharacter, DEFAULT_CHARACTER } from "./character-context";
import { useOptionalDeepResearch } from "./deep-research-context";
import { DeepResearchPanel } from "./deep-research-panel";
import { GalleryProvider } from "./gallery-context";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";

interface ThreadProps {
  onSessionActivity?: (message: { id?: string; role: "user" | "assistant" }) => void;
}

export const Thread: FC<ThreadProps> = ({ onSessionActivity }) => {
  return (
    <TooltipProvider>
      <ThreadPrimitive.Root className="flex h-full flex-col bg-terminal-cream">
        <SessionActivityWatcher onSessionActivity={onSessionActivity} />
        <GalleryWrapper>
          <ThreadPrimitive.Viewport className="flex flex-1 flex-col items-center overflow-y-auto scroll-smooth px-4 pt-8">
            <ThreadWelcome />
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
                SystemMessage,
                EditComposer,
              }}
            />
            <div className="min-h-8 flex-shrink-0" />
          </ThreadPrimitive.Viewport>

          <div className="sticky bottom-0 mt-3 flex w-full max-w-4xl flex-col items-center justify-end rounded-t-lg bg-terminal-cream pb-4 mx-auto px-4">
            <ThreadScrollToBottom />
            <Composer />
          </div>
        </GalleryWrapper>
      </ThreadPrimitive.Root>
    </TooltipProvider>
  );
};

/**
 * GalleryWrapper provides the GalleryContext that enables gallery components
 * to attach images to the chat composer for referencing.
 */
const GalleryWrapper: FC<{ children: React.ReactNode }> = ({ children }) => {
  const threadRuntime = useThreadRuntime();

  const attachImageToComposer = useCallback(async (imageUrl: string, name: string) => {
    try {
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Determine file extension from content type
      const contentType = blob.type || 'image/jpeg';
      const extension = contentType.split('/')[1] || 'jpg';

      // Create a File object from the blob
      const fileName = name ? `${name.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}` : `gallery_image.${extension}`;
      const file = new File([blob], fileName, { type: contentType });

      // Add the file as an attachment to the composer
      await threadRuntime.composer.addAttachment(file);

      console.log(`[Gallery] Attached image: ${fileName}`);
    } catch (error) {
      console.error('[Gallery] Failed to attach image:', error);
      throw error;
    }
  }, [threadRuntime]);

  return (
    <GalleryProvider attachImageToComposer={attachImageToComposer}>
      {children}
    </GalleryProvider>
  );
};

const SessionActivityWatcher: FC<{ onSessionActivity?: (message: { id?: string; role: "user" | "assistant" }) => void }> = ({ onSessionActivity }) => {
  const messages = useThread((t) => t.messages);
  const previousCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!onSessionActivity) {
      previousCountRef.current = messages.length;
      return;
    }

    if (previousCountRef.current === null) {
      previousCountRef.current = messages.length;
      return;
    }

    if (messages.length > previousCountRef.current) {
      const newMessages = messages.slice(previousCountRef.current);
      const recent = [...newMessages]
        .reverse()
        .find((msg) => msg.role === "user" || msg.role === "assistant");

      if (recent) {
        onSessionActivity({ id: recent.id, role: recent.role as "user" | "assistant" });
      }
    }

    previousCountRef.current = messages.length;
  }, [messages, onSessionActivity]);

  return null;
};

const ThreadWelcome: FC = () => {
  const { character } = useCharacter();
  const displayChar = character || DEFAULT_CHARACTER;
  const welcomeRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("assistantUi");

  // Extract short labels for suggestion buttons (first 2-3 words or truncate)
  const getSuggestionLabel = (prompt: string): string => {
    const words = prompt.split(" ");
    if (words.length <= 3) return prompt;
    return words.slice(0, 3).join(" ") + "...";
  };

  // Entrance animation
  useEffect(() => {
    if (!welcomeRef.current || prefersReducedMotion) return;

    animate(welcomeRef.current, {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: ZLUTTY_DURATIONS.normal,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  // Ambient avatar animation
  useEffect(() => {
    if (!avatarRef.current || prefersReducedMotion) return;

    const anim = animate(avatarRef.current, {
      translateY: [-3, 3, -3],
      rotateY: [-2, 2, -2],
      duration: ZLUTTY_DURATIONS.ambientLoop,
      loop: true,
      ease: ZLUTTY_EASINGS.float,
    });

    return () => {
      anim.pause();
    };
  }, [prefersReducedMotion]);

  return (
    <ThreadPrimitive.Empty>
      <div ref={welcomeRef} className="flex flex-grow basis-full flex-col items-center justify-center" style={{ opacity: prefersReducedMotion ? 1 : 0 }}>
        {/* Character Avatar */}
        <div ref={avatarRef} className="transform-gpu" style={{ perspective: "500px" }}>
          <Avatar className="size-16 shadow-md">
            {displayChar.avatarUrl || displayChar.primaryImageUrl ? (
              <AvatarImage
                src={displayChar.avatarUrl || displayChar.primaryImageUrl || undefined}
                alt={displayChar.name}
              />
            ) : null}
            <AvatarFallback className="bg-terminal-green/10 text-2xl font-mono text-terminal-green">
              {displayChar.initials || <User className="size-8 text-terminal-green" />}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Character Name */}
        <p className="mt-4 text-xl font-semibold font-mono text-terminal-dark">
          {displayChar.displayName || displayChar.name}
        </p>

        {/* Tagline / Greeting */}
        <p className="mt-2 text-center text-terminal-muted font-mono text-sm max-w-md">
          {displayChar.exampleGreeting ||
            displayChar.tagline ||
            t("welcome.start", { name: displayChar.name })}
        </p>

        {/* Suggested Prompts */}
        {displayChar.suggestedPrompts && displayChar.suggestedPrompts.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {displayChar.suggestedPrompts.map((prompt, index) => (
              <ThreadPrimitive.Suggestion
                key={index}
                prompt={prompt}
                autoSend
                asChild
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs text-terminal-dark hover:bg-terminal-dark hover:text-terminal-cream transition-colors"
                >
                  {getSuggestionLabel(prompt)}
                </Button>
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        )}
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className="absolute -top-10 rounded-full disabled:invisible bg-terminal-cream text-terminal-dark hover:bg-terminal-dark hover:text-terminal-cream shadow-md"
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
};

// Interface for queued messages
interface QueuedMessage {
  id: string;
  content: string;
}

const Composer: FC = () => {
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Message queue state
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Prompt enhancement state
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementInfo, setEnhancementInfo] = useState<{
    filesFound?: number;
    chunksRetrieved?: number;
  } | null>(null);
  // Store enhanced prompt separately - display original query, send enhanced
  const [enhancedContext, setEnhancedContext] = useState<string | null>(null);

  // Get character context for enhancement
  const { character } = useCharacter();

  // Get thread state and runtime
  const isRunning = useThread((t) => t.isRunning);
  const threadRuntime = useThreadRuntime();
  const attachmentCount = useThreadComposer((c) => c.attachments.length);
  const t = useTranslations("assistantUi");
  const te = useTranslations("errors");

  // Deep Research mode (optional - may not be available)
  const deepResearch = useOptionalDeepResearch();
  const isDeepResearchMode = deepResearch?.isDeepResearchMode ?? false;
  const isDeepResearchActive = deepResearch?.isActive ?? false;
  const isDeepResearchLoading = deepResearch?.isLoading ?? false;
  const isOperationRunning = isRunning || isDeepResearchActive || isDeepResearchLoading;

  // Track if we're currently processing a queued message
  const isProcessingQueue = useRef(false);
  const isAwaitingRunStart = useRef(false);

  // Process queue when AI finishes responding
  useEffect(() => {
    if (isAwaitingRunStart.current && isRunning) {
      isAwaitingRunStart.current = false;
    }

    if (isProcessingQueue.current && !isRunning && !isAwaitingRunStart.current) {
      isProcessingQueue.current = false;
    }

    // Only process if: not running, has queued messages, and not already processing
    if (!isRunning && queuedMessages.length > 0 && !isProcessingQueue.current) {
      isProcessingQueue.current = true;
      isAwaitingRunStart.current = true;

      const nextMessage = queuedMessages[0];
      setQueuedMessages(prev => prev.slice(1));

      // Small delay to ensure the runtime is ready for the next message
      setTimeout(() => {
        threadRuntime.append({
          role: "user",
          content: [{ type: "text", text: nextMessage.content }],
        });
      }, 100);
    }
  }, [isRunning, queuedMessages, threadRuntime]);

  // Handle form submission
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const hasText = inputValue.trim().length > 0;
    const hasAttachments = attachmentCount > 0;

    if (!hasText && !hasAttachments) return;

    // If Deep Research mode is active, start research instead of regular chat
    if (isDeepResearchMode && deepResearch && hasText) {
      deepResearch.startResearch(inputValue.trim());
      setInputValue("");
      return;
    }

    // Determine what to send: enhanced context if available, otherwise original input
    const messageToSend = enhancedContext || inputValue.trim();

    if (isRunning) {
      // Queue the message when AI is busy (text only, no attachments for queued)
      if (hasText) {
        setQueuedMessages(prev => [...prev, {
          id: `queued-${Date.now()}`,
          content: messageToSend,
        }]);
      }
      setInputValue("");
      setEnhancedContext(null);
      setEnhancementInfo(null);
      // Clear attachments since we can't queue them
      if (hasAttachments) {
        threadRuntime.composer.clearAttachments();
      }
    } else {
      // Send immediately using composer runtime (includes attachments)
      // Use enhanced context if available, otherwise use original input
      threadRuntime.composer.setText(messageToSend);
      threadRuntime.composer.send();
      setInputValue("");
      setEnhancedContext(null);
      setEnhancementInfo(null);
    }
  }, [inputValue, isRunning, threadRuntime, attachmentCount, isDeepResearchMode, deepResearch, enhancedContext]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Remove a message from the queue
  const removeFromQueue = useCallback((id: string) => {
    setQueuedMessages(prev => prev.filter(msg => msg.id !== id));
  }, []);

  // Get recent messages for enhancement context
  const messages = useThread((t) => t.messages);

  // Handle prompt enhancement
  const handleEnhance = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || trimmedInput.length < 3) {
      toast.error(t("enhance.minChars"));
      return;
    }

    if (!character?.id || character.id === "default") {
      toast.error(t("enhance.selectAgent"));
      return;
    }

    setIsEnhancing(true);
    setEnhancementInfo(null);

    try {
      // Get last 3 messages for conversation context
      const recentMessages = messages.slice(-3).map((msg) => {
        // Extract text content from message
        const textContent = msg.content
          ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("\n") || "";
        return {
          role: msg.role,
          content: textContent,
        };
      });

      const response = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: trimmedInput,
          characterId: character.id,
          useLLM: true,
          conversationContext: recentMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || t("enhance.failed"));
        return;
      }

      if (data.success) {
        // Display the enhanced prompt in the input field so user can see/edit it
        setInputValue(data.enhancedPrompt);
        setEnhancedContext(data.enhancedPrompt);
        setEnhancementInfo({
          filesFound: data.filesFound,
          chunksRetrieved: data.chunksRetrieved,
        });
        const llmIndicator = data.usedLLM ? " (LLM)" : "";
        toast.success(t("enhance.success", { files: data.filesFound, chunks: data.chunksRetrieved, llmIndicator }));
      } else {
        toast.info(data.skipReason || t("enhance.skipped"));
        setEnhancedContext(null);
      }
    } catch (error) {
      console.error("[Enhance] Error:", error);
      toast.error(t("enhance.failed"));
    } finally {
      setIsEnhancing(false);
    }
  }, [inputValue, character?.id, messages, t]);

  const handleCancel = useCallback(() => {
    if (!isOperationRunning || isCancelling) return;
    setIsCancelling(true);

    if (isRunning) {
      threadRuntime.cancelRun();
    }

    if (deepResearch && (isDeepResearchActive || isDeepResearchLoading)) {
      deepResearch.cancelResearch();
    }
  }, [
    deepResearch,
    isCancelling,
    isDeepResearchActive,
    isDeepResearchLoading,
    isOperationRunning,
    isRunning,
    threadRuntime,
  ]);

  useEffect(() => {
    if (!isOperationRunning) {
      setIsCancelling(false);
    }
  }, [isOperationRunning]);

  // Auto-grow textarea height based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = "auto";

    // Calculate line height from computed styles (approx 1.5 * font-size for font-mono)
    const lineHeight = 24; // ~1.5rem for text-sm font-mono
    const minHeight = lineHeight * 1.5; // ~1.5 rows minimum
    const maxHeight = lineHeight * 8; // 8 rows maximum

    // Set height based on content, clamped to min/max
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height whenever input value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Focus animation
  const handleFocus = () => {
    if (!composerRef.current || prefersReducedMotion) return;
    animate(composerRef.current, {
      scale: [1, 1.01, 1],
      duration: ZLUTTY_DURATIONS.fast,
      ease: ZLUTTY_EASINGS.smooth,
    });
  };

  // Determine placeholder text
  const getPlaceholder = () => {
    if (isDeepResearchMode) return t("composer.placeholderResearch");
    if (isRunning) return t("composer.placeholderQueue");
    return t("composer.placeholderDefault");
  };

  return (
    <div className="relative w-full">
      {/* Deep Research Panel - shows when research is active */}
      {deepResearch && isDeepResearchActive && (
        <DeepResearchPanel
          phase={deepResearch.phase}
          phaseMessage={deepResearch.phaseMessage}
          progress={deepResearch.progress}
          findings={deepResearch.findings}
          finalReport={deepResearch.finalReport}
          error={deepResearch.error}
          onCancel={handleCancel}
          onReset={deepResearch.reset}
        />
      )}

      {/* Queued messages indicator */}
      {queuedMessages.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          <div className="text-xs text-terminal-muted font-mono flex items-center gap-1">
            <ClockIcon className="size-3" />
            {t("queue.messagesQueued", { count: queuedMessages.length })}
          </div>
          <div className="flex flex-wrap gap-1">
            {queuedMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex items-center gap-1 bg-terminal-dark/10 rounded px-2 py-1 text-xs font-mono text-terminal-dark"
              >
                <span className="max-w-32 truncate">{msg.content}</span>
                <button
                  onClick={() => removeFromQueue(msg.id)}
                  className="text-terminal-muted hover:text-red-500 transition-colors"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ComposerPrimitive.Root
        ref={composerRef}
        className={cn(
          "relative flex w-full flex-col rounded-lg shadow-md transition-shadow focus-within:shadow-lg transform-gpu",
          isDeepResearchMode
            ? "bg-purple-50/80 focus-within:bg-purple-50 border border-purple-200"
            : "bg-terminal-cream/80 focus-within:bg-terminal-cream"
        )}
        onFocus={handleFocus}
      >
        {/* Deep Research Mode Indicator */}
        {isDeepResearchMode && (
          <div className="flex items-center gap-2 px-4 pt-2 text-xs font-mono text-purple-600">
            <FlaskConicalIcon className="size-3" />
            {t("deepResearch.modeLabel")}
          </div>
        )}

        {/* Attachment previews */}
        <div className="flex flex-wrap gap-2 p-2 empty:hidden">
          <ComposerPrimitive.Attachments
            components={{ Attachment: ComposerAttachment }}
          />
        </div>
        <div className="flex items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Clear enhancement state when user edits (they may be modifying the enhanced text)
              if (enhancedContext || enhancementInfo) {
                setEnhancedContext(null);
                setEnhancementInfo(null);
              }
            }}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={getPlaceholder()}
            rows={1}
            className="flex-1 resize-none bg-transparent p-4 text-sm font-mono outline-none placeholder:text-terminal-muted text-terminal-dark overflow-y-auto transition-[height] duration-150 ease-out"
            style={{ minHeight: "36px", maxHeight: "192px" }}
          />

          <div className="flex items-center gap-1 p-2">
            {isOperationRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="h-8 px-2 text-xs font-mono"
                  >
                    {isCancelling ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <CircleStopIcon className="size-3" />
                    )}
                    {t("composer.stop")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
                  {t("tooltips.stopResponse")}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Deep Research Toggle */}
            {deepResearch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={deepResearch.toggleDeepResearchMode}
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

            {/* Enhance Button - prominent styling to encourage use */}
            {character?.id && character.id !== "default" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleEnhance}
                    disabled={isEnhancing || isRunning || !inputValue.trim() || inputValue.trim().length < 3 || isDeepResearchMode}
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
                    {/* Show checkmark badge when enhanced */}
                    {enhancedContext && (
                      <span className="absolute -top-1 -right-1 size-3 bg-emerald-500 rounded-full flex items-center justify-center">
                        <CheckIcon className="size-2 text-white" />
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs max-w-xs">
                  {enhancedContext
                    ? t("enhance.tooltipEnhanced", { files: enhancementInfo?.filesFound || 0 })
                    : t("enhance.tooltipDefault")}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  size="icon"
                  className={cn(
                    "size-8 text-terminal-cream",
                    isDeepResearchMode
                      ? "bg-purple-600 hover:bg-purple-700"
                      : isRunning
                        ? "bg-terminal-amber hover:bg-terminal-amber/90"
                        : "bg-terminal-dark hover:bg-terminal-dark/90"
                  )}
                  disabled={(!inputValue.trim() && attachmentCount === 0) || deepResearch?.isLoading}
                >
                  {deepResearch?.isLoading ? (
                    <RefreshCwIcon className="size-4 animate-spin" />
                  ) : isDeepResearchMode ? (
                    <FlaskConicalIcon className="size-4" />
                  ) : isRunning ? (
                    <ClockIcon className="size-4" />
                  ) : (
                    <SendHorizontalIcon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
                {isDeepResearchMode ? t("tooltips.startResearch") : isRunning ? t("tooltips.queueMessage") : t("tooltips.sendMessage")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const ComposerAttachment: FC = () => {
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

const UserMessage: FC = () => {
  const messageRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!messageRef.current || prefersReducedMotion) return;

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
      className="relative mb-6 flex w-full max-w-[80rem] flex-col items-end gap-2 pl-8 transform-gpu"
      style={{ opacity: prefersReducedMotion ? 1 : 0 }}
    >
      <div className="flex items-start gap-3">
        <UserActionBar />
        <div className="flex max-w-[80rem] flex-col gap-1">
          <div className="flex flex-wrap gap-2 justify-end empty:hidden">
            <MessagePrimitive.Attachments
              components={{ Attachment: UserAttachment }}
            />
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-terminal-dark px-4 py-2.5 text-terminal-cream font-mono text-sm">
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

const UserAttachment: FC = () => {
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

const SystemMessage: FC = () => {
  const messageRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!messageRef.current || prefersReducedMotion) return;

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
      style={{ opacity: prefersReducedMotion ? 1 : 0 }}
    >
      <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-mono text-red-700 shadow-sm">
        <CircleStopIcon className="size-3" />
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
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

const EditComposer: FC = () => {
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

const AssistantMessage: FC = () => {
  const { character } = useCharacter();
  const displayChar = character || DEFAULT_CHARACTER;
  const messageRef = useRef<HTMLDivElement>(null);
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
    if (!messageRef.current || prefersReducedMotion) return;

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
      className="relative mb-6 flex w-full max-w-[80rem] gap-3 pr-8 transform-gpu"
      style={{ opacity: prefersReducedMotion ? 1 : 0 }}
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

      <div className="flex flex-col gap-2 flex-1">
        <div className="flex flex-col gap-1 font-mono text-sm text-terminal-dark">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
              tools: {
                by_name: {
                  vectorSearch: VectorSearchToolUI,
                  showProductImages: ProductGalleryToolUI,
                  executeCommand: ExecuteCommandToolUI,
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
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC = () => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center gap-1 text-xs text-terminal-muted font-mono"
    >
      <BranchPickerPrimitive.Previous asChild>
        <Button variant="ghost" size="icon" className="size-6 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10">
          ←
        </Button>
      </BranchPickerPrimitive.Previous>
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      <BranchPickerPrimitive.Next asChild>
        <Button variant="ghost" size="icon" className="size-6 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10">
          →
        </Button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const t = useTranslations("assistantUi");
  const handleCopyClick = useCallback(() => {
    toast.success(t("toast.copied"));
  }, [t]);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex gap-1"
    >
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
