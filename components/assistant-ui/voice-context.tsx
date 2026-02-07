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
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface VoiceProviderProps {
  children: ReactNode;
}

export const VoiceProvider: FC<VoiceProviderProps> = ({ children }) => {
  const [voice, setVoice] = useState<VoiceState>({
    isPlaying: false,
    isSynthesizing: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const playAudio = useCallback(
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
          error: "Failed to play audio",
        }));
      };

      audio.play().catch((err) => {
        console.warn("[Voice] Audio playback failed:", err);
        setVoice((prev) => ({
          ...prev,
          isPlaying: false,
          isSynthesizing: false,
          error: "Audio playback blocked by browser",
        }));
      });
    },
    []
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

  return (
    <VoiceContext.Provider
      value={{ voice, playAudio, stopAudio, setSynthesizing, clearError }}
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
