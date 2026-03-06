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
export type ExternalAudioStopper = () => void;

interface VoiceContextValue {
  voice: VoiceState;
  /** Play audio from a URL. Stops any currently playing audio first. */
  playAudio: (url: string) => Promise<void>;
  /** Stop the currently playing audio. */
  stopAudio: () => void;
  /** Cancel/stop all audio playback (HTML5 + external player). Used for interrupts. */
  cancelAudio: () => void;
  /** Set synthesizing state (used by tool result renderers). */
  setSynthesizing: (synthesizing: boolean) => void;
  /** Clear any error state. */
  clearError: () => void;
  /**
   * Register an external audio player (e.g. 3D avatar).
   * When registered, `playAudio` routes audio to the external player
   * instead of the built-in HTML5 Audio element.
   */
  registerExternalPlayer: (player: ExternalAudioPlayer, stopper?: ExternalAudioStopper) => void;
  /** Unregister any previously registered external player. */
  unregisterExternalPlayer: () => void;
}

type PlaybackSession = {
  resolve: () => void;
  reject: (error: Error) => void;
  settled: boolean;
};

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
  const externalStopperRef = useRef<ExternalAudioStopper | null>(null);
  const playbackSessionRef = useRef<PlaybackSession | null>(null);

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

  const settlePlayback = useCallback((error?: Error) => {
    const session = playbackSessionRef.current;
    if (!session || session.settled) return;
    session.settled = true;
    playbackSessionRef.current = null;
    if (error) {
      session.reject(error);
      return;
    }
    session.resolve();
  }, []);

  const stopCurrentPlayback = useCallback((clearAudioElement: boolean) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (clearAudioElement) {
        audioRef.current.src = "";
        audioRef.current = null;
      }
    }

    try {
      externalStopperRef.current?.();
    } catch (error) {
      console.warn("[Voice] External stop failed:", error);
    }

    settlePlayback();
  }, [settlePlayback]);

  const stopAudio = useCallback(() => {
    stopCurrentPlayback(false);
    setVoice((prev) => ({
      ...prev,
      isPlaying: false,
      currentAudioUrl: undefined,
    }));
  }, [stopCurrentPlayback]);

  const cancelAudio = useCallback(() => {
    stopCurrentPlayback(true);
    setVoice({
      isPlaying: false,
      isSynthesizing: false,
      currentAudioUrl: undefined,
      error: undefined,
    });
  }, [stopCurrentPlayback]);

  const playViaHtmlAudio = useCallback(
    (url: string) => {
      stopCurrentPlayback(true);

      const audio = new Audio(url);
      audioRef.current = audio;

      return new Promise<void>((resolve, reject) => {
        playbackSessionRef.current = {
          resolve,
          reject,
          settled: false,
        };

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
          settlePlayback();
        };

        audio.onerror = () => {
          const error = new Error(t("playFailed"));
          setVoice((prev) => ({
            ...prev,
            isPlaying: false,
            isSynthesizing: false,
            currentAudioUrl: undefined,
            error: error.message,
          }));
          settlePlayback(error);
        };

        audio.play().catch((err) => {
          console.warn("[Voice] Audio playback failed:", err);
          const error = new Error(t("playbackBlocked"));
          setVoice((prev) => ({
            ...prev,
            isPlaying: false,
            isSynthesizing: false,
            currentAudioUrl: undefined,
            error: error.message,
          }));
          settlePlayback(error);
        });
      });
    },
    [settlePlayback, stopCurrentPlayback, t],
  );

  const playAudio = useCallback(
    async (url: string) => {
      const externalPlayer = externalPlayerRef.current;
      if (!externalPlayer) {
        await playViaHtmlAudio(url);
        return;
      }

      stopCurrentPlayback(true);

      setVoice((prev) => ({
        ...prev,
        isPlaying: true,
        isSynthesizing: false,
        currentAudioUrl: url,
        error: undefined,
      }));

      try {
        await new Promise<void>((resolve, reject) => {
          playbackSessionRef.current = {
            resolve,
            reject,
            settled: false,
          };

          externalPlayer(url)
            .then(() => {
              setVoice((prev) => ({
                ...prev,
                isPlaying: false,
                currentAudioUrl: undefined,
              }));
              settlePlayback();
            })
            .catch((err) => {
              const error = err instanceof Error ? err : new Error(String(err));
              settlePlayback(error);
            });
        });
      } catch (err) {
        console.warn("[Voice] External player failed, falling back to HTML5 Audio:", err);
        await playViaHtmlAudio(url);
      }
    },
    [playViaHtmlAudio, settlePlayback, stopCurrentPlayback],
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

  const registerExternalPlayer = useCallback((player: ExternalAudioPlayer, stopper?: ExternalAudioStopper) => {
    externalPlayerRef.current = player;
    externalStopperRef.current = stopper ?? null;
  }, []);

  const unregisterExternalPlayer = useCallback(() => {
    externalPlayerRef.current = null;
    externalStopperRef.current = null;
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        voice,
        playAudio,
        stopAudio,
        cancelAudio,
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
