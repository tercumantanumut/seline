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
  PackageIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
import { ToolCallGroup } from "./tool-call-group";
import { VectorSearchToolUI } from "./vector-search-inline";
import { ProductGalleryToolUI } from "./product-gallery-inline";
import { ExecuteCommandToolUI } from "./execute-command-tool-ui";
import { EditFileToolUI } from "./edit-file-tool-ui";
import { PatchFileToolUI } from "./patch-file-tool-ui";
import { CalculatorToolUI } from "./calculator-tool-ui";
import { PlanToolUI } from "./plan-tool-ui";
import { SpeakAloudToolUI, TranscribeToolUI } from "./voice-tool-ui";
import { YouTubeInlinePreview } from "./youtube-inline";
import { TooltipIconButton } from "./tooltip-icon-button";
import FileMentionAutocomplete from "./file-mention-autocomplete";
import { useCharacter, DEFAULT_CHARACTER } from "./character-context";
import { useOptionalDeepResearch } from "./deep-research-context";
import { DeepResearchPanel } from "./deep-research-panel";
import { GalleryProvider } from "./gallery-context";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";
import { useMCPReloadStatus } from "@/hooks/use-mcp-reload-status";
import { useModelBag } from "@/components/model-bag/use-model-bag";
import { PROVIDER_THEME } from "@/components/model-bag/model-bag.constants";
import { getModelIcon } from "@/components/model-bag/model-bag.utils";
import type { ModelItem, LLMProvider } from "@/components/model-bag/model-bag.types";
import { useContextStatus } from "@/lib/hooks/use-context-status";
import { ContextWindowIndicator } from "./context-window-indicator";
import {
  ContextWindowBlockedBanner,
  type ContextWindowBlockedPayload,
} from "./context-window-blocked-banner";
import { resilientPost, resilientPut } from "@/lib/utils/resilient-fetch";


interface ThreadProps {
  onSessionActivity?: (message: { id?: string; role: "user" | "assistant" }) => void;
  footer?: React.ReactNode;
  isBackgroundTaskRunning?: boolean;
  isProcessingInBackground?: boolean;
  sessionId?: string;
  onCancelBackgroundRun?: () => void;
  isCancellingBackgroundRun?: boolean;
  canCancelBackgroundRun?: boolean;
  isZombieBackgroundRun?: boolean;
}

