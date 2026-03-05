// =============================================================================
// Avatar 3D — Type definitions
// =============================================================================

// Re-export backend types to avoid duplication
export type { VisemeCue, OculusViseme, AvatarMood } from "@/lib/avatar/types";

// Import for local use within this file
import type { VisemeCue } from "@/lib/avatar/types";

/**
 * Configuration for the 3D avatar renderer.
 */
export interface Avatar3DConfig {
  /** URL to a VRM or GLB model file */
  modelUrl?: string;
  /** Canvas background color (CSS color string) */
  backgroundColor?: string;
  /** Camera distance from the avatar model. Default: 1.5 */
  cameraDistance?: number;
  /** Camera height relative to the avatar. Default: 1.6 */
  cameraHeight?: number;
  /** Whether the 3D avatar is enabled */
  enabled: boolean;
  /** Lipsync language code for TalkingHead.js. Default: "en" */
  lipsyncLang?: string;
}

/**
 * Public API exposed by the Avatar3D component via ref.
 */
export interface Avatar3DRef {
  /** Feed an audio buffer (and optional viseme cues) to drive lip-sync */
  speak: (audioBuffer: ArrayBuffer, visemes?: VisemeCue[]) => Promise<void>;
  /** Immediately stop any ongoing speech animation */
  stopSpeaking: () => void;
  /** Set the avatar's mood (e.g. "happy", "sad", "neutral") */
  setMood: (mood: string, intensity?: number) => void;
  /** Set a specific facial expression blend shape */
  setExpression: (expression: string, weight?: number) => void;
  /** Whether the TalkingHead instance has initialized successfully */
  isReady: boolean;
  /** Whether the avatar is currently performing lip-sync */
  isSpeaking: boolean;
}

// =============================================================================
// TalkingHead.js external API shape
// =============================================================================

/**
 * Viseme data structure expected by TalkingHead.speakAudio().
 */
export interface TalkingHeadAudioPayload {
  audio: AudioBuffer;
  words: string[];
  wtimes: number[];
  wdurations: number[];
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
}

/**
 * Options passed to TalkingHead.speakAudio().
 */
export interface TalkingHeadSpeakOptions {
  lipsyncLang?: string;
}

/**
 * Options for TalkingHead constructor.
 */
export interface TalkingHeadConstructorOptions {
  lipsyncModules?: string[];
  modelFPS?: number;
  cameraView?: string;
  cameraDistance?: number;
  cameraTarget?: [number, number, number];
}

/**
 * Options for TalkingHead.showAvatar().
 */
export interface TalkingHeadShowAvatarOptions {
  url: string;
  body?: string;
  avatarMood?: string;
  lipsyncLang?: string;
}

/**
 * Shape of the TalkingHead.js class API.
 * This is dynamically loaded at runtime (not an npm import).
 */
export interface TalkingHeadInstance {
  /** Start lip-sync playback with audio + viseme data */
  speakAudio: (
    payload: TalkingHeadAudioPayload,
    options?: TalkingHeadSpeakOptions,
  ) => void;
  /** Stop any ongoing speech animation */
  stopSpeaking: () => void;
  /** Set the avatar mood (affects idle animation style) */
  setMood: (mood: string) => void;
  /** Load and display an avatar model */
  showAvatar: (options: TalkingHeadShowAvatarOptions) => Promise<void>;
  /** Hide and unload the current avatar */
  hideAvatar: () => void;
  /** The internal AudioContext used for audio decoding */
  audioCtx: AudioContext;
}

/**
 * The TalkingHead class constructor shape exposed by the library module.
 */
export interface TalkingHeadConstructor {
  new (
    container: HTMLDivElement,
    options?: TalkingHeadConstructorOptions,
  ): TalkingHeadInstance;
}

/**
 * Module shape returned by dynamic import of TalkingHead.js.
 */
export interface TalkingHeadModule {
  TalkingHead: TalkingHeadConstructor;
}

// =============================================================================
// Component loading states
// =============================================================================

/** Lifecycle states for the avatar system */
export type AvatarLoadState = "loading" | "ready" | "error" | "disabled";
