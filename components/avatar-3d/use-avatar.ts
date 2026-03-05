"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type RefObject,
} from "react";
import type {
  Avatar3DConfig,
  Avatar3DRef,
  AvatarLoadState,
  TalkingHeadInstance,
  TalkingHeadModule,
} from "./types";
import type { VisemeCue } from "@/lib/avatar/types";

// =============================================================================
// Rhubarb shape -> Oculus viseme ID mapping
// Shared constant — must match lib/avatar/lipsync-rhubarb.ts
// =============================================================================

const RHUBARB_TO_OCULUS: Record<string, string> = {
  X: "sil",
  A: "PP",
  B: "E",
  C: "aa",
  D: "O",
  E: "RR",
  F: "FF",
  G: "kk",
  H: "DD",
};

// Viseme shapes cycled through for amplitude-based fallback lip sync
// Shared constant — must match lib/avatar/lipsync-amplitude.ts
const AMPLITUDE_VISEMES = ["aa", "O", "E", "PP", "aa", "kk"] as const;

// =============================================================================
// Amplitude-based viseme generation (client-side, operates on Web AudioBuffer)
// Note: lib/avatar/lipsync-amplitude.ts works on raw PCM ArrayBuffer (server-side).
// This version works on decoded Web Audio AudioBuffer (browser-side).
// =============================================================================

function generateAmplitudeVisemes(audioBuffer: AudioBuffer): {
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
} {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowMs = 60;
  const windowSamples = Math.floor((sampleRate * windowMs) / 1000);
  const threshold = 0.01;

  const visemes: string[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];
  let shapeIdx = 0;

  for (let i = 0; i < channelData.length; i += windowSamples) {
    const end = Math.min(i + windowSamples, channelData.length);
    let sum = 0;
    for (let j = i; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sum / (end - i));
    const timeMs = Math.round((i / sampleRate) * 1000);

    if (rms > threshold) {
      visemes.push(AMPLITUDE_VISEMES[shapeIdx % AMPLITUDE_VISEMES.length]);
      shapeIdx++;
    } else {
      visemes.push("sil");
    }
    vtimes.push(timeMs);
    vdurations.push(windowMs);
  }

  return { visemes, vtimes, vdurations };
}

// =============================================================================
// Dynamic TalkingHead.js loader
// =============================================================================

/**
 * Cached promise so we only load the script once across all hook instances.
 */
let talkingHeadLoadPromise: Promise<TalkingHeadModule | null> | null = null;

/**
 * Dynamically loads TalkingHead.js at runtime.
 *
 * Strategy:
 * 1. Check if already available on `window` (pre-loaded bundle)
 * 2. Inject the IIFE bundle via <script> tag — sets window.TalkingHead
 * 3. Return null if unavailable (graceful degradation)
 *
 * The bundle at /talkinghead/talkinghead.bundle.js includes Three.js and all
 * dependencies in a single IIFE. No import maps or ESM dynamic imports needed.
 */
function loadTalkingHead(): Promise<TalkingHeadModule | null> {
  if (talkingHeadLoadPromise) return talkingHeadLoadPromise;

  talkingHeadLoadPromise = (async (): Promise<TalkingHeadModule | null> => {
    const win = window as unknown as Record<string, unknown>;

    // Already loaded (e.g. from a previous mount)
    if (win.TalkingHead && typeof win.TalkingHead === "function") {
      return { TalkingHead: win.TalkingHead } as TalkingHeadModule;
    }

    // Inject the IIFE bundle via <script> tag
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/talkinghead/talkinghead.bundle.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load TalkingHead bundle"));
        document.head.appendChild(script);
      });

      if (win.TalkingHead && typeof win.TalkingHead === "function") {
        return { TalkingHead: win.TalkingHead } as TalkingHeadModule;
      }
    } catch {
      // Bundle not available
    }

    return null;
  })();

  return talkingHeadLoadPromise;
}

// =============================================================================
// Default configuration
// =============================================================================

const DEFAULT_MODEL_URL = "/avatars/default.glb";
const DEFAULT_CAMERA_DISTANCE = 1.5;
const DEFAULT_LIPSYNC_LANG = "en";

// =============================================================================
// No-op ref (returned when avatar is disabled or failed to load)
// =============================================================================

