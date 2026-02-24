"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposerPrimitive,
  useThread,
  useThreadRuntime,
  useThreadComposer,
} from "@assistant-ui/react";
import {
  ClockIcon,
  XIcon,
  FlaskConicalIcon,
  Loader2Icon,
  CircleStopIcon,
  CheckCircleIcon,
} from "lucide-react";
import { resilientPost } from "@/lib/utils/resilient-fetch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCharacter } from "./character-context";
import { useOptionalDeepResearch } from "./deep-research-context";
import { DeepResearchPanel } from "./deep-research-panel";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";
import { useMCPReloadStatus } from "@/hooks/use-mcp-reload-status";
import { useSessionComposerDraft } from "@/lib/hooks/use-session-composer-draft";
import { ContextWindowIndicator } from "./context-window-indicator";
import { ActiveModelIndicator } from "./active-model-indicator";
import { ActiveDelegationsIndicator } from "./active-delegations-indicator";
import FileMentionAutocomplete from "./file-mention-autocomplete";
import { ComposerAttachment } from "./thread-message-components";
import { ComposerSkillPicker } from "./composer-skill-picker";
import { ComposerActionBar } from "./composer-action-bar";
import {
  useVoiceRecording,
  usePastedTexts,
  useSkillPickerState,
  usePromptEnhancement,
} from "./composer-hooks";

// Interface for queued messages
interface QueuedMessage {
  id: string;
  content: string;
  mode: "chat" | "deep-research";
  // "queued-classic": waiting for run to end before replaying
  // "queued-live": currently being submitted to the live queue API
  // "injected-live": successfully delivered to the running model
  // "fallback": live injection failed, will replay after run ends
  status: "queued-classic" | "queued-live" | "injected-live" | "fallback";
}

