import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import {
  buildCompletedTaskReward,
  type CompletedRewardInput,
  type TaskRewardRecord,
} from "./reward-calculator";

export function recordCompletedTaskReward(
  input: CompletedRewardInput,
): TaskRewardRecord | null {
  const rewardRecord = buildCompletedTaskReward(input);
  if (!rewardRecord) {
    return null;
  }

  const settings = loadSettings();
  const existingRewards = Array.isArray(settings.taskRewards)
    ? settings.taskRewards
    : [];

  const existingIndex = existingRewards.findIndex((entry) => {
    if (rewardRecord.runId && entry.runId) {
      return entry.runId === rewardRecord.runId;
    }
    return entry.id === rewardRecord.id;
  });

  const nextRewards = [...existingRewards];
  if (existingIndex >= 0) {
    nextRewards[existingIndex] = rewardRecord;
  } else {
    nextRewards.unshift(rewardRecord);
  }

  nextRewards.sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt),
  );

  settings.taskRewards = nextRewards;
  saveSettings(settings);

  return rewardRecord;
}
