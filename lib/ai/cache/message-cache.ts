/**
 * Message History Caching for Anthropic Prompt Caching
 *
 * Applies cache_control to conversation history for optimal caching.
 * Strategy: Cache older stable messages, leave recent ones uncached.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

import type { ModelMessage } from "ai";
import type { CacheableSystemBlock, CacheMetrics } from "./types";

/**
 * Apply cache control to conversation history
 *
 * Anthropic checks backwards from cache breakpoint, so we cache
 * older stable messages and leave recent ones uncached.
 *
 * Strategy:
 * - Cache all messages except the last N (default: 2)
 * - Only cache if conversation has enough history (min 5 messages)
 * - Place cache_control on the last message before uncached block
 */
export function applyCacheToMessages(
  messages: ModelMessage[],
  config: {
    /** How many recent messages to leave uncached */
    uncachedRecentCount?: number;
    /** Minimum message history size to enable caching */
    minHistorySize?: number;
    /** Cache TTL (5m or 1h) */
    cacheTtl?: "5m" | "1h";
  } = {}
): ModelMessage[] {
  const {
    uncachedRecentCount = 2,
    minHistorySize = 5,
    cacheTtl = "5m",
  } = config;

  // Not enough history to benefit from caching
  if (messages.length < minHistorySize) {
    return messages;
  }

  // Split messages: cache older ones, leave recent ones fresh
  const cacheBreakpointIndex = messages.length - uncachedRecentCount;

  return messages.map((msg, idx) => {
    // Add cache_control to the last message before recent uncached block
    if (idx === cacheBreakpointIndex - 1) {
      return {
        ...msg,
        // Use experimental_cache_control for AI SDK compatibility
        experimental_cache_control: { type: "ephemeral" as const, ttl: cacheTtl },
      } as unknown as ModelMessage;
    }
    return msg;
  });
}

/**
 * Estimate token savings from caching
 * Used for observability/logging
 *
 * Note: This is a rough estimation based on character count
 * Actual token usage may vary
 */
export function estimateCacheSavings(
  systemBlocks: CacheableSystemBlock[],
  messages: ModelMessage[]
): {
  totalCacheableTokens: number;
  estimatedSavings: number; // in dollars
} {
  // Rough estimation: 1 token ≈ 4 characters
  const systemTokens = systemBlocks.reduce(
    (sum, block) => sum + Math.ceil(block.content.length / 4),
    0
  );

  const cacheMarkerIndex = messages.findIndex(
    (m) => (m as any).experimental_cache_control
  );
  const cachedRange = cacheMarkerIndex > 0
    ? messages.slice(0, cacheMarkerIndex)
    : [];
  const messageTokens = cachedRange.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0
  );

  const totalCacheableTokens = systemTokens + messageTokens;

  // Cache hits cost 0.1x base price ($3/MTok for Sonnet 4.5)
  // Savings = (1.0 - 0.1) * base_price * tokens
  const basePricePerToken = 3 / 1_000_000; // $3 per million tokens
  const estimatedSavings = 0.9 * basePricePerToken * totalCacheableTokens;

  return { totalCacheableTokens, estimatedSavings };
}

/**
 * Estimate tokens in a message
 * Uses character count heuristic (1 token ≈ 4 characters)
 */
function estimateMessageTokens(msg: ModelMessage): number {
  const content = Array.isArray(msg.content)
    ? msg.content
        .map((p) => (p.type === "text" ? p.text || "" : ""))
        .join("")
    : msg.content;

  return Math.ceil(content.length / 4);
}

/**
 * Find optimal cache breakpoint based on conversation structure
 *
 * Advanced strategy: Cache up to the last major context shift
 * Looks for tool calls, long gaps, or topic changes
 */
export function findOptimalCacheBreakpoint(
  messages: ModelMessage[]
): number {
  // Strategy: Cache up to the last major context shift
  // Look for tool calls, long gaps, or topic changes

  for (let i = messages.length - 3; i >= 0; i--) {
    const msg = messages[i];

    // If this message has tool calls, cache everything before it
    if (
      msg.role === "assistant" &&
      Array.isArray(msg.content) &&
      msg.content.some((p: any) => p.type === "tool_use" || p.type === "tool-call")
    ) {
      return i;
    }
  }

  // Fallback: cache all but last 2 messages
  return Math.max(0, messages.length - 2);
}

/**
 * Parse cache metrics from AI SDK usage response
 * AI SDK v6: Cache metrics are in providerMetadata.anthropic (camelCase)
 * Also supports legacy snake_case fields as fallback
 */
export function parseCacheMetrics(
  usage: any,
  providerMetadata?: { anthropic?: { cacheCreationInputTokens?: number; cacheReadInputTokens?: number } }
): CacheMetrics {
  const anthropicMeta = providerMetadata?.anthropic || {};
  return {
    cacheCreationTokens: anthropicMeta.cacheCreationInputTokens ||
      usage?.cache_creation_input_tokens || 0,
    cacheReadTokens: anthropicMeta.cacheReadInputTokens ||
      usage?.cache_read_input_tokens || 0,
    inputTokens: usage?.input_tokens || usage?.inputTokens || 0,
    estimatedSavings: 0, // Will be calculated separately
    systemBlocksCached: 0,
    messagesCached: 0,
  };
}