export const Composer: FC<{
  isBackgroundTaskRunning?: boolean;
  isProcessingInBackground?: boolean;
  sessionId?: string;
  activeRunId?: string | null;
  sttEnabled?: boolean;
  onCancelBackgroundRun?: () => void;
  isCancellingBackgroundRun?: boolean;
  canCancelBackgroundRun?: boolean;
  isZombieBackgroundRun?: boolean;
  onLivePromptInjected?: () => void | Promise<void | boolean>;
  contextStatus?: import("@/lib/hooks/use-context-status").ContextWindowStatus | null;
  contextLoading?: boolean;
  onCompact?: () => Promise<{ success: boolean; compacted: boolean }>;
  isCompacting?: boolean;
}> = ({
  isBackgroundTaskRunning = false,
  isProcessingInBackground = false,
  sessionId,
  activeRunId,
  sttEnabled = false,
  onCancelBackgroundRun,
  isCancellingBackgroundRun = false,
  canCancelBackgroundRun = false,
  isZombieBackgroundRun = false,
  onLivePromptInjected,
  contextStatus = null,
  contextLoading = false,
  onCompact,
  isCompacting = false,
}) => {
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skillPickerRef = useRef<HTMLDivElement>(null);
  const skillSearchInputRef = useRef<HTMLInputElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);

  // Attempt to inject a message into the currently active run's live prompt queue.
  // The server resolves the active runId from the session index — no runId needed on the client.
  // Uses exponential backoff (200, 400, 800, 1600, 3200ms) with a max of 5 attempts.
  // Returns true if successfully queued, false if no active run or all retries failed.
  const queueLivePromptForActiveRun = useCallback(
    async (content: string): Promise<boolean> => {
      const MAX_RETRIES = 5;
      const BASE_DELAY_MS = 200;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt - 1))
          );
        }

        try {
          const { data, status } = await resilientPost<{ queued: boolean; reason?: string }>(
            `/api/sessions/${sessionId}/live-prompt-queue`,
            { content },
            { timeout: 5_000, retries: 0 }
          );

          if (status === 409) {
            // No active run — no point retrying
            return false;
          }

          if (data?.queued) {
            return true;
          }
        } catch {
          // Network error — retry
        }
      }

      return false;
    },
    [sessionId]
  );

  const [isCancelling, setIsCancelling] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const {
    draft: inputValue,
    setDraft: setInputValue,
    setSelection,
    restoredSelection,
    clearDraft,
  } = useSessionComposerDraft(sessionId);

  const updateCursorPosition = useCallback(
    (selectionStart: number, selectionEnd: number = selectionStart) => {
      setCursorPosition(selectionStart);
      setSelection(selectionStart, selectionEnd);
    },
    [setSelection]
  );

  // Pasted text state
  const {
    pastedTexts,
    pasteCounterRef,
    addPastedText,
    removePastedText,
    clearPastedTexts,
    expandPlaceholders,
  } = usePastedTexts();

  const { character } = useCharacter();
  const isRunning = useThread((t) => t.isRunning);
  const threadRuntime = useThreadRuntime();
  const attachmentCount = useThreadComposer((c) => c.attachments.length);
  const t = useTranslations("assistantUi");
  const tChat = useTranslations("chat");
  const { status: mcpStatus } = useMCPReloadStatus();

  const deepResearch = useOptionalDeepResearch();
  const isDeepResearchMode = deepResearch?.isDeepResearchMode ?? false;
  const isDeepResearchActive = deepResearch?.isActive ?? false;
  const isDeepResearchLoading = deepResearch?.isLoading ?? false;
  const isDeepResearchBackgroundPolling = deepResearch?.isBackgroundPolling ?? false;
  const isOperationRunning = isRunning || isDeepResearchLoading || isDeepResearchBackgroundPolling;
  const isQueueBlocked = isOperationRunning || isBackgroundTaskRunning;

  const isProcessingQueue = useRef(false);
  const isAwaitingRunStart = useRef(false);

  // Skill picker — all state and effects managed by the hook
  const {
    skills,
    filteredSkills,
    isLoadingSkills,
    showSkillPicker,
    skillPickerQuery,
    selectedSkillIndex,
    skillPickerMode,
    spotlightShortcutHint,
    openSpotlightSkillPicker,
    selectSkill,
    closeSkillPicker,
    setSkillPickerQuery,
    setSelectedSkillIndex,
  } = useSkillPickerState({
    characterId: character?.id,
    inputValue,
    cursorPosition,
    inputRef,
    skillPickerRef,
    skillSearchInputRef,
    setInputValue,
    updateCursorPosition,
  });

  // Recent messages for enhancement context
  const threadMessages = useThread((th) => th.messages);
  const recentMessages = useMemo(
    () =>
      threadMessages.slice(-3).map((msg) => {
        const textContent =
          msg.content
            ?.filter(
              (part): part is { type: "text"; text: string } => part.type === "text"
            )
            .map((part) => part.text)
            .join("\n") || "";
        return { role: msg.role, content: textContent };
      }),
    [threadMessages]
  );

  // Prompt enhancement
  const {
    isEnhancing,
    enhancedContext,
    enhancementInfo,
    clearEnhancement,
    handleEnhance,
  } = usePromptEnhancement({
    inputValue,
    setInputValue,
    characterId: character?.id,
    sessionId,
    recentMessages,
    expandInput: expandPlaceholders,
  });

  // Voice recording
  const { isRecordingVoice, isTranscribingVoice, handleVoiceInput } = useVoiceRecording({
    sttEnabled,
    onTranscript: (transcript) => {
      setInputValue((prev) => {
        if (!prev.trim()) return transcript;
        return `${prev}${prev.endsWith(" ") ? "" : " "}${transcript}`;
      });
    },
    onTranscriptInserted: () => {
      requestAnimationFrame(() => {
        const textarea = inputRef.current;
        if (!textarea) return;
        textarea.focus();
        const cursor = textarea.value.length;
        textarea.setSelectionRange(cursor, cursor);
        updateCursorPosition(cursor);
      });
    },
  });

  // Process queued messages when AI finishes
  useEffect(() => {
    if (isAwaitingRunStart.current && isRunning) {
      isAwaitingRunStart.current = false;
    }
    if (isProcessingQueue.current && !isRunning && !isAwaitingRunStart.current) {
      isProcessingQueue.current = false;
    }

    // Only process classic or fallback chips — injected-live ones are already delivered
    const replayable = queuedMessages.filter(
      m => m.status === "queued-classic" || m.status === "fallback"
    );

    if (!isQueueBlocked && replayable.length > 0 && !isProcessingQueue.current) {
      isProcessingQueue.current = true;
      isAwaitingRunStart.current = true;

      const nextMessage = replayable[0];
      setQueuedMessages((prev) => prev.filter(m => m.id !== nextMessage.id));

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

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const hasText = inputValue.trim().length > 0;
      const hasAttachments = attachmentCount > 0;
      if (!hasText && !hasAttachments) return;

      if (isDeepResearchMode && deepResearch && hasText && !isQueueBlocked) {
        deepResearch.startResearch(inputValue.trim());
        clearDraft();
        updateCursorPosition(0);
        return;
      }

      const messageToSend = enhancedContext || inputValue.trim();
      const expandedMessage = expandPlaceholders(messageToSend);

      if (isQueueBlocked) {
        if (hasText) {
          const msgId = `queued-${Date.now()}`;

          if (sessionId && !isDeepResearchMode) {
            // Live injection path: server resolves the active runId from the session index
            setQueuedMessages(prev => [...prev, {
              id: msgId,
              content: expandedMessage,
              mode: "chat",
              status: "queued-live",
            }]);

            // Fire injection in the background; chip lifecycle driven by result
            void queueLivePromptForActiveRun(expandedMessage).then(injected => {
              if (injected) {
                // Successfully delivered — show brief confirmation then remove chip
                setQueuedMessages(prev =>
                  prev.map(m => m.id === msgId ? { ...m, status: "injected-live" as const } : m)
                );
                // NOTE: We intentionally do NOT call onLivePromptInjected here.
                // Calling refreshMessages mid-stream with remount:true would destroy
                // ChatProvider and kill the SSE connection. The injected message is
                // saved at the correct ordering position in prepareStep and will appear
                // when the run finishes naturally via the post-run effect below.
              } else {
                // No active run — fall back to classic replay after run
                setQueuedMessages(prev =>
                  prev.map(m => m.id === msgId ? { ...m, status: "fallback" as const } : m)
                );
              }
            });
          } else {
            // Classic queue: replay when run ends
            setQueuedMessages(prev => [...prev, {
              id: msgId,
              content: expandedMessage,
              mode: isDeepResearchMode ? "deep-research" : "chat",
              status: "queued-classic",
            }]);
          }
        }
        clearDraft();
        updateCursorPosition(0);
        clearEnhancement();
        clearPastedTexts();
        if (hasAttachments) threadRuntime.composer.clearAttachments();
      } else {
        threadRuntime.composer.setText(expandedMessage);
        threadRuntime.composer.send();
        clearDraft();
        updateCursorPosition(0);
        clearEnhancement();
        clearPastedTexts();
      }
    },
    [
      inputValue,
      isQueueBlocked,
      threadRuntime,
      attachmentCount,
      isDeepResearchMode,
      deepResearch,
      enhancedContext,
      expandPlaceholders,
      clearDraft,
      updateCursorPosition,
      clearEnhancement,
      clearPastedTexts,
    ]
  );

  const handleInsertMention = useCallback(
    (mention: string, atIndex: number, queryLength: number) => {
      const before = inputValue.slice(0, atIndex);
      const after = inputValue.slice(atIndex + 1 + queryLength);
      const newValue = `${before}@${mention} ${after}`;
      setInputValue(newValue);
      const newCursor = atIndex + mention.length + 2;
      updateCursorPosition(newCursor);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursor, newCursor);
        }
      });
    },
    [inputValue, updateCursorPosition]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mentionRef.current) {
        const handler = (
          mentionRef.current as unknown as {
            handleKeyDown?: (e: React.KeyboardEvent) => boolean;
          }
        ).handleKeyDown;
        if (handler && handler(e)) return;
      }

      if (showSkillPicker) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (filteredSkills.length > 0)
            setSelectedSkillIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (filteredSkills.length > 0)
            setSelectedSkillIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (filteredSkills[selectedSkillIndex]) selectSkill(filteredSkills[selectedSkillIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeSkillPicker();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [filteredSkills, handleSubmit, selectSkill, selectedSkillIndex, showSkillPicker, closeSkillPicker, setSelectedSkillIndex]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const MAX_SIZE = 10 * 1024 * 1024;
          if (file.size > MAX_SIZE) {
            toast.error(t("composer.fileTooLarge", { size: Math.round(file.size / 1024 / 1024), max: 10 }));
            return;
          }
          try {
            await threadRuntime.composer.addAttachment(file);
            toast.success(t("composer.imagePasted"));
          } catch (error) {
            console.error("[Composer] Failed to paste image:", error);
            toast.error(t("composer.pasteError"));
          }
          return;
        }
      }

      const LARGE_PASTE_LINE_THRESHOLD = 5;
      const LARGE_PASTE_CHAR_THRESHOLD = 300;
      const pastedText = e.clipboardData.getData("text/plain");
      if (pastedText) {
        const lines = pastedText.split("\n");
        if (lines.length >= LARGE_PASTE_LINE_THRESHOLD || pastedText.length >= LARGE_PASTE_CHAR_THRESHOLD) {
          e.preventDefault();
          const lineCount = lines.length;
          const nextIndex = pasteCounterRef.current + 1;
          const placeholder = `[Pasted text #${nextIndex} +${lineCount} lines]`;
          const start = inputRef.current?.selectionStart ?? inputValue.length;
          const end = inputRef.current?.selectionEnd ?? start;
          setInputValue((v) => v.slice(0, start) + placeholder + v.slice(end));
          addPastedText({ text: pastedText, lineCount, placeholder });
          return;
        }
      }
    },
    [threadRuntime, t, inputValue, pasteCounterRef, addPastedText]
  );

  const removeFromQueue = useCallback((id: string) => {
    setQueuedMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  const handleCancel = useCallback(() => {
    if (!isOperationRunning || isCancelling) return;
    setIsCancelling(true);
    if (isRunning) threadRuntime.cancelRun();
    if (deepResearch && (isDeepResearchActive || isDeepResearchLoading)) {
      deepResearch.cancelResearch();
    }
  }, [deepResearch, isCancelling, isDeepResearchActive, isDeepResearchLoading, isOperationRunning, isRunning, threadRuntime]);

  useEffect(() => {
    if (!isOperationRunning) setIsCancelling(false);
  }, [isOperationRunning]);

  // When the run ends: reload messages and determine whether injected-live chips
  // were processed by prepareStep (normal injection) or not (undrained — run ended
  // before the queue was drained). Processed chips are cleared; unprocessed chips
  // are converted to "fallback" so the replayable mechanism sends them as a new run.
  useEffect(() => {
    if (isQueueBlocked) return;
    const hasInjected = queuedMessages.some(m => m.status === "injected-live");
    if (hasInjected && onLivePromptInjected) {
      void Promise.resolve(onLivePromptInjected()).then((result) => {
        const hasUndrained = result === true;
        if (hasUndrained) {
          // Server signals undrained messages — convert chips to fallback for replay.
          setQueuedMessages(prev => prev.map(m =>
            m.status === "injected-live" ? { ...m, status: "fallback" as const } : m
          ));
        } else {
          // Messages were processed by prepareStep — clear the chips.
          setQueuedMessages(prev => prev.filter(m => m.status !== "injected-live"));
        }
      });
    } else {
      setQueuedMessages(prev => prev.filter(m => m.status !== "injected-live"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueueBlocked]);

  // Auto-grow textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = 24;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, lineHeight * 1.5), lineHeight * 8);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Restore cursor selection after draft hydration
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = restoredSelection;
    if (selectionStart === null || selectionEnd === null) return;

    const maxPosition = textarea.value.length;
    const start = Math.max(0, Math.min(selectionStart, maxPosition));
    const end = Math.max(start, Math.min(selectionEnd, maxPosition));
    requestAnimationFrame(() => {
      textarea.setSelectionRange(start, end);
      updateCursorPosition(start, end);
    });
  }, [restoredSelection, updateCursorPosition]);

  const handleFocus = () => {
    if (!composerRef.current || prefersReducedMotion) return;
    animate(composerRef.current, {
      scale: [1, 1.01, 1],
      duration: ZLUTTY_DURATIONS.fast,
      ease: ZLUTTY_EASINGS.smooth,
    });
  };

  const getPlaceholder = () => {
    if (isDeepResearchMode) return t("composer.placeholderResearch");
    if (isRunning) return t("composer.placeholderQueue");
    if (mcpStatus.isReloading) return t("composer.placeholderInitializing");
    return t("composer.placeholderDefault");
  };

  const getStatusMessage = () => {
    if (mcpStatus.isReloading) return `Initializing tools... ${mcpStatus.progress.toFixed(0)}%`;
    if (isDeepResearchLoading) return "Researching...";
    if (isRunning) return "Responding...";
    return null;
  };

  const statusMessage = getStatusMessage();
  const shouldShowDeepResearchPanel = Boolean(
    deepResearch
    && (
      isDeepResearchActive
      || isDeepResearchLoading
      || isDeepResearchBackgroundPolling
      || deepResearch.phase === "error"
    )
  );
  const isBackgroundProcessingVisible = isProcessingInBackground || isDeepResearchBackgroundPolling;

  return (
    <div className="relative w-full">
      {/* Deep Research Panel - includes active and resumed background states */}
      {deepResearch && shouldShowDeepResearchPanel && (
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
      {isBackgroundProcessingVisible && (
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
                <><Loader2Icon className="mr-1.5 h-3 w-3 animate-spin" />{tChat("backgroundRun.stopping")}</>
              ) : (
                <><CircleStopIcon className="mr-1.5 h-3 w-3" />{isZombieBackgroundRun ? tChat("backgroundRun.forceStop") : tChat("backgroundRun.stop")}</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Queued messages */}
      {queuedMessages.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          <div className="text-xs text-terminal-muted font-mono flex items-center gap-1">
            <ClockIcon className="size-3" />
            {t("queue.messagesQueued", { count: queuedMessages.length })}
          </div>
          {isBackgroundTaskRunning && (
            <div className="text-[11px] text-terminal-muted/80 font-mono">{t("queue.backgroundHint")}</div>
          )}
          <div className="flex flex-wrap gap-1">
            {queuedMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-mono",
                  msg.status === "injected-live"
                    ? "bg-green-100/30 text-green-700 border border-green-300/40"
                    : msg.status === "queued-live"
                    ? "bg-yellow-50/30 text-yellow-700 border border-yellow-300/40"
                    : msg.status === "fallback"
                    ? "bg-orange-50/30 text-orange-700 border border-orange-300/40"
                    : "bg-terminal-dark/10 text-terminal-dark"
                )}
              >
                {msg.status === "injected-live" && (
                  <CheckCircleIcon className="size-3 shrink-0 text-green-600" />
                )}
                {msg.status === "queued-live" && (
                  <Loader2Icon className="size-3 shrink-0 animate-spin" />
                )}
                <span className="max-w-32 truncate">{msg.content}</span>
                {msg.status !== "injected-live" && msg.status !== "queued-live" && (
                  <button onClick={() => removeFromQueue(msg.id)} className="text-terminal-muted hover:text-red-500 transition-colors">
                    <XIcon className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <FileMentionAutocomplete
        ref={mentionRef}
        characterId={character?.id ?? null}
        inputValue={inputValue}
        cursorPosition={cursorPosition}
        onInsertMention={handleInsertMention}
      />

      {showSkillPicker && (
        <ComposerSkillPicker
          skills={skills}
          filteredSkills={filteredSkills}
          isLoadingSkills={isLoadingSkills}
          skillPickerMode={skillPickerMode}
          skillPickerQuery={skillPickerQuery}
          selectedSkillIndex={selectedSkillIndex}
          spotlightShortcutHint={spotlightShortcutHint}
          onSelectSkill={selectSkill}
          onQueryChange={setSkillPickerQuery}
          onSelectedIndexChange={setSelectedSkillIndex}
          onClose={closeSkillPicker}
          searchInputRef={skillSearchInputRef}
          pickerRef={skillPickerRef}
          composerInputRef={inputRef}
        />
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

        {isDeepResearchMode && (
          <div className="flex items-center gap-2 px-4 pt-2 text-xs font-mono text-purple-600">
            <FlaskConicalIcon className="size-3" />
            {t("deepResearch.modeLabel")}
          </div>
        )}

        <div className="flex flex-wrap gap-2 p-2 empty:hidden">
          <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} />
        </div>

        {pastedTexts.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pb-1">
            {pastedTexts.map((item) => (
              <div key={item.index} className="flex items-center gap-1.5 rounded-md border border-terminal-border bg-terminal-dark/5 px-2 py-1 text-xs font-mono text-terminal-muted">
                <span className="text-terminal-dark/50 select-none">📋</span>
                <span>{t("composer.pastedTextChip", { n: item.index, lines: item.lineCount })}</span>
                <button
                  type="button"
                  onClick={() => removePastedText(item.index, setInputValue)}
                  className="ml-0.5 leading-none hover:text-red-500 transition-colors"
                  aria-label={t("composer.removePastedText")}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              updateCursorPosition(e.target.selectionStart ?? 0, e.target.selectionEnd ?? e.target.selectionStart ?? 0);
              if (enhancedContext || enhancementInfo) clearEnhancement();
            }}
            onSelect={(e) => {
              const textarea = e.target as HTMLTextAreaElement;
              updateCursorPosition(textarea.selectionStart ?? 0, textarea.selectionEnd ?? textarea.selectionStart ?? 0);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            autoFocus
            placeholder={getPlaceholder()}
            rows={1}
            className="flex-1 resize-none bg-transparent p-4 text-sm font-mono outline-none placeholder:text-terminal-muted text-terminal-dark overflow-y-auto transition-[height] duration-150 ease-out"
            style={{ minHeight: "36px", maxHeight: "192px" }}
          />

          <ComposerActionBar
            isOperationRunning={isOperationRunning}
            isCancelling={isCancelling}
            isQueueBlocked={isQueueBlocked}
            isRunning={isRunning}
            isDeepResearchMode={isDeepResearchMode}
            isDeepResearchActive={isDeepResearchActive}
            isDeepResearchLoading={isDeepResearchLoading}
            mcpIsReloading={mcpStatus.isReloading}
            mcpEstimatedTimeRemaining={mcpStatus.estimatedTimeRemaining}
            isLoadingSkills={isLoadingSkills}
            skillsAvailable={skills.length > 0}
            spotlightShortcutHint={spotlightShortcutHint}
            onOpenSkillPicker={openSpotlightSkillPicker}
            sessionId={sessionId}
            onToggleDeepResearch={deepResearch?.toggleDeepResearchMode}
            sttEnabled={sttEnabled}
            isRecordingVoice={isRecordingVoice}
            isTranscribingVoice={isTranscribingVoice}
            onVoiceInput={handleVoiceInput}
            inputHasText={inputValue.trim().length > 2}
            attachmentCount={attachmentCount}
            showEnhanceButton={!!(character?.id && character.id !== "default")}
            isEnhancing={isEnhancing}
            enhancedContext={enhancedContext}
            enhancementFilesFound={enhancementInfo?.filesFound || 0}
            onEnhance={handleEnhance}
            onCancel={handleCancel}
            onSubmit={handleSubmit}
          />
        </div>
      </ComposerPrimitive.Root>

      {(contextStatus || contextLoading) && (
        <div className="mt-1.5 w-full px-1 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <ContextWindowIndicator
              status={contextStatus}
              isLoading={contextLoading}
              onCompact={onCompact}
              isCompacting={isCompacting}
              compact
            />
          </div>
          <ActiveModelIndicator status={contextStatus} />
        </div>
      )}

      <ActiveDelegationsIndicator characterId={character?.id ?? null} />
    </div>
  );
};
