/**
 * Tests for message caching utilities
 */

import { describe, it, expect } from "vitest";
import { applyCacheToMessages, estimateCacheSavings } from "../message-cache";
import type { ModelMessage } from "ai";
import type { CacheableSystemBlock } from "../types";

function getCacheControl(msg: ModelMessage) {
  const opts = msg.providerOptions as { anthropic?: { cacheControl?: { type: string; ttl?: string } } } | undefined;
  return opts?.anthropic?.cacheControl;
}

describe("applyCacheToMessages", () => {
  it("should return original messages when the array is empty", () => {
    const result = applyCacheToMessages([]);
    expect(result).toEqual([]);
  });

  it("should cache the last message in a single-message conversation", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = applyCacheToMessages(messages);

    expect(getCacheControl(result[0])).toBeDefined();
    expect(getCacheControl(result[0])?.type).toBe("ephemeral");
  });

  it("should put the cache marker on the last message only", () => {
    const messages: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${i}`,
    }));

    const result = applyCacheToMessages(messages);

    // Only the last message should have cache control
    expect(getCacheControl(result[9])).toBeDefined();
    expect(getCacheControl(result[9])?.type).toBe("ephemeral");

    // All other messages should be untouched
    for (let i = 0; i < 9; i++) {
      expect(getCacheControl(result[i])).toBeUndefined();
    }
  });

  it("should not mutate the original messages array", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];

    applyCacheToMessages(messages);

    expect(getCacheControl(messages[1])).toBeUndefined();
  });

  it("should use 1h TTL", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = applyCacheToMessages(messages);

    expect(getCacheControl(result[0])?.ttl).toBe("1h");
  });
});

describe("estimateCacheSavings", () => {
  it("should calculate savings for system blocks", () => {
    const systemBlocks: CacheableSystemBlock[] = [
      {
        role: "system",
        content: "You are a helpful assistant. " + "x".repeat(1000),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
        },
      },
    ];

    const result = estimateCacheSavings(systemBlocks, []);

    expect(result.totalCacheableTokens).toBeGreaterThan(0);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  });

  it("should include the marker message itself in the cached range", () => {
    const systemBlocks: CacheableSystemBlock[] = [];

    // With the new strategy the marker is on the last message.
    // estimateCacheSavings should count that message's tokens too.
    const markedMessage = {
      role: "user" as const,
      content: "x".repeat(1000),
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "1h" as const } },
      },
    } as unknown as ModelMessage;

    const messages: ModelMessage[] = [
      { role: "user", content: "x".repeat(1000) },
      markedMessage,
    ];

    const result = estimateCacheSavings(systemBlocks, messages);

    // Both messages should be counted (marker message included via off-by-one fix)
    const expectedTokens = Math.ceil((1000 + 1000) / 4);
    expect(result.totalCacheableTokens).toBeCloseTo(expectedTokens, -1);
    expect(result.estimatedSavings).toBeGreaterThan(0);
  });

  it("should return zero savings when no cacheable content", () => {
    const result = estimateCacheSavings([], []);

    expect(result.totalCacheableTokens).toBe(0);
    expect(result.estimatedSavings).toBe(0);
  });

  it("should estimate reasonable token counts for system blocks", () => {
    // 1000 characters ≈ 250 tokens (1 token ≈ 4 chars)
    const systemBlocks: CacheableSystemBlock[] = [
      {
        role: "system",
        content: "x".repeat(1000),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
        },
      },
    ];

    const result = estimateCacheSavings(systemBlocks, []);

    expect(result.totalCacheableTokens).toBeGreaterThanOrEqual(200);
    expect(result.totalCacheableTokens).toBeLessThanOrEqual(300);
  });
});
