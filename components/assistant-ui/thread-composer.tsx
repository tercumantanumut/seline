"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ComposerPrimitive,
  useThread,
  useThreadRuntime,
  useThreadComposer,
} from "@assistant-ui/react";
import type { JSONContent } from "@tiptap/core";
import {
  ClockIcon,
  XIcon,
  FlaskConicalIcon,
  Loader2Icon,
  CircleStopIcon,
  CheckCircleIcon,
  SparklesIcon,
  UndoIcon,
  MicIcon,
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
import { useTheme } from "@/components/theme/theme-provider";
import { useMCPReloadStatus } from "@/hooks/use-mcp-reload-status";
import { useSessionComposerDraft } from "@/lib/hooks/use-session-composer-draft";
import { useSessionComposerEditorState } from "@/lib/hooks/use-session-composer-editor-state";
import { ContextWindowIndicator } from "./context-window-indicator";
import { ModelSelector } from "./model-selector";
import { ActiveDelegationsIndicator } from "./active-delegations-indicator";
import FileMentionAutocomplete from "./file-mention-autocomplete";
import { ComposerAttachment } from "./thread-message-components";
import { ComposerActionBar } from "./composer-action-bar";
import {
  useVoiceRecording,
  usePastedTexts,
  usePromptEnhancement,
} from "./composer-hooks";
import { buildTranscriptInsertion } from "./voice-transcript-utils";
import { VoiceWaveform } from "@/components/voice/voice-waveform";
import { VoiceActions } from "@/components/voice/voice-actions";
import { useGlobalVoiceHotkey } from "@/lib/hooks/use-global-hotkey";
import {
  TiptapEditor,
  contentPartsToComposerText,
  plainTextToTiptapDoc,
  serializeDocToContentArray,
  type TiptapEditorHandle,
  type ContentPart,
} from "./tiptap-editor";
import {
  estimateTaskRewardSuggestion,
  type RewardSuggestion,
} from "@/lib/rewards/reward-calculator";

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
  voicePostProcessing?: boolean;
  voiceActionsEnabled?: boolean;
  voiceAudioCues?: boolean;
  voiceActivationMode?: "tap" | "push";
  voiceHotkey?: string;
  onCancelBackgroundRun?: () => void;
  isCancellingBackgroundRun?: boolean;
  canCancelBackgroundRun?: boolean;
  isZombieBackgroundRun?: boolean;
  onLivePromptInjected?: () => void | Promise<void | boolean>;
  onPostCancel?: () => void;
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
  voicePostProcessing = true,
  voiceActionsEnabled = true,
  voiceAudioCues = true,
  voiceActivationMode = "tap",
  voiceHotkey = "CommandOrControl+Shift+Space",
  onCancelBackgroundRun,
  isCancellingBackgroundRun = false,
  canCancelBackgroundRun = false,
  isZombieBackgroundRun = false,
  onLivePromptInjected,
  onPostCancel,
  contextStatus = null,
  contextLoading = false,
  onCompact,
  isCompacting = false,
}) => {
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const tiptapRef = useRef<TiptapEditorHandle>(null);
  const prefersReducedMotion = useReducedMotion();
  const { chatBackground } = useTheme();
  const hasWallpaper = chatBackground.type !== "none";
  const simpleDraftAtRichModeEntryRef = useRef<string | null>(null);

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
  const {
    isEditorMode,
    setIsEditorMode,
    tiptapDraft,
    setTiptapDraft,
    clearTiptapDraft,
  } = useSessionComposerEditorState(sessionId);

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
  // Treat an active run ID as authoritative queue-blocking state. This keeps
  // follow-ups queued while the backend run is still alive, even if the UI has
  // temporarily hidden the background banner (e.g. interactive wait states).
  const hasTrackedBackgroundRun = typeof activeRunId === "string" && activeRunId.length > 0;
  const isQueueBlocked = isOperationRunning || isBackgroundTaskRunning || hasTrackedBackgroundRun;

  const isProcessingQueue = useRef(false);
  const isAwaitingRunStart = useRef(false);

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
  const [rewardSuggestion, setRewardSuggestion] = useState<RewardSuggestion | null>(null);
  const [showRewardSuggestion, setShowRewardSuggestion] = useState(false);
  const [rewardDismissed, setRewardDismissed] = useState(false);
  const ghostScrollRef = useRef<HTMLDivElement>(null);
  const composerTextForReward = useMemo(() => {
    if (isEditorMode) {
      return contentPartsToComposerText(serializeDocToContentArray(tiptapDraft));
    }
    return inputValue.trim();
  }, [inputValue, isEditorMode, tiptapDraft]);
  const rewardReasonLabel = useMemo(() => {
    if (!rewardSuggestion) {
      return "";
    }
    return t(`composer.rewardBands.${rewardSuggestion.complexityBand}`);
  }, [rewardSuggestion, t]);

  // Ghost text string for the inline reward suggestion
  const rewardGhostText = useMemo(() => {
    if (!showRewardSuggestion || !rewardSuggestion || rewardDismissed) return "";
    return t("composer.rewardSuggestion", {
      amount: rewardSuggestion.amountLabel,
      reason: rewardReasonLabel || rewardSuggestion.reasonLabel,
    });
  }, [showRewardSuggestion, rewardSuggestion, rewardDismissed, rewardReasonLabel, t]);

  const syncRewardSuggestion = useCallback(
    (textOverride?: string) => {
      const nextText = (textOverride ?? composerTextForReward).trim();
      if (!nextText) {
        setRewardSuggestion(null);
        setShowRewardSuggestion(false);
        return;
      }

      const nextSuggestion = estimateTaskRewardSuggestion(nextText);
      setRewardSuggestion(nextSuggestion);
      setShowRewardSuggestion(Boolean(nextSuggestion));
    },
    [composerTextForReward]
  );

  useEffect(() => {
    if (!composerTextForReward.trim()) {
      setRewardSuggestion(null);
      setShowRewardSuggestion(false);
      setRewardDismissed(false); // Reset only when input is fully cleared (new message)
      return;
    }

    setShowRewardSuggestion(false);
    // Don't reset rewardDismissed here — once accepted/dismissed via Tab/Escape,
    // stay dismissed until the input is fully cleared (handled above)
    const timeoutId = window.setTimeout(() => {
      syncRewardSuggestion(composerTextForReward);
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [composerTextForReward, syncRewardSuggestion]);

  // Voice recording
  const { isRecordingVoice, isTranscribingVoice, handleVoiceInput, handleVoiceStart, handleVoiceStop, analyserNode, lastTranscriptRef, wasAiEnhancedRef } = useVoiceRecording({
    sttEnabled,
    voicePostProcessing,
    voiceAudioCues,
    voiceActivationMode,
    onTranscript: (payload) => {
      const textToInsert = payload.finalText;
      if (!textToInsert) return;

      // Rich text editor mode — use transaction-based insertion for proper undo/redo
      if (isEditorMode && tiptapRef.current) {
        tiptapRef.current.insertVoiceTranscript(textToInsert);
        return;
      }

      // Simple textarea mode — insert at cursor with proper spacing
      const textarea = inputRef.current;
      const insertion = buildTranscriptInsertion({
        currentValue: inputValue,
        transcript: textToInsert,
        selectionStart: textarea?.selectionStart ?? null,
        selectionEnd: textarea?.selectionEnd ?? null,
      });

      if (insertion) {
        setInputValue(insertion.nextValue);
        updateCursorPosition(insertion.nextCursor);
      } else {
        // Fallback: append
        setInputValue((prev) => {
          if (!prev.trim()) return textToInsert;
          return `${prev}${prev.endsWith(" ") ? "" : " "}${textToInsert}`;
        });
      }
    },
    onTranscriptInserted: () => {
      if (isEditorMode && tiptapRef.current) {
        tiptapRef.current.focus();
        return;
      }
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

  // Global voice hotkey (Electron global shortcut + browser fallback)
  useGlobalVoiceHotkey({
    enabled: sttEnabled,
    onTrigger: () => { void handleVoiceInput(); },
    hotkey: voiceHotkey,
  });

  // Keyboard shortcuts to focus the composer: "/" or Cmd/Ctrl+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        (active instanceof HTMLElement && active.isContentEditable);

      // Cmd/Ctrl+L — always focus composer (even from other inputs)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "l") {
        e.preventDefault();
        if (isEditorMode && tiptapRef.current) {
          tiptapRef.current.focus();
        } else {
          inputRef.current?.focus();
        }
        return;
      }

      // "/" — focus composer only when not already in an editable field and not inside a dialog
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !isEditable && !(active as HTMLElement)?.closest("[role='dialog']")) {
        e.preventDefault();
        if (isEditorMode && tiptapRef.current) {
          tiptapRef.current.focus();
        } else {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditorMode]);

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

      // Auto-learn from voice corrections: if user edited a voice transcript before sending,
      // submit the diff to the learn endpoint (fire-and-forget)
      const rawTranscript = lastTranscriptRef.current;
      if (rawTranscript && hasText && rawTranscript !== inputValue.trim()) {
        void fetch("/api/voice/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalText: rawTranscript, editedText: inputValue.trim() }),
        }).catch(() => {});
      }
      // Always clear transcript refs on send — bar disappears after message is sent
      lastTranscriptRef.current = null;
      wasAiEnhancedRef.current = false;

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
        // Strip [PASTE_CONTENT:N:M]...[/PASTE_CONTENT:N] delimiter tags for clean display.
        // Content is preserved inline; the API sanitizer handles truncation if needed.
        const cleanMessage = expandedMessage.replace(
          /\[PASTE_CONTENT:\d+:\d+\]\n([\s\S]*?)\n\[\/PASTE_CONTENT:\d+\]/g,
          (_m: string, content: string) => content
        );
        threadRuntime.composer.setText(cleanMessage);
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
      lastTranscriptRef,
      wasAiEnhancedRef,
    ]
  );

  // -----------------------------------------------------------------------
  // Tiptap editor submit — Path B: multimodal content array
  // -----------------------------------------------------------------------
  const handleEditorSubmit = useCallback(
    (contentParts: ContentPart[]) => {
      // Composer attachments (from the paperclip button) live in the
      // threadRuntime composer state — tiptap's own inline images are
      // already part of contentParts, but composer-level attachments
      // are not, so we must merge them manually.
      const composerAttachments = threadRuntime.composer.getState().attachments ?? [];

      if (contentParts.length === 0 && composerAttachments.length === 0) return;

      // Deep research mode only takes text — extract text parts
      if (isDeepResearchMode && deepResearch && !isQueueBlocked) {
        const textOnly = contentParts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text!)
          .join("\n");
        if (textOnly.trim()) {
          deepResearch.startResearch(textOnly.trim());
        }
        tiptapRef.current?.clear();
        clearTiptapDraft();
        return;
      }

      // Build the multimodal content array for threadRuntime.append()
      const apiContent: Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string }
      > = [];

      for (const part of contentParts) {
        if (part.type === "text" && part.text) {
          apiContent.push({ type: "text", text: part.text });
        } else if (part.type === "image" && part.image) {
          apiContent.push({ type: "image", image: part.image });
        }
      }

      // Merge composer attachments (uploaded via the attachment button)
      for (const attachment of composerAttachments) {
        if (attachment.content) {
          for (const part of attachment.content) {
            if (part.type === "image" && "image" in part) {
              apiContent.push({ type: "image", image: (part as { type: "image"; image: string }).image });
            }
          }
        }
      }

      if (apiContent.length === 0) return;

      // Extract text for queue display
      const textForQueue = apiContent
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join(" ")
        .slice(0, 100);

      if (isQueueBlocked) {
        if (textForQueue) {
          const msgId = `queued-${Date.now()}`;
          setQueuedMessages((prev) => [
            ...prev,
            {
              id: msgId,
              content: textForQueue,
              mode: isDeepResearchMode ? "deep-research" : "chat",
              status: "queued-classic",
            },
          ]);
        }
        tiptapRef.current?.clear();
        clearTiptapDraft();
        if (composerAttachments.length > 0) {
          threadRuntime.composer.clearAttachments();
        }
        return;
      }

      // Direct submit via threadRuntime.append() — multimodal interleaving
      threadRuntime.append({
        role: "user",
        content: apiContent,
      });

      tiptapRef.current?.clear();
      clearTiptapDraft();
      clearEnhancement();
      if (composerAttachments.length > 0) {
        threadRuntime.composer.clearAttachments();
      }
    },
    [
      isQueueBlocked,
      isDeepResearchMode,
      deepResearch,
      threadRuntime,
      clearEnhancement,
      clearTiptapDraft,
      attachmentCount,
    ]
  );

  const toggleEditorMode = useCallback(() => {
    if (!isEditorMode) {
      if (!tiptapDraft) {
        const seededDoc = plainTextToTiptapDoc(inputValue);
        if (seededDoc) {
          setTiptapDraft(seededDoc);
        }
      }

      simpleDraftAtRichModeEntryRef.current = inputValue;
      setIsEditorMode(true);
      return;
    }

    const composerTextFromRichEditor = contentPartsToComposerText(
      tiptapRef.current?.getContentArray() ?? [],
    );
    const draftAtEntry = simpleDraftAtRichModeEntryRef.current;
    const canOverwriteSimpleDraft =
      inputValue.trim().length === 0 ||
      draftAtEntry === null ||
      inputValue === draftAtEntry;

    if (composerTextFromRichEditor && canOverwriteSimpleDraft) {
      setInputValue(composerTextFromRichEditor);
      updateCursorPosition(composerTextFromRichEditor.length);
    }

    simpleDraftAtRichModeEntryRef.current = null;
    setIsEditorMode(false);
  }, [
    inputValue,
    isEditorMode,
    setInputValue,
    setIsEditorMode,
    setTiptapDraft,
    tiptapDraft,
    updateCursorPosition,
  ]);

  const handleTiptapDraftChange = useCallback(
    (nextDraft: JSONContent | null) => {
      setTiptapDraft(nextDraft);
    },
    [setTiptapDraft],
  );

  const handleClearTiptapDraft = useCallback(() => {
    clearTiptapDraft();
  }, [clearTiptapDraft]);

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

      // Tab → accept reward ghost text
      if (e.key === "Tab" && rewardGhostText) {
        e.preventDefault();
        const suffix = `\n${rewardGhostText}`;
        setInputValue((prev) => prev + suffix);
        setRewardDismissed(true);
        return;
      }

      // Escape → dismiss reward ghost text
      if (e.key === "Escape" && rewardGhostText) {
        e.preventDefault();
        setRewardDismissed(true);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, rewardGhostText, setInputValue]
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
    if (isRunning) {
      try { threadRuntime.cancelRun(); } catch { /* pre-init abort — no-op */ }
    }
    if (deepResearch && (isDeepResearchActive || isDeepResearchLoading)) {
      deepResearch.cancelResearch();
    }
  }, [deepResearch, isCancelling, isDeepResearchActive, isDeepResearchLoading, isOperationRunning, isRunning, threadRuntime]);

  // When the operation stops after a cancel, refresh messages from DB to
  // restore any messages the AI SDK discarded from its optimistic state
  // (e.g. user pressed Stop very quickly after sending).
  const wasCancellingRef = useRef(false);
  useEffect(() => {
    if (isCancelling) {
      wasCancellingRef.current = true;
    }
    if (!isOperationRunning) {
      const wasCancelling = wasCancellingRef.current;
      setIsCancelling(false);
      wasCancellingRef.current = false;
      if (wasCancelling && onPostCancel) {
        setTimeout(onPostCancel, 500);
      }
    }
  }, [isOperationRunning, isCancelling, onPostCancel]);

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
          setQueuedMessages(prev => {
            let didChange = false;
            const next = prev.map(m => {
              if (m.status !== "injected-live") {
                return m;
              }
              didChange = true;
              return { ...m, status: "fallback" as const };
            });
            return didChange ? next : prev;
          });
        } else {
          // Messages were processed by prepareStep — clear the chips.
          setQueuedMessages(prev => {
            const next = prev.filter(m => m.status !== "injected-live");
            return next.length === prev.length ? prev : next;
          });
        }
      });
      return;
    }

    setQueuedMessages(prev => {
      const next = prev.filter(m => m.status !== "injected-live");
      return next.length === prev.length ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueueBlocked, queuedMessages, onLivePromptInjected]);

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
            {queuedMessages.every(m => m.status === "injected-live")
              ? t("queue.messagesInjected", { count: queuedMessages.length })
              : t("queue.messagesQueued", { count: queuedMessages.length })}
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
                    ? "bg-terminal-dark/10 text-terminal-muted border border-terminal-dark/20"
                    : msg.status === "queued-live"
                    ? "bg-yellow-50/30 text-yellow-700 border border-yellow-300/40"
                    : msg.status === "fallback"
                    ? "bg-orange-50/30 text-orange-700 border border-orange-300/40"
                    : "bg-terminal-dark/10 text-terminal-dark"
                )}
              >
                {msg.status === "injected-live" && (
                  <CheckCircleIcon className="size-3 shrink-0 text-terminal-muted" />
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

      <ComposerPrimitive.Root
        ref={composerRef}
        className={cn(
          "relative flex w-full flex-col rounded-lg shadow-md transition-shadow focus-within:shadow-lg transform-gpu",
          isDeepResearchMode
            ? "bg-purple-50/80 focus-within:bg-purple-50 border border-purple-200 dark:bg-purple-950/50 dark:focus-within:bg-purple-950/60 dark:border-purple-800"
            : hasWallpaper ? "bg-terminal-cream/50 backdrop-blur-sm focus-within:bg-terminal-cream/60" : "bg-terminal-cream/80 focus-within:bg-terminal-cream"
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
          <div className="flex items-center gap-2 px-4 pt-2 text-xs font-mono text-purple-600 dark:text-purple-400">
            <FlaskConicalIcon className="size-3" />
            {t("deepResearch.modeLabel")}
          </div>
        )}

        <div className="flex flex-wrap gap-2 p-2 empty:hidden">
          <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} />
        </div>

{/* Reward suggestion is shown as inline ghost text in the textarea */}

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

        {isRecordingVoice && (
          <VoiceWaveform
            isRecording={isRecordingVoice}
            analyserNode={analyserNode}
            className="border-b border-terminal-dark/10"
          />
        )}

        {!isRecordingVoice && !isTranscribingVoice && (sttEnabled || pastedTexts.length > 0) && voiceActionsEnabled && inputValue.trim().length > 0 && (
          <VoiceActions
            text={expandPlaceholders(inputValue)}
            sessionId={sessionId}
            onResult={(text) => {
              setInputValue(text);
              clearPastedTexts();
            }}
            className="px-3 py-1.5 border-b border-terminal-dark/10"
          />
        )}

        {/* I7: Transcribing state indicator */}
        {isTranscribingVoice && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs font-mono text-terminal-muted border-b border-terminal-dark/10">
            <Loader2Icon className="size-3 animate-spin flex-shrink-0" />
            <span>Transcribing...</span>
          </div>
        )}

        {/* I5: Voice transcript indicator — always visible when a transcript is stored */}
        {!isRecordingVoice && !isTranscribingVoice && lastTranscriptRef.current && (
          <div className="flex items-center gap-1.5 px-3 py-1 border-b border-terminal-dark/10">
            {wasAiEnhancedRef.current && lastTranscriptRef.current !== inputValue.trim() ? (
              <>
                <SparklesIcon className="size-3 text-amber-500" />
                <span className="text-[10px] font-mono text-terminal-muted">AI-cleaned</span>
              </>
            ) : (
              <>
                <MicIcon className="size-3 text-terminal-muted" />
                <span className="text-[10px] font-mono text-terminal-muted">Voice transcript</span>
              </>
            )}
            <button
              type="button"
              disabled={lastTranscriptRef.current === inputValue.trim()}
              onClick={() => {
                if (lastTranscriptRef.current) {
                  setInputValue(lastTranscriptRef.current);
                }
              }}
              className="flex items-center gap-0.5 text-[10px] font-mono text-terminal-muted hover:text-terminal-dark transition-colors ml-1 disabled:opacity-30 disabled:cursor-default disabled:hover:text-terminal-muted"
            >
              <UndoIcon className="size-3" />
              Restore
            </button>
          </div>
        )}

        {isEditorMode ? (
          /* ---- Tiptap rich editor mode ---- */
          <div className="flex flex-col">
            <TiptapEditor
              ref={tiptapRef}
              onSubmit={handleEditorSubmit}
              sessionId={sessionId}
              placeholder={getPlaceholder()}
              disabled={isDeepResearchLoading}
              isSubmitting={false}
              initialContent={tiptapDraft}
              onDraftChange={handleTiptapDraftChange}
              onDraftClear={handleClearTiptapDraft}
            />
            <div className="flex items-center justify-end">
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
                onToggleDeepResearch={deepResearch?.toggleDeepResearchMode}
                sttEnabled={sttEnabled}
                isRecordingVoice={isRecordingVoice}
                isTranscribingVoice={isTranscribingVoice}
                onVoiceInput={handleVoiceInput}
                voiceActivationMode={voiceActivationMode}
                onVoiceStart={handleVoiceStart}
                onVoiceStop={handleVoiceStop}
                inputHasText={tiptapRef.current?.hasContent() ?? false}
                attachmentCount={attachmentCount}
                showEnhanceButton={false}
                isEnhancing={false}
                enhancedContext={null}
                enhancementFilesFound={0}
                onEnhance={handleEnhance}
                isEditorMode={isEditorMode}
                onToggleEditorMode={toggleEditorMode}
                onCancel={handleCancel}
                onSubmit={() => {
                  const parts = tiptapRef.current?.getContentArray();
                  if (parts?.length) handleEditorSubmit(parts);
                }}
              />
            </div>
          </div>
        ) : (
          /* ---- Simple textarea mode (default) ---- */
          <div className="flex items-end">
            <div className="relative flex-1">
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
                onBlur={() => syncRewardSuggestion()}
                onScroll={() => {
                  if (ghostScrollRef.current && inputRef.current) {
                    ghostScrollRef.current.scrollTop = inputRef.current.scrollTop;
                  }
                }}
                autoFocus
                placeholder={getPlaceholder()}
                rows={1}
                className="w-full resize-none bg-transparent p-4 text-sm font-mono outline-none placeholder:text-terminal-muted text-terminal-dark overflow-y-auto transition-[height] duration-150 ease-out"
                style={{ minHeight: "36px", maxHeight: "192px" }}
              />
              {/* Ghost text overlay for reward suggestion */}
              {rewardGhostText && inputValue.trim() && (
                <div
                  ref={ghostScrollRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden p-4 text-sm font-mono whitespace-pre-wrap break-words"
                  style={{ minHeight: "36px", maxHeight: "192px" }}
                >
                  {/* Invisible mirror of real text to position ghost suffix */}
                  <span className="invisible">{inputValue}</span>
                  <span className="text-terminal-muted/50 select-none">{`\n${rewardGhostText}`}</span>
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] text-terminal-muted/40 bg-terminal-muted/8 border border-terminal-muted/15 rounded select-none font-sans align-middle">Tab ↵</span>
                </div>
              )}
            </div>

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
              onToggleDeepResearch={deepResearch?.toggleDeepResearchMode}
              sttEnabled={sttEnabled}
              isRecordingVoice={isRecordingVoice}
              isTranscribingVoice={isTranscribingVoice}
              onVoiceInput={handleVoiceInput}
              voiceActivationMode={voiceActivationMode}
              onVoiceStart={handleVoiceStart}
              onVoiceStop={handleVoiceStop}
              inputHasText={inputValue.trim().length > 2}
              attachmentCount={attachmentCount}
              showEnhanceButton={!!(character?.id && character.id !== "default")}
              isEnhancing={isEnhancing}
              enhancedContext={enhancedContext}
              enhancementFilesFound={enhancementInfo?.filesFound || 0}
              onEnhance={handleEnhance}
              isEditorMode={isEditorMode}
              onToggleEditorMode={toggleEditorMode}
              onCancel={handleCancel}
              onSubmit={handleSubmit}
            />
          </div>
        )}
      </ComposerPrimitive.Root>

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
        {sessionId && <ModelSelector sessionId={sessionId} status={contextStatus} />}
      </div>

      <ActiveDelegationsIndicator characterId={character?.id ?? null} />
    </div>
  );
};
