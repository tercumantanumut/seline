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
  const modelId = "claude-sonnet-4-5-20250929"; // maxTokens=200000, hardLimit=190000
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
      .mockResolvedValueOnce(makeUsage(195_000))
      .mockResolvedValueOnce(makeUsage(100_000));

    const compactSpy = vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: true,
      tokensFreed: 95_000,
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
    vi.spyOn(TokenTracker, "calculateUsage")
      .mockResolvedValueOnce(makeUsage(195_000))
      .mockResolvedValueOnce(makeUsage(195_000));

    vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: true,
      tokensFreed: 1_000,
      messagesCompacted: 1,
      newSummary: "summary",
    });

    const result = await ContextWindowManager.preFlightCheck(
      sessionId,
      modelId,
      systemPromptLength
    );

    expect(result.canProceed).toBe(false);
    expect(result.status.status).toBe("exceeded");
    expect(result.error).toBe("Context window still exceeded after compaction");
    expect(result.recovery?.action).toBe("new_session");
  });

  it("blocks with recovery when compaction fails", async () => {
    vi.spyOn(TokenTracker, "calculateUsage").mockResolvedValueOnce(makeUsage(195_000));

    vi.spyOn(CompactionService, "compact").mockResolvedValue({
      success: false,
      tokensFreed: 0,
      messagesCompacted: 0,
      newSummary: "",
      error: "simulated failure",
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
});
