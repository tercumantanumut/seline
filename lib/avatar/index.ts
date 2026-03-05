/**
 * Avatar Lipsync & Mood System
 *
 * Audio analysis engine for driving 3D avatar mouth shapes and facial
 * expressions. Provides two lipsync paths:
 *
 * - **Amplitude**: Fast, always-available analysis from raw PCM audio (~10ms)
 * - **Rhubarb**: High-quality phoneme-level analysis via external binary
 *
 * Plus a mood bridge that maps emotion detection results to avatar expressions.
 *
 * @example
 * ```typescript
 * import {
 *   analyzeAmplitude,
 *   analyzeRhubarb,
 *   isRhubarbAvailable,
 *   emotionToAvatarMood,
 * } from "@/lib/avatar";
 *
 * // Fast amplitude-based lipsync
 * const result = analyzeAmplitude(pcmBuffer);
 *
 * // Rhubarb lipsync (falls back to empty result if binary not found)
 * const rhubarbResult = await analyzeRhubarb("/tmp/speech.wav");
 *
 * // Map detected emotion to avatar expression
 * const mood = emotionToAvatarMood("happy", 0.8);
 * ```
 */

// Types
export type {
  OculusViseme,
  VisemeCue,
  LipsyncResult,
  LipsyncConfig,
  AvatarMood,
  RhubarbOutput,
  RhubarbMouthCue,
} from "./types";
export { OCULUS_VISEMES, DEFAULT_LIPSYNC_CONFIG } from "./types";

// Amplitude analysis
export { analyzeAmplitude } from "./lipsync-amplitude";

// Rhubarb analysis
export { analyzeRhubarb, isRhubarbAvailable } from "./lipsync-rhubarb";

// Mood bridge
export { emotionToAvatarMood } from "./mood-bridge";
