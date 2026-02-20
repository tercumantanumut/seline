/**
 * Anthropic Prompt Caching Types
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

import type { SystemModelMessage } from "@ai-sdk/provider-utils";

/**
 * System prompt block with optional cache control.
 * Alias for AI SDK's SystemModelMessage to ensure type compatibility.
 */
export type CacheableSystemBlock = SystemModelMessage;

/**
 * Global cache configuration settings
 */
export interface CacheConfig {
  /** Enable/disable caching globally */
  enabled: boolean;

  /** Minimum tokens to cache (Anthropic requires 1024+ for most models) */
  minTokensToCache: number;
}

/**
 * Cache performance metrics from API response
 */
export interface CacheMetrics {
  /** Tokens written to cache (new cache entry creation) */
  cacheCreationTokens: number;

  /** Tokens read from cache (cache hits) */
  cacheReadTokens: number;

  /** Regular input tokens (not cached) */
  inputTokens: number;

  /** Estimated cost savings from caching */
  estimatedSavings: number;

  /** Number of system blocks cached */
  systemBlocksCached: number;

  /** Number of messages cached */
  messagesCached: number;
}
