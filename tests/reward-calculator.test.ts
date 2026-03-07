import { describe, expect, it } from "vitest";

import {
  buildCompletedTaskReward,
  estimateTaskRewardSuggestion,
  formatUsdReward,
} from "@/lib/rewards/reward-calculator";

describe("reward-calculator", () => {
  it("returns no suggestion for very short prompts", () => {
    expect(estimateTaskRewardSuggestion("fix")).toBeNull();
  });

  it("builds a completed reward with tool and token bonuses", () => {
    const reward = buildCompletedTaskReward({
      sessionId: "session-1",
      runId: "run-1",
      userMessageId: "message-1",
      promptText: "Implement a new dashboard for completed tasks with reward tracking and settings integration.",
      totalTokens: 4500,
      toolCallCount: 3,
      stepCount: 4,
      completedAt: "2026-03-07T04:00:00.000Z",
    });

    expect(reward).not.toBeNull();
    expect(reward?.runId).toBe("run-1");
    expect(reward?.toolBonusUsd).toBe(105);
    expect(reward?.tokenBonusUsd).toBe(60);
    expect(reward?.amountUsd).toBe(reward!.baseAmountUsd + 165);
  });

  it("formats usd rewards without cents", () => {
    expect(formatUsdReward(240)).toBe("$240");
  });
});
