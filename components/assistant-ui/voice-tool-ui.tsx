"use client";

import { useEffect, useRef, type FC } from "react";
import {
  Volume2Icon,
  VolumeXIcon,
  AlertCircleIcon,
  MicIcon,
  SquareIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useOptionalVoice } from "./voice-context";

// ---------------------------------------------------------------------------
// Speak Aloud Tool UI
// ---------------------------------------------------------------------------

interface SpeakAloudArgs {
  text: string;
  voice?: string;
  speed?: number;
}

interface SpeakAloudResult {
  status: "success" | "error";
  audioUrl?: string;
  mimeType?: string;
  audioSize?: number;
  textLength?: number;
  message?: string;
  error?: string;
}

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args: SpeakAloudArgs;
  result?: SpeakAloudResult;
}>;

/**
 * Compact inline UI for the speakAloud tool.
 * Shows: loading spinner → mini audio player (auto-plays) → error message.
 */
export const SpeakAloudToolUI: ToolCallContentPartComponent = ({
  args,
  result,
}) => {
  const t = useTranslations("assistantUi.voiceTool");
  const voiceCtx = useOptionalVoice();
  const hasAutoPlayed = useRef(false);

  // Auto-play when result arrives with audioUrl
  useEffect(() => {
    if (
      result?.status === "success" &&
      result.audioUrl &&
      voiceCtx &&
      !hasAutoPlayed.current
    ) {
      hasAutoPlayed.current = true;
      voiceCtx.playAudio(result.audioUrl);
    }
  }, [result, voiceCtx]);

  // --- Loading state ---
  if (!result) {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-terminal-border/40 bg-terminal-bg/20 font-mono text-xs text-terminal-muted">
        <Volume2Icon className="w-3.5 h-3.5 animate-pulse text-terminal-amber" />
        <span>{t("synthesizing")}</span>
        <div className="w-3.5 h-3.5 rounded-full border border-terminal-amber/40 border-t-terminal-amber animate-spin" />
      </div>
    );
  }

  // --- Error state ---
  if (result.status === "error") {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-red-200 bg-red-50/60 font-mono text-xs text-red-600">
        <VolumeXIcon className="w-3.5 h-3.5" />
        <span>{result.error || t("ttsFailed")}</span>
      </div>
    );
  }

  // --- Success state with audio player ---
  const isPlaying =
    voiceCtx?.voice.isPlaying &&
    voiceCtx.voice.currentAudioUrl === result.audioUrl;
  const sizeKb = result.audioSize
    ? (result.audioSize / 1024).toFixed(1)
    : "?";

  return (
    <div className="my-1 inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (!voiceCtx || !result.audioUrl) return;
          if (isPlaying) {
            voiceCtx.stopAudio();
          } else {
            voiceCtx.playAudio(result.audioUrl);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors font-mono text-xs",
          isPlaying
            ? "border-terminal-amber/60 bg-terminal-amber/10 text-terminal-amber"
            : "border-terminal-border/40 bg-terminal-bg/20 hover:bg-terminal-bg/40 text-terminal-dark"
        )}
      >
        {isPlaying ? (
          <>
            <SquareIcon className="w-3 h-3 fill-current" />
            <span>{t("stop")}</span>
          </>
        ) : (
          <>
            <Volume2Icon className="w-3.5 h-3.5 text-terminal-green" />
            <span>{t("play")}</span>
          </>
        )}
        <span className="text-terminal-muted">
          {sizeKb} KB · {result.textLength ?? "?"} chars
        </span>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Transcribe Tool UI
// ---------------------------------------------------------------------------

interface TranscribeArgs {
  instruction: string;
}

interface TranscribeResult {
  status: "success" | "error";
  transcriptionAvailable?: boolean;
  autoTranscribeEnabled?: boolean;
  supportedFormats?: string[];
  provider?: string;
  note?: string;
  error?: string;
}

type TranscribeToolCallComponent = FC<{
  toolName: string;
  argsText?: string;
  args: TranscribeArgs;
  result?: TranscribeResult;
}>;

/**
 * Compact inline UI for the transcribe tool.
 */
export const TranscribeToolUI: TranscribeToolCallComponent = ({ result }) => {
  const t = useTranslations("assistantUi.voiceTool");
  // --- Loading ---
  if (!result) {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-terminal-border/40 bg-terminal-bg/20 font-mono text-xs text-terminal-muted">
        <MicIcon className="w-3.5 h-3.5 animate-pulse text-terminal-amber" />
        <span>{t("checkingTranscription")}</span>
      </div>
    );
  }

  // --- Error ---
  if (result.status === "error") {
    return (
      <div className="my-1 inline-flex items-center gap-2 px-2.5 py-1 rounded border border-red-200 bg-red-50/60 font-mono text-xs text-red-600">
        <AlertCircleIcon className="w-3.5 h-3.5" />
        <span>{result.error || t("transcriptionFailed")}</span>
      </div>
    );
  }

  // --- Success ---
  const available = result.transcriptionAvailable;
  return (
    <div className="my-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-terminal-border/40 bg-terminal-bg/20 font-mono text-xs">
      <MicIcon
        className={cn(
          "w-3.5 h-3.5",
          available ? "text-terminal-green" : "text-terminal-muted"
        )}
      />
      <span className="text-terminal-dark font-semibold">STT</span>
      <span className={available ? "text-terminal-green" : "text-terminal-muted"}>
        {available ? "available" : "not configured"}
      </span>
      {result.provider && result.provider !== "none" && (
        <>
          <span className="text-terminal-border/50">·</span>
          <span className="text-terminal-muted">{result.provider}</span>
        </>
      )}
    </div>
  );
};
