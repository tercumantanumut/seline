/**
 * Avatar Lipsync System Types
 *
 * Type definitions for the lipsync analysis engine that processes
 * audio into viseme cues for driving 3D avatar mouth shapes.
 * Uses the Oculus-compatible viseme set for TalkingHead.js consumption.
 */

// ── Visemes ──────────────────────────────────────────────────────────────────

/** Oculus-compatible viseme set (15 shapes) */
export type OculusViseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

/** All valid Oculus viseme values for runtime validation */
export const OCULUS_VISEMES: readonly OculusViseme[] = [
  "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS",
  "nn", "RR", "aa", "E", "I", "O", "U",
] as const;

// ── Cues & Results ───────────────────────────────────────────────────────────

/** A single viseme cue — one mouth shape at a point in time */
export interface VisemeCue {
  /** Milliseconds from audio start */
  time: number;
  /** Which viseme shape to display */
  viseme: OculusViseme;
  /** Duration this viseme is held, in milliseconds */
  duration: number;
  /** Intensity / blend weight (0–1) */
  weight: number;
}

/** Result of lipsync analysis on an audio buffer */
export interface LipsyncResult {
  /** Ordered array of viseme cues */
  visemes: VisemeCue[];
  /** Total audio duration in milliseconds */
  duration: number;
  /** Which analysis method produced these results */
  method: "amplitude" | "rhubarb";
}

// ── Configuration ────────────────────────────────────────────────────────────

/** Configuration for lipsync analysis */
export interface LipsyncConfig {
  /** Analysis method to use */
  method: "amplitude" | "rhubarb";
  /** Window size for amplitude analysis, in milliseconds (default 60) */
  windowSize: number;
  /** LERP transition duration between viseme shapes, in milliseconds (default 80) */
  lerpDuration: number;
  /** RMS threshold below which audio is treated as silence (default 0.01) */
  silenceThreshold: number;
}

/** Default lipsync configuration values */
export const DEFAULT_LIPSYNC_CONFIG: LipsyncConfig = {
  method: "amplitude",
  windowSize: 60,
  lerpDuration: 80,
  silenceThreshold: 0.01,
};

// ── Avatar Mood ──────────────────────────────────────────────────────────────

/** Mood state for driving avatar facial expressions */
export interface AvatarMood {
  /** Source emotion name (from emotion detection) */
  emotion: string;
  /** Target expression name for TalkingHead.js */
  expression: string;
  /** Expression intensity (0–1) */
  intensity: number;
}

// ── Rhubarb ──────────────────────────────────────────────────────────────────

/** Shape of Rhubarb's JSON output */
export interface RhubarbOutput {
  mouthCues: RhubarbMouthCue[];
}

/** A single cue from Rhubarb's JSON output */
export interface RhubarbMouthCue {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Rhubarb shape letter (A–H, X for silence) */
  value: string;
}
