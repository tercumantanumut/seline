/**
 * Anthropic Prompt Caching Types
 *
 * Supports both 5-minute (default) and 1-hour (premium) cache durations.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

/**
 * Cache control block for Anthropic prompt caching
 * Marks content blocks to be cached with specified TTL
 */
export interface CacheControlBlock {
  type: "ephemeral";
  /** Cache duration: 5m (default, 1.25x write cost) or 1h (premium, 2x write cost) */
  ttl?: "5m" | "1h";
}

/**
 * System prompt block with optional cache control
 * Used for building cacheable system prompts
 *
 * Compatible with AI SDK's SystemModelMessage format
 */
export interface CacheableSystemBlock {
  role: "system";
  content: string;
  experimental_providerOptions?: {
    anthropic?: {
      cacheControl?: CacheControlBlock;
    };
  };
}

/**
 * Global cache configuration settings
 */
export interface CacheConfig {
  /** Enable/disable caching globally */
  enabled: boolean;

  /** Default TTL for cached blocks */
  defaultTtl: "5m" | "1h";

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