export const Thread: FC<ThreadProps> = ({
  onSessionActivity,
  footer,
  isBackgroundTaskRunning = false,
  isProcessingInBackground = false,
  sessionId,
  onCancelBackgroundRun,
  isCancellingBackgroundRun = false,
  canCancelBackgroundRun = false,
  isZombieBackgroundRun = false,
}) => {
  const isRunning = useThread((t) => t.isRunning);
  const router = useRouter();
  const { character } = useCharacter();
  const threadRuntime = useThreadRuntime();
  const t = useTranslations("assistantUi");
  
  // Drag and drop state for full-page drop zone
  const [isDragging, setIsDragging] = useState(false);
  const [isImportingSkill, setIsImportingSkill] = useState(false);
  const dragCounter = useRef(0);

  // Deep research mode (for drag-drop gating)
  const deepResearch = useOptionalDeepResearch();
  const isDeepResearchMode = deepResearch?.isDeepResearchMode ?? false;

  // ── Drag-and-drop handlers (full-page drop zone) ──────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDragging(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);

      // Block drops in deep research mode
      if (isDeepResearchMode) {
        toast.error(t("composer.attachmentsDisabledResearch"));
        return;
      }

      const files = Array.from(e.dataTransfer.files);

      // ── Skill files (.zip / .md) ──────────────────────────────────
      const skillFiles = files.filter(
        (f) => f.name.endsWith(".zip") || f.name.endsWith(".md")
      );

      if (skillFiles.length > 0) {
        const skillFile = skillFiles[0];

        if (!character?.id || character.id === "default") {
          toast.error("Please select an agent before importing skills");
          return;
        }

        const MAX_SKILL_SIZE = 50 * 1024 * 1024;
        if (skillFile.size > MAX_SKILL_SIZE) {
          toast.error("Skill file exceeds 50MB limit", {
            description: `File size: ${Math.round(skillFile.size / 1024 / 1024)}MB`,
          });
          return;
        }

        setIsImportingSkill(true);
        try {
          const formData = new FormData();
          formData.append("file", skillFile);
          formData.append("characterId", character.id);

          const response = await fetch("/api/skills/import", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Import failed");
          }

          const result = await response.json();

          toast.success("Skill imported successfully", {
            description: `${result.skillName} is ready to use`,
            action: {
              label: "View Skills",
              onClick: () => router.push(`/agents/${character.id}/skills`),
            },
          });
        } catch (error) {
          console.error("[Thread] Skill import failed:", error);
          toast.error("Skill import failed", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          setIsImportingSkill(false);
        }
        return;
      }

      // ── Image attachments ─────────────────────────────────────────
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        toast.error(t("composer.onlyImagesSupported"));
        return;
      }

      const MAX_SIZE = 10 * 1024 * 1024;
      const oversizedFiles = imageFiles.filter((f) => f.size > MAX_SIZE);

      if (oversizedFiles.length > 0) {
        toast.error(
          t("composer.someFilesTooLarge", {
            count: oversizedFiles.length,
            max: 10,
          })
        );
        return;
      }

      let successCount = 0;
      for (const file of imageFiles) {
        try {
          await threadRuntime.composer.addAttachment(file);
          successCount++;
        } catch (error) {
          console.error("[Thread] Failed to attach dropped file:", file.name, error);
        }
      }

      if (successCount > 0) {
        toast.success(t("composer.filesDropped", { count: successCount }));
      } else {
        toast.error(t("composer.dropError"));
      }
    },
    [threadRuntime, t, isDeepResearchMode, character, router]
  );

  // Context window status tracking
  const {
    status: contextStatus,
    isLoading: contextLoading,
    refresh: refreshContextStatus,
    compact: triggerCompact,
    isCompacting,
  } = useContextStatus({ sessionId });

  // Blocked banner state — set when a 413 error is received
  const [blockedPayload, setBlockedPayload] =
    useState<ContextWindowBlockedPayload | null>(null);

  // Refresh context status after each session activity (message sent/received)
  const wrappedOnSessionActivity = useCallback(
    (message: { id?: string; role: "user" | "assistant" }) => {
      onSessionActivity?.(message);
      // Refresh context status after assistant responds (slight delay for DB to settle)
      if (message.role === "assistant") {
        setTimeout(() => refreshContextStatus(), 1500);
      }
    },
    [onSessionActivity, refreshContextStatus]
  );

  return (
    <TooltipProvider>
      <ThreadPrimitive.Root
        className="flex h-full flex-col bg-terminal-cream"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Full-page drop zone overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-dark/40 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-terminal-green bg-terminal-cream/95 px-12 py-10 shadow-2xl">
              <PaperclipIcon className="size-10 text-terminal-green animate-bounce" />
              <span className="text-lg font-semibold font-mono text-terminal-dark">
                {t("composer.dropHint")}
              </span>
              <span className="text-sm font-mono text-terminal-muted">
                {t("composer.dropHintSubtext")}
              </span>
              {isImportingSkill && (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2Icon className="size-4 animate-spin text-terminal-green" />
                  <span className="text-xs font-mono text-terminal-muted">Importing skill…</span>
                </div>
              )}
            </div>
          </div>
        )}
        <SessionActivityWatcher onSessionActivity={wrappedOnSessionActivity} />
        <GalleryWrapper>
          <ThreadPrimitive.Viewport className={cn(
            "flex min-w-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto px-4 pt-8 [overflow-anchor:auto]",
            !isRunning && "scroll-smooth"
          )}>
            <ThreadWelcome />
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
                SystemMessage,
                EditComposer,
              }}
            />
            {/* Context window blocked banner */}
            {blockedPayload && (
              <ContextWindowBlockedBanner
                payload={blockedPayload}
                onCompact={async () => {
                  const result = await triggerCompact();
                  if (result.success) {
                    setTimeout(() => setBlockedPayload(null), 2000);
                  }
                  return result;
                }}
                onDismiss={() => setBlockedPayload(null)}
                isCompacting={isCompacting}
              />
            )}
            {footer}
            <div className="min-h-8 flex-shrink-0 [overflow-anchor:auto]" />
          </ThreadPrimitive.Viewport>

          <div className="sticky bottom-0 mt-3 flex w-full max-w-4xl flex-col items-center justify-end rounded-t-lg bg-terminal-cream pb-4 mx-auto px-4">
            <ThreadScrollToBottom />
            <Composer 
              isBackgroundTaskRunning={isBackgroundTaskRunning} 
              isProcessingInBackground={isProcessingInBackground}
              sessionId={sessionId}
              onCancelBackgroundRun={onCancelBackgroundRun}
              isCancellingBackgroundRun={isCancellingBackgroundRun}
              canCancelBackgroundRun={canCancelBackgroundRun}
              isZombieBackgroundRun={isZombieBackgroundRun}
              contextStatus={contextStatus}
              contextLoading={contextLoading}
              onCompact={triggerCompact}
              isCompacting={isCompacting}
            />
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
  mode: "chat" | "deep-research";
}

