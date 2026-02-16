/**
 * Tests for cache configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMinTokensForModel } from "../config";

describe("getMinTokensForModel", () => {
  describe("Anthropic models", () => {
    it("should return 4096 for Opus 4.6", () => {
      expect(getMinTokensForModel("claude-opus-4-6")).toBe(4096);
    });

    it("should return 4096 for Opus 4.6 (Thinking)", () => {
      expect(getMinTokensForModel("claude-opus-4-6-thinking")).toBe(4096);
    });

    it("should return 4096 for Haiku 4.5", () => {
      expect(getMinTokensForModel("claude-haiku-4-5")).toBe(4096);
    });

    it("should return 2048 for Haiku 3.x", () => {
      expect(getMinTokensForModel("claude-haiku-3")).toBe(2048);
      expect(getMinTokensForModel("claude-haiku-3-5")).toBe(2048);
    });

    it("should return 1024 for Sonnet 4", () => {
      expect(getMinTokensForModel("claude-sonnet-4")).toBe(1024);
    });

    it("should return 1024 for other Claude models", () => {
      expect(getMinTokensForModel("claude-opus-4")).toBe(1024);
      expect(getMinTokensForModel("claude-3-opus")).toBe(1024);
    });
  });

  describe("OpenRouter - Gemini models", () => {
    it("should return 4096 for Gemini 2.5 Pro", () => {
      expect(getMinTokensForModel("google/gemini-2.5-pro")).toBe(4096);
    });

    it("should return 2048 for Gemini 2.5 Flash", () => {
      expect(getMinTokensForModel("google/gemini-2.5-flash")).toBe(2048);
    });

    it("should return 4096 for other Gemini models", () => {
      expect(getMinTokensForModel("google/gemini-1.5-pro")).toBe(4096);
    });
  });

  describe("OpenRouter - OpenAI models", () => {
    it("should return 1024 for GPT models", () => {
      expect(getMinTokensForModel("openai/gpt-4")).toBe(1024);
      expect(getMinTokensForModel("openai/gpt-4-turbo")).toBe(1024);
      expect(getMinTokensForModel("openai/gpt-3.5-turbo")).toBe(1024);
    });
  });

  describe("Other providers", () => {
    it("should return 1024 for unknown models (default)", () => {
      expect(getMinTokensForModel("deepseek/deepseek-chat")).toBe(1024);
      expect(getMinTokensForModel("x-ai/grok-2")).toBe(1024);
      expect(getMinTokensForModel("unknown-model")).toBe(1024);
    });
  });
});

// Note: shouldUseCache() tests are skipped because they require complex mocking
// of dynamic require() calls. The function is integration-tested in the actual
// application. The model detection (getMinTokensForModel) is the critical logic
// that needs unit testing.
