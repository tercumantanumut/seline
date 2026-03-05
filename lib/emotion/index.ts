/**
 * Emotion Detection System
 *
 * LLM-based emotion detection that analyzes user messages to classify
 * emotional state. Designed for fire-and-forget usage — never blocks
 * the main chat response.
 *
 * @example
 * ```typescript
 * import { detectEmotion, updateEmotionContext, getEmotionContext } from "@/lib/emotion";
 *
 * // Fire-and-forget emotion detection
 * detectEmotion(userMessage, [], { conversationId })
 *   .then((result) => updateEmotionContext(conversationId, result))
 *   .catch(() => {}); // never throw
 *
 * // Read current emotion state
 * const ctx = getEmotionContext(conversationId);
 * if (ctx) {
 *   console.log(ctx.current.emotion, ctx.current.mood);
 * }
 * ```
 */

// Types
export type { Emotion, EmotionResult, EmotionContext } from "./types";
export { EMOTIONS } from "./types";

// Detector
export { detectEmotion } from "./detector";

// Context store
export {
  updateEmotionContext,
  getEmotionContext,
  clearEmotionContext,
  cleanupStaleContexts,
  setMaxAge,
} from "./context";