const Composer: FC<{
  isBackgroundTaskRunning?: boolean;
  isProcessingInBackground?: boolean;
  sessionId?: string;
  onCancelBackgroundRun?: () => void;
  isCancellingBackgroundRun?: boolean;
  canCancelBackgroundRun?: boolean;
  isZombieBackgroundRun?: boolean;
  contextStatus?: import("@/lib/hooks/use-context-status").ContextWindowStatus | null;
  contextLoading?: boolean;
  onCompact?: () => Promise<{ success: boolean; compacted: boolean }>;
  isCompacting?: boolean;
}> = ({
  isBackgroundTaskRunning = false,
  isProcessingInBackground = false,
  sessionId,
  onCancelBackgroundRun,
  isCancellingBackgroundRun = false,
  canCancelBackgroundRun = false,
  isZombieBackgroundRun = false,
  contextStatus = null,
  contextLoading = false,
  onCompact,
  isCompacting = false,
}) => {
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Message queue state
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Cursor position for @ mention autocomplete
  const [cursorPosition, setCursorPosition] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

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
  const tChat = useTranslations("chat");
  const te = useTranslations("errors");

  // MCP reload status
  const { status: mcpStatus } = useMCPReloadStatus();

  // Deep Research mode (optional - may not be available)
  const deepResearch = useOptionalDeepResearch();
  const isDeepResearchMode = deepResearch?.isDeepResearchMode ?? false;
  const isDeepResearchActive = deepResearch?.isActive ?? false;
  const isDeepResearchLoading = deepResearch?.isLoading ?? false;
  const isOperationRunning = isRunning || isDeepResearchLoading;
  const isQueueBlocked = isOperationRunning || isBackgroundTaskRunning;

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
    if (!isQueueBlocked && queuedMessages.length > 0 && !isProcessingQueue.current) {
      isProcessingQueue.current = true;
      isAwaitingRunStart.current = true;

      const nextMessage = queuedMessages[0];
      setQueuedMessages(prev => prev.slice(1));

      // Small delay to ensure the runtime is ready for the next message
      setTimeout(() => {
        if (nextMessage.mode === "deep-research" && deepResearch) {
          deepResearch.startResearch(nextMessage.content);
          return;
        }
        threadRuntime.append({
          role: "user",
          content: [{ type: "text", text: nextMessage.content }],
        });
      }, 100);
    }
  }, [isQueueBlocked, queuedMessages, threadRuntime, deepResearch]);

  // Handle form submission
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const hasText = inputValue.trim().length > 0;
    const hasAttachments = attachmentCount > 0;

    if (!hasText && !hasAttachments) return;

    // If Deep Research mode is active, start research instead of regular chat
    if (isDeepResearchMode && deepResearch && hasText && !isQueueBlocked) {
      deepResearch.startResearch(inputValue.trim());
      setInputValue("");
      return;
    }

    // Determine what to send: enhanced context if available, otherwise original input
    const messageToSend = enhancedContext || inputValue.trim();

    if (isQueueBlocked) {
      // Queue the message when AI is busy (text only, no attachments for queued)
      if (hasText) {
        setQueuedMessages(prev => [...prev, {
          id: `queued-${Date.now()}`,
          content: messageToSend,
          mode: isDeepResearchMode ? "deep-research" : "chat",
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
  }, [inputValue, isQueueBlocked, threadRuntime, attachmentCount, isDeepResearchMode, deepResearch, enhancedContext]);

  // Insert a file mention from the autocomplete dropdown
  const handleInsertMention = useCallback((mention: string, atIndex: number, queryLength: number) => {
    // Replace @query with @mention (including the @ sign)
    const before = inputValue.slice(0, atIndex);
    const after = inputValue.slice(atIndex + 1 + queryLength); // +1 for the @ character
    const newValue = `${before}@${mention} ${after}`;
    setInputValue(newValue);
    // Move cursor to after the inserted mention + space
    const newCursor = atIndex + mention.length + 2; // @ + mention + space
    setCursorPosition(newCursor);
    // Focus and set cursor position in textarea
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  }, [inputValue]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Let the mention autocomplete handle navigation keys first
    if (mentionRef.current) {
      const handler = (mentionRef.current as unknown as { handleKeyDown?: (e: React.KeyboardEvent) => boolean }).handleKeyDown;
      if (handler && handler(e)) return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Handle clipboard paste (Ctrl+V / Cmd+V)
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for images in clipboard
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault(); // Prevent default paste behavior
          
          const file = item.getAsFile();
          if (!file) continue;

          // Validate file size (10 MB limit)
          const MAX_SIZE = 10 * 1024 * 1024;
          if (file.size > MAX_SIZE) {
            toast.error(t("composer.fileTooLarge", { 
              size: Math.round(file.size / 1024 / 1024),
              max: 10 
            }));
            return;
          }

          // Add attachment
          try {
            await threadRuntime.composer.addAttachment(file);
            toast.success(t("composer.imagePasted"));
          } catch (error) {
            console.error("[Composer] Failed to paste image:", error);
            toast.error(t("composer.pasteError"));
          }
          
          return; // Only process first image
        }
      }
      // Let text paste through normally (no preventDefault)
    },
    [threadRuntime, t]
  );

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

      const { data, error: fetchError } = await resilientPost<{
        success?: boolean;
        enhancedPrompt?: string;
        filesFound?: number;
        chunksRetrieved?: number;
        usedLLM?: boolean;
        skipReason?: string;
        error?: string;
      }>("/api/enhance-prompt", {
        input: trimmedInput,
        characterId: character.id,
        useLLM: true,
        conversationContext: recentMessages,
      }, {
        timeout: 60_000, // 60s — enhancement runs semantic search + LLM synthesis
        retries: 0,      // Don't retry LLM enhancement — it's idempotent but expensive
      });

      if (fetchError || !data) {
        toast.error(data?.error || fetchError || t("enhance.failed"));
        return;
      }

      if (data.success) {
        // Display the enhanced prompt in the input field so user can see/edit it
        setInputValue(data.enhancedPrompt!);
        setEnhancedContext(data.enhancedPrompt!);
        setEnhancementInfo({
          filesFound: data.filesFound,
          chunksRetrieved: data.chunksRetrieved,
        });
        const llmIndicator = data.usedLLM ? " (LLM)" : "";
        toast.success(t("enhance.success", { files: data.filesFound ?? 0, chunks: data.chunksRetrieved ?? 0, llmIndicator }));
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
    if (mcpStatus.isReloading) return t("composer.placeholderInitializing");
    return t("composer.placeholderDefault");
  };

  // Determine status message and icon
  const getStatusMessage = () => {
    if (mcpStatus.isReloading) {
      return `Initializing tools... ${mcpStatus.progress.toFixed(0)}%`;
    }
    if (isDeepResearchLoading) {
      return "Researching...";
    }
    if (isRunning) {
      return "Responding...";
    }
    return null;
  };

  const statusMessage = getStatusMessage();

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

      {/* Background Processing Indicator - compact inline version */}
      {isProcessingInBackground && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-terminal-green/30 bg-terminal-green/5 px-3 py-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex gap-1">
              <span className="size-1.5 rounded-full bg-terminal-green animate-dot-pulse" />
              <span className="size-1.5 rounded-full bg-terminal-green animate-dot-pulse-delay-1" />
              <span className="size-1.5 rounded-full bg-terminal-green animate-dot-pulse-delay-2" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-mono font-medium text-terminal-dark">
                {tChat("processingInBackground")}
              </span>
              <span className="text-[11px] font-mono text-terminal-muted">
                {isZombieBackgroundRun ? tChat("backgroundRun.zombieHint") : tChat("processingInBackgroundHint")}
              </span>
            </div>
          </div>
          {onCancelBackgroundRun && canCancelBackgroundRun && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-xs font-mono shrink-0"
              onClick={onCancelBackgroundRun}
              disabled={isCancellingBackgroundRun || !canCancelBackgroundRun}
            >
              {isCancellingBackgroundRun ? (
                <>
                  <Loader2Icon className="mr-1.5 h-3 w-3 animate-spin" />
                  {tChat("backgroundRun.stopping")}
                </>
              ) : (
                <>
                  <CircleStopIcon className="mr-1.5 h-3 w-3" />
                  {isZombieBackgroundRun ? tChat("backgroundRun.forceStop") : tChat("backgroundRun.stop")}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Queued messages indicator */}
      {queuedMessages.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          <div className="text-xs text-terminal-muted font-mono flex items-center gap-1">
            <ClockIcon className="size-3" />
            {t("queue.messagesQueued", { count: queuedMessages.length })}
          </div>
          {isBackgroundTaskRunning && (
            <div className="text-[11px] text-terminal-muted/80 font-mono">
              {t("queue.backgroundHint")}
            </div>
          )}
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

      {/* File mention autocomplete dropdown */}
      <FileMentionAutocomplete
        ref={mentionRef}
        characterId={character?.id ?? null}
        inputValue={inputValue}
        cursorPosition={cursorPosition}
        onInsertMention={handleInsertMention}
      />

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
        {/* Status indicator above composer */}
        {statusMessage && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-terminal-muted border-b border-terminal-dark/10">
            <Loader2Icon className="size-3 animate-spin flex-shrink-0" />
            <span>{statusMessage}</span>
            {mcpStatus.isReloading && mcpStatus.estimatedTimeRemaining > 0 && (
              <span className="text-terminal-muted/70">
                (~{Math.ceil(mcpStatus.estimatedTimeRemaining / 1000)}s remaining)
              </span>
            )}
          </div>
        )}
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
              setCursorPosition(e.target.selectionStart ?? 0);
              // Clear enhancement state when user edits (they may be modifying the enhanced text)
              if (enhancedContext || enhancementInfo) {
                setEnhancedContext(null);
                setEnhancementInfo(null);
              }
            }}
            onSelect={(e) => {
              setCursorPosition((e.target as HTMLTextAreaElement).selectionStart ?? 0);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
                    disabled={isCancelling || mcpStatus.isReloading}
                    className="h-8 px-2 text-xs font-mono"
                  >
                    {isCancelling ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <CircleStopIcon className="size-3" />
                    )}
                    {mcpStatus.isReloading ? t("composer.initializing") : t("composer.stop")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
                  {mcpStatus.isReloading
                    ? t("tooltips.toolsInitializing")
                    : t("tooltips.stopResponse")}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Model Bag - Session Model Override */}
            {sessionId && (
              <ModelBagPopover sessionId={sessionId} />
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
                        : isQueueBlocked
                          ? "bg-terminal-amber hover:bg-terminal-amber/90"
                          : "bg-terminal-dark hover:bg-terminal-dark/90"
                  )}
                  disabled={(!inputValue.trim() && attachmentCount === 0) || deepResearch?.isLoading}
                >
                  {deepResearch?.isLoading ? (
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
                {isDeepResearchMode ? t("tooltips.startResearch") : isQueueBlocked ? t("tooltips.queueMessage") : t("tooltips.sendMessage")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ComposerPrimitive.Root>

      {/* Context window indicator — shown below composer when status is not safe */}
      {contextStatus && contextStatus.status !== "safe" && (
        <div className="mt-1.5 w-full px-1">
          <ContextWindowIndicator
            status={contextStatus}
            isLoading={contextLoading}
            onCompact={onCompact}
            isCompacting={isCompacting}
            compact
          />
        </div>
      )}
    </div>
  );
};

/**
 * ModelBagPopover — "Bag of Models" inventory near the prompt input.
 *
 * List-based design: full model names, provider sections, capability badges.
 * Click a model → instantly switch. Icon placeholder ready for custom PNGs.
 */
const ModelBagPopover: FC<{ sessionId: string }> = ({ sessionId }) => {
  const [open, setOpen] = useState(false);
  const bag = useModelBag();
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState<string | "all">("all");
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Only authenticated providers with models
  const authProviders = useMemo(
    () => bag.providers.filter((p) => p.isAuthenticated && p.modelCount > 0),
    [bag.providers]
  );

  // Filter + search
  const visibleModels = useMemo(() => {
    let result = bag.models.filter((m) => m.isAvailable);
    if (filterProvider !== "all") {
      result = result.filter((m) => m.provider === filterProvider);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [bag.models, filterProvider, search]);

  // Group by provider for list view
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof visibleModels> = {};
    for (const m of visibleModels) {
      (groups[m.provider] ??= []).push(m);
    }
    return groups;
  }, [visibleModels]);

  const activeModelId = bag.roleAssignments.chat;
  const activeModel = bag.models.find((m) => m.id === activeModelId);

  const handleSelectModel = useCallback(
    async (model: ModelItem) => {
      setSaving(true);
      try {
        const { error: putError, status: putStatus } = await resilientPut(
          `/api/sessions/${sessionId}/model-config`,
          { sessionChatModel: model.id, sessionProvider: model.provider },
        );
        if (putError) {
          toast.error(putError);
          return;
        }
        // Update global assignment for display purposes only (doesn't affect this session)
        await bag.assignModelToRole(model.id, "chat");
        // NOTE: We do NOT call switchProvider here because:
        // 1. This is a per-session override, not a global change
        // 2. switchProvider clears all model assignments and can cause race conditions
        // 3. The session override takes precedence via session-model-resolver.ts
        toast.success(`Switched to ${model.name} for this session`);
        setOpen(false);
      } catch {
        toast.error("Failed to switch model");
      } finally {
        setSaving(false);
      }
    },
    [sessionId, bag]
  );

  // Tier badge colors
  const tierColors: Record<string, string> = {
    flagship: "bg-yellow-400/20 text-yellow-700",
    standard: "bg-blue-400/15 text-blue-600",
    utility: "bg-emerald-400/15 text-emerald-600",
    legacy: "bg-gray-400/15 text-gray-500",
  };

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            className={cn(
              "size-8",
              open
                ? "text-terminal-green bg-terminal-green/10 hover:bg-terminal-green/20"
                : "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
            )}
          >
            <PackageIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          Model Bag
        </TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-[480px] max-h-[520px] flex flex-col rounded-2xl border border-terminal-border/60 bg-white shadow-2xl overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-terminal-dark to-terminal-dark/95">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-terminal-green/20">
                <PackageIcon className="size-4 text-terminal-green" />
              </div>
              <div>
                <h3 className="font-mono text-sm font-bold text-terminal-cream leading-none">Model Bag</h3>
                <p className="font-mono text-[10px] text-terminal-cream/50 mt-0.5">
                  {visibleModels.length} model{visibleModels.length !== 1 ? "s" : ""} available
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-terminal-cream/40 hover:text-terminal-cream hover:bg-white/10 transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          {/* ── Active model banner ── */}
          {activeModel && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-terminal-green/5 border-b border-terminal-border/20">
              <div className="flex size-8 items-center justify-center rounded-lg bg-terminal-green/15 font-mono text-sm font-bold text-terminal-green">
                {getModelIcon(activeModel)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] text-terminal-muted uppercase tracking-wider">Currently active</p>
                <p className="font-mono text-xs font-semibold text-terminal-dark truncate">{activeModel.name}</p>
              </div>
              <span className={cn(
                "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold",
                PROVIDER_THEME[activeModel.provider]?.badgeColor, "text-terminal-dark"
              )}>
                {activeModel.providerDisplayName}
              </span>
            </div>
          )}

          {/* ── Filters row ── */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-terminal-border/20 bg-terminal-cream/40">
            {/* Provider pills */}
            <div className="flex items-center gap-1 flex-1 overflow-x-auto">
              <button
                onClick={() => setFilterProvider("all")}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-all",
                  filterProvider === "all"
                    ? "bg-terminal-dark text-terminal-cream shadow-sm"
                    : "text-terminal-muted hover:bg-terminal-dark/5"
                )}
              >
                All
              </button>
              {authProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFilterProvider(filterProvider === p.id ? "all" : p.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-all",
                    filterProvider === p.id
                      ? "bg-terminal-dark text-terminal-cream shadow-sm"
                      : "text-terminal-muted hover:bg-terminal-dark/5",
                    p.isActive && filterProvider !== p.id && "ring-1 ring-terminal-green/40"
                  )}
                >
                  <span className="text-xs">{p.iconEmoji}</span>
                  <span>{p.displayName}</span>
                  <span className={cn(
                    "rounded-full px-1 text-[8px] font-bold",
                    filterProvider === p.id ? "bg-terminal-cream/20" : "bg-terminal-dark/5"
                  )}>
                    {p.modelCount}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-36">
              <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-terminal-muted/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-terminal-border/30 bg-white py-1 pl-7 pr-2 font-mono text-[11px] text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green/30"
              />
            </div>
          </div>

          {/* ── Model list (scrollable) ── */}
          {bag.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-terminal-muted" />
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="py-12 text-center">
              <PackageIcon className="mx-auto size-8 text-terminal-muted/30 mb-2" />
              <p className="font-mono text-xs text-terminal-muted">No models found</p>
              <p className="font-mono text-[10px] text-terminal-muted/60 mt-1">Connect providers in Settings</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {Object.entries(groupedModels).map(([provider, models]) => {
                const theme = PROVIDER_THEME[provider as keyof typeof PROVIDER_THEME];
                const providerInfo = authProviders.find((p) => p.id === provider);
                return (
                  <div key={provider}>
                    {/* Provider section header (only if showing "all") */}
                    {filterProvider === "all" && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-terminal-cream/95 backdrop-blur-sm border-b border-terminal-border/10">
                        <span className="text-xs">{theme?.iconEmoji}</span>
                        <span className="font-mono text-[10px] font-bold text-terminal-dark uppercase tracking-wider">
                          {providerInfo?.displayName || provider}
                        </span>
                        <span className="font-mono text-[9px] text-terminal-muted">{models.length}</span>
                        <div className="flex-1 h-px bg-terminal-border/20" />
                      </div>
                    )}

                    {/* Model rows */}
                    {models.map((model) => {
                      const isActive = model.id === activeModelId;
                      return (
                        <button
                          key={`${model.provider}:${model.id}`}
                          onClick={() => handleSelectModel(model)}
                          disabled={saving}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2 transition-all duration-100",
                            "hover:bg-terminal-green/5",
                            isActive && "bg-terminal-green/8",
                            saving && "opacity-50 pointer-events-none",
                          )}
                        >
                          {/* Icon slot — placeholder for custom PNGs */}
                          <div className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                            isActive
                              ? "bg-terminal-green/15 text-terminal-green border border-terminal-green/30"
                              : "bg-terminal-dark/5 text-terminal-dark/50 border border-transparent",
                            "font-mono text-sm font-bold",
                          )}>
                            {getModelIcon(model)}
                          </div>

                          {/* Name + ID */}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "font-mono text-xs font-semibold truncate",
                                isActive ? "text-terminal-green" : "text-terminal-dark"
                              )}>
                                {model.name}
                              </span>
                              {isActive && (
                                <CheckIcon className="size-3 shrink-0 text-terminal-green" />
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-terminal-muted/60 truncate">
                              {model.id}
                            </p>
                          </div>

                          {/* Capability badges */}
                          <div className="flex items-center gap-1 shrink-0">
                            {model.capabilities.contextWindow && (
                              <span className="rounded px-1.5 py-0.5 bg-terminal-dark/5 font-mono text-[9px] text-terminal-muted">
                                {model.capabilities.contextWindow}
                              </span>
                            )}
                            {model.capabilities.thinking && (
                              <span className="rounded px-1 py-0.5 bg-purple-100 font-mono text-[9px] text-purple-600" title="Extended thinking">
                                🧠
                              </span>
                            )}
                            {model.capabilities.speed === "fast" && (
                              <span className="rounded px-1 py-0.5 bg-amber-50 font-mono text-[9px] text-amber-600" title="Fast">
                                ⚡
                              </span>
                            )}
                            {model.capabilities.vision && (
                              <span className="rounded px-1 py-0.5 bg-blue-50 font-mono text-[9px] text-blue-500" title="Vision">
                                👁
                              </span>
                            )}
                          </div>

                          {/* Tier badge */}
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase",
                            tierColors[model.tier] || tierColors.standard
                          )}>
                            {model.tier === "flagship" ? "★" : model.tier === "utility" ? "⚡" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="shrink-0 border-t border-terminal-border/20 px-4 py-2 bg-terminal-cream/60">
            <p className="font-mono text-[10px] text-terminal-muted text-center">
              Click to switch model · Manage providers in <span className="text-terminal-green font-semibold">Settings</span>
            </p>
          </div>
        </div>
      )}
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