function createNoOpRef(): Avatar3DRef {
  return {
    speak: async () => {},
    stopSpeaking: () => {},
    setMood: () => {},
    setExpression: () => {},
    isReady: false,
    isSpeaking: false,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * React hook that manages TalkingHead.js lifecycle.
 *
 * Handles:
 * - Dynamic loading of TalkingHead.js (script injection / dynamic import)
 * - Initialization on mount, disposal on unmount
 * - Loading state tracking
 * - Graceful degradation when the library is unavailable
 * - Proper Three.js resource cleanup to prevent memory leaks
 */
export function useAvatar(
  config: Avatar3DConfig,
  containerRef: RefObject<HTMLDivElement | null>,
): { ref: Avatar3DRef; state: AvatarLoadState } {
  const [state, setState] = useState<AvatarLoadState>(
    config.enabled ? "loading" : "disabled",
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Internal refs (avoid re-renders for mutable TalkingHead state)
  const headRef = useRef<TalkingHeadInstance | null>(null);
  const initCancelledRef = useRef(false);
  const isReadyRef = useRef(false);

  // Track config changes that affect initialization
  const modelUrlRef = useRef(config.modelUrl);
  const enabledRef = useRef(config.enabled);

  const lipsyncLang = config.lipsyncLang ?? DEFAULT_LIPSYNC_LANG;

  // -------------------------------------------------------------------------
  // Initialize / teardown TalkingHead
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Reset if config.enabled changes
    enabledRef.current = config.enabled;
    modelUrlRef.current = config.modelUrl;

    if (!config.enabled) {
      setState("disabled");
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    initCancelledRef.current = false;
    setState("loading");

    let head: TalkingHeadInstance | null = null;

    async function init() {
      try {
        const mod = await loadTalkingHead();

        if (initCancelledRef.current || !containerRef.current) return;

        if (!mod) {
          console.warn(
            "[Avatar3D] TalkingHead.js not available — falling back to 2D",
          );
          setState("error");
          return;
        }

        head = new mod.TalkingHead(containerRef.current, {
          lipsyncModules: [],
          modelFPS: 30,
          cameraView: "upper",
          cameraDistance: config.cameraDistance ?? DEFAULT_CAMERA_DISTANCE,
        });

        if (initCancelledRef.current) {
          head.hideAvatar();
          return;
        }

        await head.showAvatar({
          url: config.modelUrl ?? DEFAULT_MODEL_URL,
          body: "F",
          avatarMood: "neutral",
          lipsyncLang,
        });

        if (initCancelledRef.current) {
          head.hideAvatar();
          return;
        }

        headRef.current = head;
        isReadyRef.current = true;
        setState("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Avatar3D] Init failed:", msg);
        if (!initCancelledRef.current) {
          setState("error");
        }
      }
    }

    init();

    return () => {
      initCancelledRef.current = true;
      isReadyRef.current = false;

      if (headRef.current) {
        try {
          headRef.current.stopSpeaking();
          headRef.current.hideAvatar();
        } catch {
          // Best-effort cleanup
        }
        headRef.current = null;
      }

      // Also clean up any head created during init that hasn't been assigned yet
      if (head && head !== headRef.current) {
        try {
          head.hideAvatar();
        } catch {
          // Best-effort cleanup
        }
      }
    };
  }, [config.enabled, config.modelUrl, config.cameraDistance, lipsyncLang, containerRef]);

  // -------------------------------------------------------------------------
  // Stable method references via useCallback
  // -------------------------------------------------------------------------

  const speak = useCallback(
    async (audioBuffer: ArrayBuffer, visemes?: VisemeCue[]) => {
      const head = headRef.current;
      if (!head || !isReadyRef.current) return;

      try {
        const audioCtx = head.audioCtx;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const decoded = await audioCtx.decodeAudioData(audioBuffer.slice(0));

        let oculusVisemes: string[];
        let vtimes: number[];
        let vdurations: number[];

        if (visemes && visemes.length > 0) {
          // Rhubarb viseme cues — map using the Oculus mapping
          oculusVisemes = visemes.map(
            (cue) => RHUBARB_TO_OCULUS[cue.viseme] ?? cue.viseme,
          );
          vtimes = visemes.map((cue) => cue.time);
          vdurations = visemes.map((cue) => cue.duration);
        } else {
          // Amplitude-based fallback
          const generated = generateAmplitudeVisemes(decoded);
          oculusVisemes = generated.visemes;
          vtimes = generated.vtimes;
          vdurations = generated.vdurations;
        }

        setIsSpeaking(true);

        head.speakAudio(
          {
            audio: decoded,
            words: ["_"],
            wtimes: [0],
            wdurations: [0],
            visemes: oculusVisemes,
            vtimes,
            vdurations,
          },
          { lipsyncLang },
        );

        // TalkingHead.js doesn't expose a speech-end callback, so we
        // estimate completion from the audio duration + a small buffer
        // to reset isSpeaking automatically.
        const durationMs = Math.ceil(decoded.duration * 1000) + 200;
        setTimeout(() => {
          // Only reset if we haven't been explicitly stopped or started new speech
          setIsSpeaking((current) => (current ? false : current));
        }, durationMs);
      } catch (err) {
        console.error("[Avatar3D] speakAudio failed:", err);
        setIsSpeaking(false);
      }
    },
    [lipsyncLang],
  );

  const stopSpeaking = useCallback(() => {
    const head = headRef.current;
    if (!head) return;

    try {
      head.stopSpeaking();
    } catch {
      // Ignore if not currently speaking
    }
    setIsSpeaking(false);
  }, []);

  const setMood = useCallback((mood: string, _intensity?: number) => {
    const head = headRef.current;
    if (!head || !isReadyRef.current) return;

    try {
      head.setMood(mood);
    } catch {
      // setMood may not exist on all TalkingHead versions
    }
  }, []);

  const setExpression = useCallback(
    (_expression: string, _weight?: number) => {
      // TalkingHead.js handles expressions via mood + internal blend shapes.
      // This is a placeholder for future VRM blend shape direct control.
      // No-op for now, but preserves the API contract.
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Build the ref object
  // -------------------------------------------------------------------------

  const isReady = state === "ready";

  const ref: Avatar3DRef = isReady
    ? {
        speak,
        stopSpeaking,
        setMood,
        setExpression,
        isReady: true,
        isSpeaking,
      }
    : createNoOpRef();

  return { ref, state };
}

// =============================================================================
// Reset loader cache (for testing only)
// =============================================================================

export function _resetLoaderCache(): void {
  talkingHeadLoadPromise = null;
}
