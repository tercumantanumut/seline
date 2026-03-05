"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { SkillRecord } from "@/lib/skills/types";
import {
  detectSlashSkillTrigger,
  getRequiredSkillInputs,
  insertSkillRunIntent,
} from "@/lib/skills/skill-picker-utils";
import { resilientFetch, resilientPost } from "@/lib/utils/resilient-fetch";
import {
  finalizeTranscriptText,
  normalizeTranscriptText,
} from "./voice-transcript-utils";
import type { ComposerSkillLite, SkillPickerMode } from "./composer-skill-picker";
import { MAX_SLASH_SKILL_RESULTS } from "./composer-skill-picker";

// ---------------------------------------------------------------------------
// useVoiceRecording
// ---------------------------------------------------------------------------

interface VoiceTranscriptPayload {
  transcript: string;
  finalText: string;
  fallbackText: string;
  usedPostProcessing: boolean;
}

interface UseVoiceRecordingOptions {
  sttEnabled: boolean;
  onTranscript: (payload: VoiceTranscriptPayload) => void;
  onTranscriptInserted?: () => void;
  voicePostProcessing?: boolean;
  voiceAudioCues?: boolean;
  voiceActivationMode?: "tap" | "push";
}

export interface UseVoiceRecordingReturn {
  isRecordingVoice: boolean;
  isTranscribingVoice: boolean;
  handleVoiceInput: () => Promise<void>;
  /** Push mode: start recording only (never stops). Use with onMouseDown/onTouchStart. */
  handleVoiceStart: () => Promise<void>;
  /** Push mode: stop recording only. Use with onMouseUp/onMouseLeave/onTouchEnd. */
  handleVoiceStop: () => void;
  analyserNode: AnalyserNode | null;
  /** The raw transcript from the last voice input (before post-processing), for auto-learn comparison */
  lastTranscriptRef: React.RefObject<string | null>;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions): UseVoiceRecordingReturn {
  const { sttEnabled, onTranscript, onTranscriptInserted } = options;
  const voiceAudioCues = options.voiceAudioCues ?? true;
  const voicePostProcessing = options.voicePostProcessing ?? false;

  const t = useTranslations("assistantUi");
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastTranscriptRef = useRef<string | null>(null);

  const stopRecordingStream = useCallback(() => {
    if (recordingStreamRef.current) {
      for (const track of recordingStreamRef.current.getTracks()) {
        track.stop();
      }
      recordingStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    setAnalyserNode(null);
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = "sine") => {
    if (!voiceAudioCues) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      osc.onended = () => { try { ctx.close(); } catch {} };
    } catch {
      // Audio cue failed — non-critical
    }
  }, [voiceAudioCues]);

  useEffect(() => {
    return () => {
      try {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        // noop
      }
      stopRecordingStream();
      recordingChunksRef.current = [];
      mediaRecorderRef.current = null;
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
        audioContextRef.current = null;
      }
      setAnalyserNode(null);
    };
  }, [stopRecordingStream]);

  // Shared helper: start a new recording session (mic access, MediaRecorder setup, etc.)
  const startRecording = useCallback(async () => {
    if (!sttEnabled || isTranscribingVoice) {
      return;
    }

    // Already recording — bail out (use ref to avoid stale closure)
    if (isRecordingRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(t("audio.voiceNotSupported"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create audio analyser for waveform visualization
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        audioContextRef.current = audioCtx;
        setAnalyserNode(analyser);
      } catch {
        // Waveform not available — recording still works
      }

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const supportedMimeType = preferredMimeTypes.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      );
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        isRecordingRef.current = false;
        setIsRecordingVoice(false);
        setIsTranscribingVoice(false);
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        stopRecordingStream();
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch {}
          audioContextRef.current = null;
        }
        setAnalyserNode(null);
        toast.error(t("audio.voiceRecordingFailed"));
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        setIsRecordingVoice(false);
        playTone(440, 0.15);
        const mimeType = recorder.mimeType || "audio/webm";
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopRecordingStream();

        if (chunks.length === 0) {
          toast.error(t("audio.noAudioCaptured"));
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size === 0) {
          toast.error(t("audio.noAudioCaptured"));
          return;
        }

        setIsTranscribingVoice(true);
        try {
          const extension = mimeType.includes("ogg")
            ? "ogg"
            : mimeType.includes("wav")
              ? "wav"
              : mimeType.includes("mp4") || mimeType.includes("m4a")
                ? "m4a"
                : "webm";
          const formData = new FormData();
          formData.append("file", audioBlob, `voice-input.${extension}`);

          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || t("toast.transcriptionFailed"));
          }

          const transcript =
            typeof payload?.text === "string" ? payload.text.trim() : "";
          if (!transcript) {
            throw new Error(t("toast.noSpeechDetected"));
          }

          // Store raw transcript for auto-learn comparison when user sends
          lastTranscriptRef.current = transcript;

          let enhancedText: string | null = null;
          if (voicePostProcessing && transcript.length > 0) {
            try {
              const cleanupResponse = await fetch("/api/voice/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: transcript, action: "fix-grammar" }),
              });
              const cleanupData = await cleanupResponse.json() as { success?: boolean; text?: string };
              if (cleanupData.success && typeof cleanupData.text === "string" && cleanupData.text.trim().length > 0) {
                enhancedText = cleanupData.text.trim();
              }
            } catch {
              // Post-processing failed — use raw transcript
              toast.info("Grammar cleanup unavailable. Using raw transcription.");
            }
          }

          const result = finalizeTranscriptText({
            transcript,
            postProcessingEnabled: voicePostProcessing,
            enhancedText,
          });

          onTranscript({
            transcript: result.transcript,
            finalText: result.finalText,
            fallbackText: result.fallbackText,
            usedPostProcessing: result.usedEnhancedText,
          });
          onTranscriptInserted?.();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : t("toast.transcriptionFailed");
          toast.error(errorMessage);
        } finally {
          setIsTranscribingVoice(false);
        }
      };

      recorder.start(250);
      playTone(880, 0.12);
      isRecordingRef.current = true;
      setIsRecordingVoice(true);
    } catch (error) {
      let errorMessage: string;
      if (error instanceof DOMException) {
        switch (error.name) {
          case "NotAllowedError":
            errorMessage = "Microphone access denied. Check your browser and system privacy settings.";
            break;
          case "NotFoundError":
            errorMessage = "No microphone detected. Please connect a microphone.";
            break;
          case "NotReadableError":
            errorMessage = "Microphone is in use by another application.";
            break;
          default:
            errorMessage = "Failed to access microphone.";
        }
      } else {
        errorMessage = "Failed to access microphone.";
      }
      toast.error(errorMessage);
      isRecordingRef.current = false;
      setIsRecordingVoice(false);
      setIsTranscribingVoice(false);
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      stopRecordingStream();
    }
  }, [isTranscribingVoice, sttEnabled, stopRecordingStream, onTranscript, onTranscriptInserted, playTone, voicePostProcessing, t]);

  // Shared helper: stop an active recording
  const stopRecording = useCallback(() => {
    const activeRecorder = mediaRecorderRef.current;
    if (activeRecorder && activeRecorder.state !== "inactive") {
      activeRecorder.stop();
    }
  }, []);

  // Tap mode: toggle recording on/off
  const handleVoiceInput = useCallback(async () => {
    if (!sttEnabled || isTranscribingVoice) {
      return;
    }

    const activeRecorder = mediaRecorderRef.current;
    if (isRecordingVoice && activeRecorder && activeRecorder.state !== "inactive") {
      activeRecorder.stop();
      return;
    }

    await startRecording();
  }, [isRecordingVoice, isTranscribingVoice, sttEnabled, startRecording]);

  // Push mode: start recording only (never stops)
  const handleVoiceStart = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  // Push mode: stop recording only
  const handleVoiceStop = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return { isRecordingVoice, isTranscribingVoice, handleVoiceInput, handleVoiceStart, handleVoiceStop, analyserNode, lastTranscriptRef };
}

