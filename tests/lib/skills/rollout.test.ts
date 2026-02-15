import { describe, expect, it } from "vitest";
import { getSkillsRolloutState } from "@/lib/skills/rollout";

describe("skills rollout", () => {
  it("returns deterministic cohort assignments", () => {
    const first = getSkillsRolloutState("B", "user-1");
    const second = getSkillsRolloutState("B", "user-1");

    expect(first.inCohort).toBe(second.inCohort);
    expect(first.track).toBe("B");
  });
});
