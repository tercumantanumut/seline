import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: mocks.loadSettings,
  saveSettings: mocks.saveSettings,
}));

import { recordCompletedTaskReward } from "@/lib/rewards/reward-store";

describe("recordCompletedTaskReward", () => {
  beforeEach(() => {
    mocks.loadSettings.mockReset();
    mocks.saveSettings.mockReset();
  });

  it("prepends and persists a completed reward record", () => {
    mocks.loadSettings.mockReturnValue({ taskRewards: [] });

    const reward = recordCompletedTaskReward({
      sessionId: "session-1",
      runId: "run-1",
      promptText: "Build a polished settings dashboard for task reward tracking.",
      totalTokens: 2200,
      toolCallCount: 2,
      stepCount: 3,
      completedAt: "2026-03-07T04:00:00.000Z",
    });

    expect(reward).not.toBeNull();
    expect(mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        taskRewards: [expect.objectContaining({ runId: "run-1" })],
      }),
    );
  });

  it("replaces an existing run reward instead of duplicating it", () => {
    mocks.loadSettings.mockReturnValue({
      taskRewards: [
        {
          id: "run-1",
          taskId: "run-1",
          runId: "run-1",
          sessionId: "session-1",
          queryExcerpt: "Old reward",
          amountUsd: 40,
          suggestedAmountUsd: 40,
          baseAmountUsd: 40,
          toolBonusUsd: 0,
          tokenBonusUsd: 0,
          completedAt: "2026-03-07T03:00:00.000Z",
          completionStatus: "completed",
          complexityBand: "small",
          inputChars: 30,
          approxInputTokens: 8,
          totalTokens: 0,
          toolCallCount: 0,
          stepCount: 1,
        },
      ],
    });

    recordCompletedTaskReward({
      sessionId: "session-1",
      runId: "run-1",
      promptText: "Build a more capable reward system with completion logging.",
      totalTokens: 3200,
      toolCallCount: 1,
      stepCount: 2,
      completedAt: "2026-03-07T05:00:00.000Z",
    });

    const savedSettings = mocks.saveSettings.mock.calls[0]?.[0];
    expect(savedSettings.taskRewards).toHaveLength(1);
    expect(savedSettings.taskRewards[0].queryExcerpt).not.toBe("Old reward");
  });
});