// ---------------------------------------------------------------------------
// usePastedTexts
// ---------------------------------------------------------------------------

export interface PastedTextItem {
  index: number;
  text: string;
  lineCount: number;
  placeholder: string;
}

export interface UsePastedTextsReturn {
  pastedTexts: PastedTextItem[];
  pasteCounterRef: React.MutableRefObject<number>;
  addPastedText: (item: Omit<PastedTextItem, "index">) => number;
  removePastedText: (index: number, setInputValue: (updater: (v: string) => string) => void) => void;
  clearPastedTexts: () => void;
  expandPlaceholders: (message: string) => string;
}

export function usePastedTexts(): UsePastedTextsReturn {
  const [pastedTexts, setPastedTexts] = useState<PastedTextItem[]>([]);
  const pasteCounterRef = useRef(0);

  const addPastedText = useCallback((item: Omit<PastedTextItem, "index">): number => {
    pasteCounterRef.current += 1;
    const index = pasteCounterRef.current;
    setPastedTexts((prev) => [...prev, { ...item, index }]);
    return index;
  }, []);

  const removePastedText = useCallback(
    (index: number, setInputValue: (updater: (v: string) => string) => void) => {
      setPastedTexts((prev) => {
        const item = prev.find((p) => p.index === index);
        if (item) {
          setInputValue((v) => v.replace(item.placeholder, ""));
        }
        return prev.filter((p) => p.index !== index);
      });
    },
    []
  );

  const clearPastedTexts = useCallback(() => {
    setPastedTexts([]);
    pasteCounterRef.current = 0;
  }, []);

  const expandPlaceholders = useCallback(
    (message: string): string => {
      let result = message;
      for (const paste of pastedTexts) {
        result = result.replace(
          paste.placeholder,
          `[PASTE_CONTENT:${paste.index}:${paste.lineCount}]\n${paste.text}\n[/PASTE_CONTENT:${paste.index}]`
        );
      }
      return result;
    },
    [pastedTexts]
  );

  return { pastedTexts, pasteCounterRef, addPastedText, removePastedText, clearPastedTexts, expandPlaceholders };
}

