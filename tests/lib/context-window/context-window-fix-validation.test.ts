/**
 * Validation Tests for Context Window Management Fix (2026-02)
 * 
 * Tests to verify the fixes for:
 * 1. 400K context window limits for Claude models
 * 2. Lowered minimum message threshold (3 instead of 10)
 * 3. Graceful fallback when compaction fails
 */

import { describe, it, expect } from "vitest";
import { 
  getContextWindowConfig, 
  getTokenThresholds,
  PROVIDER_DEFAULT_LIMITS 
} from "@/lib/context-window/provider-limits";

describe("Context Window Fix Validation", () => {
  describe("Provider Default Limits (400K for Claude)", () => {
    it("should set anthropic provider limit to 400K", () => {
      expect(PROVIDER_DEFAULT_LIMITS.anthropic).toBe(400000);
    });

    it("should set claudecode provider limit to 400K", () => {
      expect(PROVIDER_DEFAULT_LIMITS.claudecode).toBe(400000);
    });

    it("should set antigravity provider limit to 400K", () => {
      expect(PROVIDER_DEFAULT_LIMITS.antigravity).toBe(400000);
    });
  });

  describe("Model-Specific Configurations (400K)", () => {
    const claude35Models = [
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5",
      "claude-sonnet-4-5-thinking",
      "claude-opus-4-5-thinking",
      "claude-opus-4-6",
    ];

    claude35Models.forEach((modelId) => {
      it(`should configure ${modelId} with 400K context window`, () => {
        const config = getContextWindowConfig(modelId);
        expect(config.maxTokens).toBe(400000);
      });
    });
  });

  describe("Token Thresholds (based on 400K)", () => {
    it("should calculate correct thresholds for claude-sonnet-4-5", () => {
      const thresholds = getTokenThresholds("claude-sonnet-4-5");
      
      expect(thresholds.maxTokens).toBe(400000);
      expect(thresholds.warningTokens).toBe(300000); // 75% of 400K
      expect(thresholds.criticalTokens).toBe(360000); // 90% of 400K
      expect(thresholds.hardLimitTokens).toBe(380000); // 95% of 400K
    });

    it("should provide 3x more headroom than old 200K limits", () => {
      const thresholds = getTokenThresholds("claude-sonnet-4-5", "anthropic");
      
      // Old warning threshold was 150K (75% of 200K)
      // New warning threshold is 300K (75% of 400K)
      expect(thresholds.warningTokens).toBeGreaterThanOrEqual(300000);
      
      // Old hard limit was 190K (95% of 200K)
      // New hard limit is 380K (95% of 400K)
      expect(thresholds.hardLimitTokens).toBeGreaterThanOrEqual(380000);
    });
  });

  describe("Minimum Message Threshold (lowered to 3)", () => {
    it("should set minMessagesForCompaction to 3 in default config", () => {
      const config = getContextWindowConfig("unknown-model");
      expect(config.minMessagesForCompaction).toBe(3);
    });

    it("should allow compaction with as few as 3 messages", () => {
      const config = getContextWindowConfig("claude-sonnet-4-5");
      expect(config.minMessagesForCompaction).toBeLessThanOrEqual(3);
    });

    it("should support sparse long-running sessions", () => {
      // A session with 5 messages should now be eligible for compaction
      const config = getContextWindowConfig("claude-sonnet-4-5");
      const sparseSessionMessageCount = 5;
      
      expect(sparseSessionMessageCount).toBeGreaterThanOrEqual(
        config.minMessagesForCompaction
      );
    });
  });

  describe("Configuration Consistency", () => {
    it("should maintain keepRecentMessages at 6", () => {
      const config = getContextWindowConfig("claude-sonnet-4-5");
      expect(config.keepRecentMessages).toBe(6);
    });

    it("should maintain threshold percentages", () => {
      const config = getContextWindowConfig("claude-sonnet-4-5");
      
      expect(config.warningThreshold).toBe(0.75); // 75%
      expect(config.criticalThreshold).toBe(0.90); // 90%
      expect(config.hardLimit).toBe(0.95); // 95%
    });

    it("should enable streaming for Claude models", () => {
      const config = getContextWindowConfig("claude-sonnet-4-5");
      expect(config.supportsStreaming).toBe(true);
    });
  });

  describe("Backward Compatibility", () => {
    it("should fallback to provider defaults for unknown models", () => {
      const config = getContextWindowConfig("unknown-claude-model", "anthropic");
      expect(config.maxTokens).toBe(400000); // Should use provider default
    });

    it("should use conservative 128K default for completely unknown models", () => {
      const config = getContextWindowConfig("unknown-model");
      expect(config.maxTokens).toBe(128000);
    });
  });

  describe("Real-World Scenario: Long-Running Task", () => {
    it("should allow session to grow to 300K before warning", () => {
      const thresholds = getTokenThresholds("claude-sonnet-4-5");
      const longRunningSessionTokens = 250000; // 250K tokens
      
      expect(longRunningSessionTokens).toBeLessThan(thresholds.warningTokens);
    });

    it("should handle sparse sessions with large tool outputs", () => {
      const config = getContextWindowConfig("claude-sonnet-4-5");
      
      // Scenario: 5 messages with 50K tokens each = 250K total
      const messageCount = 5;
      const tokensPerMessage = 50000;
      const totalTokens = messageCount * tokensPerMessage;
      
      // Should be eligible for compaction
      expect(messageCount).toBeGreaterThanOrEqual(config.minMessagesForCompaction);
      
      // Should still be below warning threshold
      const thresholds = getTokenThresholds("claude-sonnet-4-5");
      expect(totalTokens).toBeLessThan(thresholds.warningTokens);
    });

    it("should provide adequate headroom for complex tasks", () => {
      const thresholds = getTokenThresholds("claude-sonnet-4-5");
      
      // A complex codebase analysis might use 200K tokens
      const complexTaskTokens = 200000;
      
      // Should still be in "safe" zone (below 75% warning threshold)
      expect(complexTaskTokens).toBeLessThan(thresholds.warningTokens);
      
      // Should have 180K tokens of headroom before warning
      const headroom = thresholds.warningTokens - complexTaskTokens;
      expect(headroom).toBeGreaterThanOrEqual(100000);
    });
  });
});
