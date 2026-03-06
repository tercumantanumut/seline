/**
 * Mood Bridge
 *
 * Maps emotion detection results (from `lib/emotion/`) to avatar-compatible
 * mood states for driving TalkingHead.js facial expressions.
 *
 * Pure mapping layer with no side effects or external dependencies.
 */

import type { AvatarMood } from "./types";

// ── Emotion → Expression Mapping ─────────────────────────────────────────────

/**
 * Maps emotion names (from the emotion detection system) to
 * TalkingHead.js-compatible expression names.
 */
const EMOTION_TO_EXPRESSION: Record<string, string> = {
  happy: "smile",
  sad: "sadness",
  angry: "anger",
  surprised: "surprise",
  thinking: "thoughtful",
  confused: "puzzled",
  excited: "smile",
  frustrated: "anger",
  neutral: "neutral",
};

/** Default expression when emotion is unknown or unmapped */
const DEFAULT_EXPRESSION = "neutral";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert an emotion detection result to an avatar mood state.
 *
 * @param emotion   - Emotion name from the detection system (e.g. "happy", "sad")
 * @param intensity - Emotion intensity (0–1), passed through to the avatar mood
 * @returns AvatarMood with expression name and intensity for TalkingHead.js
 */
export function emotionToAvatarMood(
  emotion: string,
  intensity: number,
): AvatarMood {
  const normalizedEmotion = (emotion ?? "").trim().toLowerCase();
  const expression =
    EMOTION_TO_EXPRESSION[normalizedEmotion] ?? DEFAULT_EXPRESSION;

  // Clamp intensity to [0, 1] and handle NaN
  const clampedIntensity = clampIntensity(intensity);

  return {
    emotion: normalizedEmotion || "neutral",
    expression,
    intensity: clampedIntensity,
  };
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Clamp a value to [0, 1], defaulting NaN/undefined to 0.
 */
function clampIntensity(value: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