// ---------------------------------------------------------------------------
// useSkillPickerState
// ---------------------------------------------------------------------------
// Manages all skill picker state, loading, filtering, spotlight shortcut, and
// keyboard-driven focus management so the Composer component stays lean.

interface UseSkillPickerStateOptions {
  characterId: string | undefined;
  inputValue: string;
  cursorPosition: number;
  /** Ref to the composer textarea for outside-click and focus return */
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Ref to the picker container element for outside-click detection */
  skillPickerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to the spotlight search input for auto-focus in spotlight mode */
  skillSearchInputRef: React.RefObject<HTMLInputElement | null>;
  /** Callback to update the input value when a skill is inserted */
  setInputValue: (value: string) => void;
  /** Callback to update cursor position after skill insertion */
  updateCursorPosition: (start: number, end?: number) => void;
}

export interface UseSkillPickerStateReturn {
  skills: ComposerSkillLite[];
  filteredSkills: ComposerSkillLite[];
  isLoadingSkills: boolean;
  showSkillPicker: boolean;
  skillPickerQuery: string;
  selectedSkillIndex: number;
  skillPickerMode: SkillPickerMode;
  spotlightShortcutHint: string;
  openSpotlightSkillPicker: () => void;
  selectSkill: (skill: ComposerSkillLite) => void;
  closeSkillPicker: () => void;
  setSkillPickerQuery: (query: string) => void;
  setSelectedSkillIndex: (updater: ((index: number) => number) | number) => void;
}

