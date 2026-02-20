/**
 * Message History Caching for Anthropic Prompt Caching
 *
 * Applies cache_control to the last message so the entire conversation
 * (including the current user turn) is cached. The next request reads
 * everything up to that point from cache and only writes the new exchange.
 *
 * Turn-by-turn behavior:
 *   Turn N:   [sys] [m0..mN] ← cache marker   → everything written to cache
 *   Turn N+1: reads [sys..mN] from cache       → only [mN+1, mN+2] are new
 *
 * The AI SDK translates message-level providerOptions into a block-level
 * cache_control on the last content block when constructing the API request.
 * Top-level automatic caching (Anthropic API feature) is not exposed by the
 * AI SDK, so this per-message approach is the only supported mechanism.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 * @see https://ai-sdk.dev/cookbook/node/dynamic-prompt-caching
 */

import type { ModelMessage } from "ai";
import type { CacheableSystemBlock } from "./types";

/**
 * Apply cache control to the last message in the conversation history.
 *
 * Marks the final message with an ephemeral cache breakpoint so that
 * the full conversation prefix (system + all messages) is cached.
 * The API silently skips caching when the token count is below the
 * model-specific minimum, so no message-count guard is needed here.
 */
export function applyCacheToMessages(
  messages: ModelMessage[]
): ModelMessage[] {

  if (messages.length === 0) {
    return messages;
  }

  const lastIndex = messages.length - 1;

  return messages.map((msg, idx) => {
    if (idx !== lastIndex) return msg;
    // Attach cache marker to last message. The AI SDK applies this to the
    // last content block when serialising the request to Anthropic's API.
    // The `as unknown` cast is required because TypeScript cannot resolve
    // which variant of the ModelMessage discriminated union the spread
    // produces, even though providerOptions is valid on all variants.
    return {
      ...msg,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "1h" as const } },
      },
    } as unknown as ModelMessage;
  });
}

/**
 * Estimate token savings from caching.
 * Used for observability logging only — not used for billing or gating.
 *
 * Note: rough heuristic (1 token ≈ 4 characters). Actual token counts vary.
 */
export function estimateCacheSavings(
  systemBlocks: CacheableSystemBlock[],
  messages: ModelMessage[]
): {
  totalCacheableTokens: number;
  estimatedSavings: number; // in dollars
} {
  // Count all system block tokens (blocks before cache markers are covered
  // by the prefix cache even without their own cache_control).
  const systemTokens = systemBlocks.reduce(
    (sum, block) => sum + Math.ceil(block.content.length / 4),
    0
  );

  // Find the cache marker (placed on the last message by applyCacheToMessages).
  // Include the marker message itself in the cached range (off-by-one fix).
  const cacheMarkerIndex = messages.findIndex((m) => {
    const opts = m.providerOptions as { anthropic?: { cacheControl?: unknown } } | undefined;
    return opts?.anthropic?.cacheControl !== undefined;
  });
  const cachedRange = cacheMarkerIndex >= 0
    ? messages.slice(0, cacheMarkerIndex + 1)
    : [];
  const messageTokens = cachedRange.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0
  );

  const totalCacheableTokens = systemTokens + messageTokens;

  // Cache reads cost 0.1x base price ($3/MTok for Sonnet 4.5/4.6).
  // Savings per cache hit = (1.0 - 0.1) * base_price * cached_tokens
  const basePricePerToken = 3 / 1_000_000;
  const estimatedSavings = 0.9 * basePricePerToken * totalCacheableTokens;

  return { totalCacheableTokens, estimatedSavings };
}

/**
 * Estimate tokens in a message using a character-count heuristic (1 token ≈ 4 chars).
 */
function estimateMessageTokens(msg: ModelMessage): number {
  if (typeof msg.content === "string") {
    return Math.ceil(msg.content.length / 4);
  }
  const text = (msg.content as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
  return Math.ceil(text.length / 4);
}
