"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type FC,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceState {
  isPlaying: boolean;
  isSynthesizing: boolean;
  currentAudioUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * External audio player handler.
 * Returns a Promise that resolves when playback finishes (or rejects on error).
 * If the handler throws, VoiceProvider falls back to HTML5 Audio.
 */
export type ExternalAudioPlayer = (url: string) => Promise<void>;

interface VoiceContextValue {
  voice: VoiceState;
  /** Play audio from a URL. Stops any currently playing audio first. */
  playAudio: (url: string) => void;
  /** Stop the currently playing audio. */
  stopAudio: () => void;
  /** Set synthesizing state (used by tool result renderers). */
  setSynthesizing: (synthesizing: boolean) => void;
  /** Clear any error state. */
  clearError: () => void;
  /**
   * Register an external audio player (e.g. 3D avatar).
   * When registered, `playAudio` routes audio to the external player
   * instead of the built-in HTML5 Audio element.
   */
  registerExternalPlayer: (player: ExternalAudioPlayer) => void;
  /** Unregister any previously registered external player. */
  unregisterExternalPlayer: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface VoiceProviderProps {
  children: ReactNode;
}

export const VoiceProvider: FC<VoiceProviderProps> = ({ children }) => {
  const t = useTranslations("assistantUi.voiceTool");
  const [voice, setVoice] = useState<VoiceState>({
    isPlaying: false,
    isSynthesizing: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const externalPlayerRef = useRef<ExternalAudioPlayer | null>(null);

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setVoice((prev) => ({
      ...prev,
      isPlaying: false,
      currentAudioUrl: undefined,
    }));
  }, []);

  const playViaHtmlAudio = useCallback(
    (url: string) => {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        setVoice((prev) => ({
          ...prev,
          isPlaying: true,
          isSynthesizing: false,
          currentAudioUrl: url,
          error: undefined,
        }));
      };

      audio.onended = () => {
        setVoice((prev) => ({
          ...prev,
          isPlaying: false,
          currentAudioUrl: undefined,
        }));
      };

      audio.onerror = () => {
        setVoice((prev) => ({
          ...prev,
          isPlaying: false,
          isSynthesizing: false,
          currentAudioUrl: undefined,
          error: t("playFailed"),
        }));
      };

      audio.play().catch((err) => {
        console.warn("[Voice] Audio playback failed:", err);
        setVoice((prev) => ({
          ...prev,
          isPlaying: false,
          isSynthesizing: false,
          error: t("playbackBlocked"),
        }));
      });
    },
    [],
  );

  const playAudio = useCallback(
    (url: string) => {
      const externalPlayer = externalPlayerRef.current;
      if (!externalPlayer) {
        playViaHtmlAudio(url);
        return;
      }

      // Route to external player (e.g. 3D avatar)
      // Stop any HTML5 audio first
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      setVoice((prev) => ({
        ...prev,
        isPlaying: true,
        isSynthesizing: false,
        currentAudioUrl: url,
        error: undefined,
      }));

      externalPlayer(url)
        .then(() => {
          setVoice((prev) => ({
            ...prev,
            isPlaying: false,
            currentAudioUrl: undefined,
          }));
        })
        .catch((err) => {
          console.warn("[Voice] External player failed, falling back to HTML5 Audio:", err);
          // Fall back to HTML5 Audio
          playViaHtmlAudio(url);
        });
    },
    [playViaHtmlAudio],
  );

  const setSynthesizing = useCallback((synthesizing: boolean) => {
    setVoice((prev) => ({
      ...prev,
      isSynthesizing: synthesizing,
      error: synthesizing ? undefined : prev.error,
    }));
  }, []);

  const clearError = useCallback(() => {
    setVoice((prev) => ({ ...prev, error: undefined }));
  }, []);

  const registerExternalPlayer = useCallback((player: ExternalAudioPlayer) => {
    externalPlayerRef.current = player;
  }, []);

  const unregisterExternalPlayer = useCallback(() => {
    externalPlayerRef.current = null;
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        voice,
        playAudio,
        stopAudio,
        setSynthesizing,
        clearError,
        registerExternalPlayer,
        unregisterExternalPlayer,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Use inside a VoiceProvider. Throws if provider is missing. */
export function useVoiceContext(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoiceContext must be used within a <VoiceProvider>");
  }
  return ctx;
}

/** Safe variant — returns null when no provider is present. */
export function useOptionalVoice(): VoiceContextValue | null {
  return useContext(VoiceContext);
}