export function useSkillPickerState({
  characterId,
  inputValue,
  cursorPosition,
  inputRef,
  skillPickerRef,
  skillSearchInputRef,
  setInputValue,
  updateCursorPosition,
}: UseSkillPickerStateOptions): UseSkillPickerStateReturn {
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillPickerQuery, setSkillPickerQuery] = useState("");
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [skills, setSkills] = useState<ComposerSkillLite[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [skillPickerMode, setSkillPickerMode] = useState<SkillPickerMode>("slash");

  const isApplePlatform =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const spotlightShortcutHint = isApplePlatform ? "⌘⇧K" : "Ctrl+K";

  const filteredSkills = useMemo(() => {
    const query = skillPickerQuery.trim().toLowerCase();
    if (!query) {
      return skills.slice(0, MAX_SLASH_SKILL_RESULTS);
    }
    return skills
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description?.toLowerCase().includes(query) ||
          skill.category.toLowerCase().includes(query)
      )
      .slice(0, MAX_SLASH_SKILL_RESULTS);
  }, [skills, skillPickerQuery]);

  // Load skills when character changes
  useEffect(() => {
    let cancelled = false;

    const loadSkills = async () => {
      if (!characterId || characterId === "default") {
        setSkills([]);
        setIsLoadingSkills(false);
        return;
      }

      setIsLoadingSkills(true);
      const query = new URLSearchParams({ characterId, status: "active" });
      const { data, error } = await resilientFetch<{ skills?: SkillRecord[] }>(
        `/api/skills?${query.toString()}`,
        { retries: 0 }
      );

      if (cancelled) return;

      if (error || !Array.isArray(data?.skills)) {
        setSkills([]);
        setIsLoadingSkills(false);
        return;
      }

      setSkills(
        data.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category || "general",
          inputParameters: skill.inputParameters,
        }))
      );
      setIsLoadingSkills(false);
    };

    void loadSkills();
    return () => { cancelled = true; };
  }, [characterId]);

  // Detect slash trigger in the input
  useEffect(() => {
    if (skillPickerMode === "spotlight") return;

    const slashTrigger = detectSlashSkillTrigger(inputValue, cursorPosition);
    if (slashTrigger) {
      setShowSkillPicker(true);
      setSkillPickerMode("slash");
      setSkillPickerQuery(slashTrigger.query);
      setSelectedSkillIndex(0);
      return;
    }

    setShowSkillPicker(false);
    setSkillPickerQuery("");
    setSelectedSkillIndex(0);
  }, [inputValue, cursorPosition, skillPickerMode]);

  // Clamp selected index when filtered list shrinks
  useEffect(() => {
    setSelectedSkillIndex((current) => {
      if (filteredSkills.length === 0) return 0;
      return Math.min(current, filteredSkills.length - 1);
    });
  }, [filteredSkills.length]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showSkillPicker) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (inputRef.current?.contains(target) || skillPickerRef.current?.contains(target)) return;
      setShowSkillPicker(false);
      setSkillPickerMode("slash");
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showSkillPicker, inputRef, skillPickerRef]);

  // Spotlight keyboard shortcut
  const openSpotlightSkillPicker = useCallback(() => {
    setSkillPickerMode("spotlight");
    setShowSkillPicker(true);
    setSkillPickerQuery("");
    setSelectedSkillIndex(0);
  }, []);

  useEffect(() => {
    const handleSpotlightShortcut = (event: KeyboardEvent) => {
      if (!inputRef.current || document.activeElement !== inputRef.current) return;

      const normalizedKey = event.key.toLowerCase();
      const isShortcut = isApplePlatform
        ? event.metaKey && event.shiftKey && normalizedKey === "k"
        : event.ctrlKey && normalizedKey === "k";

      if (!isShortcut) return;

      event.preventDefault();
      openSpotlightSkillPicker();
    };

    window.addEventListener("keydown", handleSpotlightShortcut);
    return () => window.removeEventListener("keydown", handleSpotlightShortcut);
  }, [isApplePlatform, openSpotlightSkillPicker, inputRef]);

  // Auto-focus search input or textarea when picker opens/mode changes
  useEffect(() => {
    if (!showSkillPicker) return;

    if (skillPickerMode === "spotlight") {
      requestAnimationFrame(() => skillSearchInputRef.current?.focus());
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  }, [showSkillPicker, skillPickerMode, skillSearchInputRef, inputRef]);

  const closeSkillPicker = useCallback(() => {
    setShowSkillPicker(false);
    setSkillPickerMode("slash");
  }, []);

  const selectSkill = useCallback(
    (skill: ComposerSkillLite) => {
      const requiredInputs = getRequiredSkillInputs(skill.inputParameters);
      const insertion = insertSkillRunIntent(inputValue, cursorPosition, skill.name, requiredInputs);
      setInputValue(insertion.value);
      updateCursorPosition(insertion.nextCursor);
      setShowSkillPicker(false);
      setSkillPickerMode("slash");

      requestAnimationFrame(() => {
        const textarea = inputRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(insertion.nextCursor, insertion.nextCursor);
      });
    },
    [inputValue, cursorPosition, setInputValue, updateCursorPosition, inputRef]
  );

  return {
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
  };
}

