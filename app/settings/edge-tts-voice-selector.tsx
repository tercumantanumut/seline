"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, Volume2, Loader2, Square } from "lucide-react";
import {
  EDGE_TTS_VOICES,
  getEdgeTTSVoicesGrouped,
  findEdgeTTSVoice,
} from "@/lib/tts/edge-tts-voices";
import {
  SettingsField,
} from "@/components/settings/settings-form-layout";

interface EdgeTTSVoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
}

export function EdgeTTSVoiceSelector({ value, onChange }: EdgeTTSVoiceSelectorProps) {
  const t = useTranslations("settings");
  const [search, setSearch] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const grouped = useMemo(() => getEdgeTTSVoicesGrouped(), []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;

    const q = search.toLowerCase();
    const result = new Map<string, typeof EDGE_TTS_VOICES>();

    for (const [lang, voices] of grouped) {
      const matches = voices.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.language.toLowerCase().includes(q) ||
          v.locale.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q),
      );
      if (matches.length > 0) result.set(lang, matches);
    }
    return result;
  }, [grouped, search]);

  const currentVoice = findEdgeTTSVoice(value);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPreviewing(false);
  }, []);

  const playPreview = useCallback(async () => {
    // If already playing, stop
    if (previewing) {
      stopPreview();
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch(`/api/tts/preview?voice=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error("Preview failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stopPreview;
      audio.onerror = stopPreview;
      await audio.play();
    } catch {
      stopPreview();
    }
  }, [value, previewing, stopPreview]);

  return (
    <SettingsField
      label={t("voice.tts.edgeVoiceLabel")}
      htmlFor="edgeTtsVoice"
      helperText={t("voice.tts.edgeVoiceHelper")}
    >
      {/* Search input */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-terminal-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("voice.tts.edgeVoiceSearch")}
          className="w-full rounded-lg border border-terminal-border bg-terminal-cream/50 dark:bg-terminal-cream-dark/30 pl-9 pr-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        />
      </div>

      {/* Current selection display with preview button */}
      {currentVoice && (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 rounded-lg bg-terminal-green/10 border border-terminal-green/20 font-mono text-xs text-terminal-dark">
            <span className="font-semibold">{currentVoice.name}</span>
            <span className="text-terminal-muted"> — {currentVoice.language} · {currentVoice.gender}</span>
          </div>
          <button
            type="button"
            onClick={playPreview}
            disabled={previewing && !audioRef.current}
            className="shrink-0 w-8 h-8 rounded-lg border border-terminal-border bg-terminal-cream/50 dark:bg-terminal-cream-dark/30 flex items-center justify-center hover:bg-terminal-green/10 hover:border-terminal-green/30 transition-colors disabled:opacity-50"
            title={t("voice.tts.edgeVoicePreview")}
          >
            {previewing ? (
              audioRef.current ? (
                <Square className="w-3.5 h-3.5 text-terminal-amber fill-terminal-amber" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-terminal-muted animate-spin" />
              )
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-terminal-green" />
            )}
          </button>
        </div>
      )}

      {/* Grouped select */}
      <select
        id="edgeTtsVoice"
        value={value}
        onChange={(e) => { stopPreview(); onChange(e.target.value); }}
        aria-describedby="edgeTtsVoice-help"
        className="w-full rounded-lg border border-terminal-border bg-terminal-cream/50 dark:bg-terminal-cream-dark/30 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
      >
        {[...filteredGroups.entries()].map(([lang, voices]) => (
          <optgroup key={lang} label={lang}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.gender})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </SettingsField>
  );
}
