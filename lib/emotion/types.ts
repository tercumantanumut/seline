/**
 * Emotion Detection System Types
 *
 * Type definitions for the LLM-based emotion detection system
 * that analyzes user messages for emotional state.
 */

/** Supported emotion classifications */
export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "thinking"
  | "confused"
  | "excited"
  | "frustrated";

/** All valid emotion values for runtime validation */
export const EMOTIONS: readonly Emotion[] = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "thinking",
  "confused",
  "excited",
  "frustrated",
] as const;

/** Result of a single emotion detection call */
export interface EmotionResult {
  /** Detected primary emotion */
  emotion: Emotion;
  /** Intensity of the emotion (0-1, where 0 is barely present and 1 is very strong) */
  intensity: number;
  /** Short mood descriptor (e.g. "calm", "enthusiastic", "tense") */
  mood: string;
  /** Confidence in the detection (0-1, where 1 is highly confident) */
  confidence: number;
}

/** Tracked emotion state for a conversation */
export interface EmotionContext {
  /** Most recent emotion detection result */
  current: EmotionResult;
  /** Conversation this context belongs to */
  conversationId: string;
  /** Timestamp (ms since epoch) when this context was last updated */
  updatedAt: number;
}