// ---------------------------------------------------------------------------
// usePromptEnhancement
// ---------------------------------------------------------------------------

interface UsePromptEnhancementOptions {
  inputValue: string;
  setInputValue: (value: string) => void;
  characterId: string | undefined;
  sessionId?: string;
  /** Recent thread messages for conversation context */
  recentMessages: Array<{ role: string; content: string }>;
  /** Expands composer placeholders (e.g. pasted text blocks) before sending to enhancement API */
  expandInput?: (input: string) => string;
}

export interface UsePromptEnhancementReturn {
  isEnhancing: boolean;
  enhancedContext: string | null;
  enhancementInfo: { filesFound?: number; chunksRetrieved?: number } | null;
  clearEnhancement: () => void;
  handleEnhance: () => Promise<void>;
}

export function usePromptEnhancement({
  inputValue,
  setInputValue,
  characterId,
  sessionId,
  recentMessages,
  expandInput,
}: UsePromptEnhancementOptions): UsePromptEnhancementReturn {
  const t = useTranslations("assistantUi");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedContext, setEnhancedContext] = useState<string | null>(null);
  const [enhancementInfo, setEnhancementInfo] = useState<{
    filesFound?: number;
    chunksRetrieved?: number;
  } | null>(null);

  const clearEnhancement = useCallback(() => {
    setEnhancedContext(null);
    setEnhancementInfo(null);
  }, []);

  const handleEnhance = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || trimmedInput.length < 3) {
      toast.error(t("enhance.minChars"));
      return;
    }

    if (!characterId || characterId === "default") {
      toast.error(t("enhance.selectAgent"));
      return;
    }

    const enhancementInput = (expandInput ? expandInput(trimmedInput) : trimmedInput).trim();
    if (!enhancementInput || enhancementInput.length < 3) {
      toast.error(t("enhance.minChars"));
      return;
    }

    setIsEnhancing(true);
    setEnhancementInfo(null);

    try {
      const { data, error: fetchError } = await resilientPost<{
        success?: boolean;
        enhancedPrompt?: string;
        filesFound?: number;
        chunksRetrieved?: number;
        usedLLM?: boolean;
        skipReason?: string;
        error?: string;
      }>(
        "/api/enhance-prompt",
        {
          input: enhancementInput,
          characterId,
          sessionId,
          useLLM: true,
          conversationContext: recentMessages,
        },
        { timeout: 60_000, retries: 0 }
      );

      if (fetchError || !data) {
        toast.error(data?.error || fetchError || t("enhance.failed"));
        return;
      }

      if (data.success) {
        setInputValue(data.enhancedPrompt!);
        setEnhancedContext(data.enhancedPrompt!);
        setEnhancementInfo({ filesFound: data.filesFound, chunksRetrieved: data.chunksRetrieved });
        const llmIndicator = data.usedLLM ? " (LLM)" : "";
        toast.success(
          t("enhance.success", {
            files: data.filesFound ?? 0,
            chunks: data.chunksRetrieved ?? 0,
            llmIndicator,
          })
        );
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
  }, [inputValue, characterId, sessionId, recentMessages, expandInput, setInputValue, t]);

  return { isEnhancing, enhancedContext, enhancementInfo, clearEnhancement, handleEnhance };
}
