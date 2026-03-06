/**
 * Emotion Detector
 *
 * Uses a fast/cheap LLM call (utility model — haiku-class) to classify
 * the emotional state of a user message. Designed for fire-and-forget
 * usage: gracefully degrades on error, never blocks the caller.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getUtilityModel } from "@/lib/ai/providers";
import { type Emotion, type EmotionResult } from "./types";

// ── Schema ──────────────────────────────────────────────────────────────────

const EMOTION_TUPLE = [
  "neutral", "happy", "sad", "angry", "surprised",
  "thinking", "confused", "excited", "frustrated",
] as const satisfies readonly Emotion[];

const emotionResultSchema = z.object({
  emotion: z.enum(EMOTION_TUPLE).describe(
    "The primary emotion detected in the user's message"
  ),
  intensity: z
    .number()
    .min(0)
    .max(1)
    .describe("How strongly the emotion is expressed (0 = barely, 1 = very strong)"),
  mood: z
    .string()
    .max(30)
    .describe("A short mood descriptor word or phrase (e.g. calm, enthusiastic, tense)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Your confidence in this classification (0 = guessing, 1 = certain)"),
});

// ── Defaults ────────────────────────────────────────────────────────────────

const NEUTRAL_RESULT: EmotionResult = {
  emotion: "neutral",
  intensity: 0,
  mood: "calm",
  confidence: 0,
};

// ── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: EmotionResult;
  timestamp: number;
}

/** Per-conversation detection cache to avoid redundant LLM calls */
const detectionCache = new Map<string, CacheEntry>();

/** Default cache TTL: skip re-detection if called within this window */
const DEFAULT_CACHE_TTL_MS = 10_000;

/** Periodic cleanup: remove stale cache entries every 60s */
const CACHE_CLEANUP_INTERVAL_MS = 60_000;

const cacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of detectionCache) {
    if (now - entry.timestamp >= DEFAULT_CACHE_TTL_MS) {
      detectionCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS);

// Allow the process to exit without waiting for the timer
cacheCleanupTimer.unref();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect the emotion expressed in a user message.
 *
 * @param message          - The user's message text
 * @param conversationContext - Optional array of recent messages for context
 * @param options.conversationId - Conversation ID for caching (skips detection if called within cacheTtlMs)
 * @param options.cacheTtlMs     - Cache TTL in milliseconds (default 10 000)
 *
 * @returns The detected emotion result. Returns neutral with confidence 0 on any error.
 */
export async function detectEmotion(
  message: string,
  conversationContext?: string[],
  options?: { conversationId?: string; cacheTtlMs?: number }
): Promise<EmotionResult> {
  const conversationId = options?.conversationId;
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  // Check cache
  if (conversationId) {
    const cached = detectionCache.get(conversationId);
    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
      return cached.result;
    }
  }

  try {
    const contextBlock =
      conversationContext && conversationContext.length > 0
        ? `\nRecent conversation context:\n${conversationContext.map((m) => `- ${m}`).join("\n")}\n`
        : "";

    const { object } = await generateObject({
      model: getUtilityModel(),
      schema: emotionResultSchema,
      prompt: `You are an emotion classifier. Analyze the following user message and determine the emotional state.${contextBlock}
User message: "${message}"

Classify the emotion, its intensity, a short mood descriptor, and your confidence.
If the message is ambiguous or purely informational, default to "neutral".`,
      temperature: 0.2,
      maxOutputTokens: 200,
    });

    const result: EmotionResult = {
      emotion: object.emotion,
      intensity: clamp01(object.intensity),
      mood: object.mood,
      confidence: clamp01(object.confidence),
    };

    // Update cache
    if (conversationId) {
      detectionCache.set(conversationId, { result, timestamp: Date.now() });
    }

    return result;
  } catch (error) {
    console.warn(
      "[Emotion] Detection failed, returning neutral:",
      error instanceof Error ? error.message : error
    );
    return { ...NEUTRAL_RESULT };
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ── Test helpers (exported for tests only) ──────────────────────────────────

/** Clear the detection cache. Intended for tests. */
export function _clearDetectionCache(): void {
  detectionCache.clear();
}

/** Get cache size. Intended for tests. */
export function _getDetectionCacheSize(): number {
  return detectionCache.size;
}
