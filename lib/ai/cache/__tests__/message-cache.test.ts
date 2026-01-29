/**
 * Tests for message caching utilities
 */

import { describe, it, expect } from "vitest";
import { applyCacheToMessages, estimateCacheSavings } from "../message-cache";
import type { ModelMessage } from "ai";
import type { CacheableSystemBlock } from "../types";

describe("applyCacheToMessages", () => {
  it("should not cache when history is too short", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const result = applyCacheToMessages(messages, { minHistorySize: 5 });

    // No messages should have cache_control
    expect(result.every((m) => !(m as any).experimental_cache_control)).toBe(true);
  });

  it("should cache older messages and leave recent ones uncached", () => {
    const messages: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${i}`,
    }));

    const result = applyCacheToMessages(messages, {
      uncachedRecentCount: 2,
      minHistorySize: 5,
    });

    // Message at index 7 (10 - 2 - 1) should have cache_control
    expect((result[7] as any).experimental_cache_control).toBeDefined();
    expect((result[7] as any).experimental_cache_control.type).toBe("ephemeral");

    // Last 2 messages should not have cache_control
    expect((result[8] as any).experimental_cache_control).toBeUndefined();
    expect((result[9] as any).experimental_cache_control).toBeUndefined();
  });

  it("should use correct TTL", () => {
    const messages: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${i}`,
    }));

    const result = applyCacheToMessages(messages, {
      uncachedRecentCount: 2,
      minHistorySize: 5,
      cacheTtl: "1h",
    });

    // Message at index 7 should have 1h TTL
    expect((result[7] as any).experimental_cache_control?.ttl).toBe("1h");
  });

  it("should return original messages when caching disabled", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "How are you?" },
    ];

    const result = applyCacheToMessages(messages, {
      minHistorySize: 10, // High threshold to disable caching
    });

    expect(result).toEqual(messages);
  });
});

describe("estimateCacheSavings", () => {
  it("should calculate savings for system blocks", () => {
    const systemBlocks: CacheableSystemBlock[] = [
      {
        role: "system",
        content: "You are a helpful assistant. " + "x".repeat(1000),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } },
        },
      },
    ];

    const messages: ModelMessage[] = [];

    const result = estimateCacheSavings(systemBlocks, messages);

    expect(result.totalCacheableTokens).toBeGreaterThan(0);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  });

  it("should calculate savings for cached messages", () => {
    const systemBlocks: CacheableSystemBlock[] = [];

    const messages: ModelMessage[] = [
      { role: "user", content: "Hello " + "x".repeat(1000) },
      {
        role: "assistant",
        content: "Hi " + "x".repeat(1000),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "5m" as const } },
        },
      } as unknown as ModelMessage,
    ];

    const result = estimateCacheSavings(systemBlocks, messages);

    expect(result.totalCacheableTokens).toBeGreaterThan(0);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  });

  it("should return zero savings when no cacheable content", () => {
    const systemBlocks: CacheableSystemBlock[] = [];
    const messages: ModelMessage[] = [];

    const result = estimateCacheSavings(systemBlocks, messages);

    expect(result.totalCacheableTokens).toBe(0);
    expect(result.estimatedSavings).toBe(0);
  });

  it("should estimate reasonable token counts", () => {
    // 1000 characters ≈ 250 tokens (1 token ≈ 4 chars)
    const systemBlocks: CacheableSystemBlock[] = [
      {
        role: "system",
        content: "x".repeat(1000),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } },
        },
      },
    ];

    const result = estimateCacheSavings(systemBlocks, []);

    // Should be approximately 250 tokens (1000 / 4)
    expect(result.totalCacheableTokens).toBeGreaterThanOrEqual(200);
    expect(result.totalCacheableTokens).toBeLessThanOrEqual(300);
  });
});
