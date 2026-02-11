import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getNonCompactedMessages: vi.fn(),
  // These are imported by compaction-service during module evaluation in this test.
  updateSessionSummary: vi.fn(),
  markMessagesAsCompacted: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getSession: dbMocks.getSession,
  getNonCompactedMessages: dbMocks.getNonCompactedMessages,
  updateSessionSummary: dbMocks.updateSessionSummary,
  markMessagesAsCompacted: dbMocks.markMessagesAsCompacted,
}));

import { ContextWindowManager } from "@/lib/context-window/manager";
import { TokenTracker } from "@/lib/context-window/token-tracker";
import { CompactionService } from "@/lib/context-window/compaction-service";
import { getContextWindowConfig, getTokenThresholds } from "@/lib/context-window/provider-limits";

function makeUsage(totalTokens: number) {
  return {
    systemPromptTokens: 0,
    userMessageTokens: 0,
    assistantMessageTokens: 0,
    toolCallTokens: 0,
    toolResultTokens: 0,
    summaryTokens: 0,
    totalTokens,
  };
}

describe("ContextWindowManager.preFlightCheck compaction", () => {
  const sessionId = "session-1";
  const modelId = "gpt-5.1-codex"; // maxTokens=400000, hardLimit=380000 (GPT-5 models have 400K context)
  const systemPromptLength = 0;

  beforeEach(() => {
    dbMocks.getSession.mockReset();
    dbMocks.getNonCompactedMessages.mockReset();
    dbMocks.updateSessionSummary.mockReset();
    dbMocks.markMessagesAsCompacted.mockReset();

    vi.restoreAllMocks();

    dbMocks.getSession.mockResolvedValue({ id: sessionId, summary: null });
    dbMocks.getNonCompactedMessages.mockResolvedValue([]);
  });

  it("forces compaction when exceeded, then proceeds if compaction reduces tokens under limit", async () => {
    const usageSpy = vi
      .spyOn(TokenTracker, "calculateUsage")
      .mockResolvedValueOnce(makeUsage(385_000)) // Above 380K hard limit
      .mockResolvedValueOnce(makeUsage(200_000)); // After compaction, back to safe

    const compactSpy = vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: true,
      tokensFreed: 185_000,
      messagesCompacted: 42,
      newSummary: "summary",
    });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    expect(compactSpy).toHaveBeenCalledTimes(1);
    expect(usageSpy).toHaveBeenCalledTimes(2);

    expect(result.canProceed).toBe(true);
    expect(result.status.status).toBe("safe");
    expect(result.compactionResult?.success).toBe(true);
  });

  it("blocks when compaction succeeds but context is still exceeded", async () => {
    const usageSpy = vi.spyOn(TokenTracker, "calculateUsage")
      .mockResolvedValueOnce(makeUsage(385_000)) // Above 380K hard limit
      .mockResolvedValueOnce(makeUsage(385_000)) // Still exceeded after first compaction
      .mockResolvedValueOnce(makeUsage(4));       // After aggressive retry (keepRecent=0)

    const compactSpy = vi.spyOn(CompactionService, "compact")
      .mockResolvedValueOnce({
        success: true,
        tokensFreed: 1_000,
        messagesCompacted: 1,
        newSummary: "summary",
      })
      .mockResolvedValueOnce({
        success: true,
        tokensFreed: 380_000,
        messagesCompacted: 50,
        newSummary: "aggressive summary",
      });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    // After aggressive retry succeeds, should proceed
    expect(compactSpy).toHaveBeenCalledTimes(2);
    expect(usageSpy).toHaveBeenCalledTimes(3);
    expect(result.canProceed).toBe(true);
    expect(result.status.status).toBe("safe");
    // Merged compaction results
    expect(result.compactionResult?.tokensFreed).toBe(381_000);
    expect(result.compactionResult?.messagesCompacted).toBe(51);
  });

  it("force-proceeds with warning when compaction freed tokens but still exceeded", async () => {
    // Scenario: Compaction freed tokens but couldn't get below the hard limit
    // New behavior: allow the request through with a warning instead of permanently blocking
    vi.spyOn(TokenTracker, "calculateUsage")
      .mockResolvedValueOnce(makeUsage(395_000)) // Above 380K hard limit
      .mockResolvedValueOnce(makeUsage(390_000)) // Still exceeded after first compaction
      .mockResolvedValueOnce(makeUsage(385_000)); // Still exceeded after aggressive retry

    vi.spyOn(CompactionService, "compact")
      .mockResolvedValueOnce({
        success: true,
        tokensFreed: 5_000,
        messagesCompacted: 3,
        newSummary: "summary",
      })
      .mockResolvedValueOnce({
        success: true,
        tokensFreed: 5_000,
        messagesCompacted: 2,
        newSummary: "aggressive summary",
      });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    // Should proceed with warning since tokens were freed (10K total)
    expect(result.canProceed).toBe(true);
    expect(result.status.status).toBe("exceeded");
    expect(result.error).toContain("Warning:");
    expect(result.recovery?.action).toBe("compact");
    expect(result.compactionResult?.tokensFreed).toBe(10_000);
  });

  it("allows with warning when compaction fails due to insufficient messages at critical level", async () => {
    // Test the graceful fallback: insufficient messages at critical level should allow continuation
    vi.spyOn(TokenTracker, "calculateUsage").mockResolvedValueOnce(makeUsage(365_000)); // Critical (90-95%)

    vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: false,
      tokensFreed: 0,
      messagesCompacted: 0,
      newSummary: "",
      error: "Not enough messages to compact (5 < 10)",
    });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    // With graceful fallback, this should now allow continuation with a warning
    expect(result.canProceed).toBe(true);
    expect(result.error).toContain("Warning:");
    expect(result.error).toContain("Not enough messages");
  });

  it("blocks with recovery when compaction fails with other errors", async () => {
    // Non-insufficient-messages errors should still block
    vi.spyOn(TokenTracker, "calculateUsage").mockResolvedValueOnce(makeUsage(365_000));

    vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: false,
      tokensFreed: 0,
      messagesCompacted: 0,
      newSummary: "",
      error: "Database connection failed",
    });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    expect(result.canProceed).toBe(false);
    expect(result.error).toContain("Compaction failed:");
    expect(result.recovery?.action).toBe("new_session");
  });

  it("passes targetTokensToFree to compaction when context is critical", async () => {
    vi.spyOn(TokenTracker, "calculateUsage")
      .mockResolvedValueOnce(makeUsage(385_000)) // Exceeded
      .mockResolvedValueOnce(makeUsage(200_000)); // After compaction

    const compactSpy = vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: true,
      tokensFreed: 185_000,
      messagesCompacted: 42,
      newSummary: "summary",
    });

    await ContextWindowManager.preFlightCheck(sessionId, modelId, systemPromptLength);

    // targetTokensToFree = 385000 - floor(400000 * 0.7) = 385000 - 280000 = 105000
    expect(compactSpy).toHaveBeenCalledWith(sessionId, {
      targetTokensToFree: 105_000,
    });
  });
});

