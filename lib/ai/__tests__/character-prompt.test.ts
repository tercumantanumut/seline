/**
 * Tests for character prompt caching
 */

import { describe, it, expect, vi } from "vitest";
import { buildCacheableCharacterPrompt } from "../character-prompt";
import type { CharacterFull } from "@/lib/db/schema";

// Mock the agent memory module
vi.mock("@/lib/agent-memory", () => ({
  formatMemoriesForPrompt: () => ({
    markdown: "## Agent Memory\n\nSome memories here",
    tokenEstimate: 50,
    memoryCount: 3,
  }),
}));

describe("buildCacheableCharacterPrompt", () => {
  const mockCharacter: CharacterFull = {
    id: "char-123",
    name: "TestBot",
    displayName: "TB",
    tagline: "A helpful test assistant",
    metadata: { purpose: "Testing prompt caching" },
    images: [
      {
        id: "img-1",
        url: "https://example.com/avatar.png",
        isPrimary: true,
        imageType: "avatar",
        characterId: "char-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        localPath: "",
        size: 0,
        mimeType: "",
        uploadedAt: "",
        metadata: {},
        altText: "",
        sortOrder: 0,
      },
    ],
    userId: "user-123",
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("should return cacheable blocks when caching enabled", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
      cacheTtl: "5m",
      toolLoadingMode: "deferred",
    });

    // Should have multiple blocks: temporal, identity, memories, guidelines
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    // First block (temporal) should NOT be cached
    expect(blocks[0].role).toBe("system");
    expect(blocks[0].experimental_providerOptions).toBeUndefined();

    // Identity block should be cached
    expect(blocks[1].role).toBe("system");
    expect(blocks[1].experimental_providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
      ttl: "5m",
    });

    // Memories block should be cached
    expect(blocks[2].role).toBe("system");
    expect(blocks[2].experimental_providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
      ttl: "5m",
    });

    // Guidelines block should be cached
    expect(blocks[3].role).toBe("system");
    expect(blocks[3].experimental_providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
      ttl: "5m",
    });
  });

  it("should not add cache_control when caching disabled", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: false,
    });

    // No blocks should have experimental_providerOptions
    expect(blocks.every((b) => !b.experimental_providerOptions)).toBe(true);
  });

  it("should use correct TTL (1h)", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
      cacheTtl: "1h",
    });

    // Cached blocks should have 1h TTL
    const cachedBlocks = blocks.filter((b) => b.experimental_providerOptions?.anthropic?.cacheControl);
    expect(cachedBlocks.length).toBeGreaterThan(0);
    cachedBlocks.forEach((block) => {
      expect(block.experimental_providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
    });
  });

  it("should include character identity in blocks", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
    });

    // Identity block should contain character name and details
    const identityBlock = blocks[1];
    expect(identityBlock.content).toContain("TestBot");
    expect(identityBlock.content).toContain("A helpful test assistant");
    expect(identityBlock.content).toContain("Testing prompt caching");
  });

  it("should include avatar URL in identity block", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
    });

    const identityBlock = blocks[1];
    expect(identityBlock.content).toContain("https://example.com/avatar.png");
  });

  it("should include memories block", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
    });

    // Memories block should be present
    const memoryBlock = blocks.find((b) => b.content.includes("Agent Memory"));
    expect(memoryBlock).toBeDefined();
    expect(memoryBlock?.content).toContain("Some memories here");
  });

  it("should use correct tool loading mode", () => {
    const blocksDeferred = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
      toolLoadingMode: "deferred",
    });

    const blocksAlways = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
      toolLoadingMode: "always",
    });

    // Guidelines block should differ based on tool loading mode
    const guidelinesDeferred = blocksDeferred[blocksDeferred.length - 1];
    const guidelinesAlways = blocksAlways[blocksAlways.length - 1];

    expect(guidelinesDeferred.content).not.toBe(guidelinesAlways.content);
  });

  it("should handle character without avatar", () => {
    const charWithoutAvatar: CharacterFull = {
      ...mockCharacter,
      images: [],
    };

    const blocks = buildCacheableCharacterPrompt(charWithoutAvatar, {
      enableCaching: true,
    });

    const identityBlock = blocks[1];
    expect(identityBlock.content).not.toContain("Avatar Image URL");
  });

  it("should handle character without metadata", () => {
    const charWithoutMetadata: CharacterFull = {
      ...mockCharacter,
      metadata: null,
    };

    const blocks = buildCacheableCharacterPrompt(charWithoutMetadata, {
      enableCaching: true,
    });

    const identityBlock = blocks[1];
    expect(identityBlock.content).not.toContain("Your Purpose:");
  });

  it("should default to deferred mode when not specified", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
    });

    // Should use deferred mode by default
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    // Last block should contain minimal tool discovery (deferred)
    const guidelinesBlock = blocks[blocks.length - 1];
    expect(guidelinesBlock.content).toBeDefined();
  });

  it("should default to 5m TTL when not specified", () => {
    const blocks = buildCacheableCharacterPrompt(mockCharacter, {
      enableCaching: true,
    });

    const cachedBlocks = blocks.filter((b) => b.experimental_providerOptions?.anthropic?.cacheControl);
    cachedBlocks.forEach((block) => {
      expect(block.experimental_providerOptions?.anthropic?.cacheControl?.ttl).toBe("5m");
    });
  });
});