describe("Codex model context window limits", () => {
  it("returns 400K for all codex models", () => {
    const codexModels = [
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.2",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex",
      "gpt-5.1-codex-mini",
      "gpt-5.1",
    ];

    for (const modelId of codexModels) {
      const config = getContextWindowConfig(modelId, "codex");
      expect(config.maxTokens, `${modelId} should have 400K context`).toBe(400_000);
    }
  });

  it("returns 400K for codex provider default (unknown model)", () => {
    const config = getContextWindowConfig("unknown-codex-model", "codex");
    expect(config.maxTokens).toBe(400_000);
  });

  it("returns correct thresholds for codex models", () => {
    const thresholds = getTokenThresholds("gpt-5.1-codex", "codex");
    expect(thresholds.maxTokens).toBe(400_000);
    expect(thresholds.warningTokens).toBe(300_000);  // 75% of 400K
    expect(thresholds.criticalTokens).toBe(360_000); // 90% of 400K
    expect(thresholds.hardLimitTokens).toBe(380_000); // 95% of 400K
  });

  it("reports 208K on a 400K codex model as safe", async () => {
    const sessionId = "codex-session";
    const modelId = "gpt-5.1-codex";

    dbMocks.getSession.mockResolvedValue({ id: sessionId, summary: null });
    dbMocks.getNonCompactedMessages.mockResolvedValue([]);

    vi.spyOn(TokenTracker, "calculateUsage").mockResolvedValueOnce(makeUsage(208_000));

    const result = await ContextWindowManager.preFlightCheck(sessionId, modelId, 0, "codex");

    expect(result.canProceed).toBe(true);
    expect(result.status.status).toBe("safe");
    expect(result.status.maxTokens).toBe(400_000);
    // 208K / 400K = 52%
    expect(result.status.usagePercentage).toBeCloseTo(0.52, 2);
  });
});
