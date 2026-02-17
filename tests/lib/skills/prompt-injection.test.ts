import { describe, expect, it } from "vitest";
import { formatSkillsForPromptFromSummary } from "@/lib/skills/prompt-injection";

describe("formatSkillsForPromptFromSummary", () => {
  it("includes trigger examples and matching guidance", () => {
    const result = formatSkillsForPromptFromSummary([
      {
        id: "skill-1",
        name: "Trend Digest",
        description: "Summarize trends",
        triggerExamples: ["What changed this week?"],
      },
    ]);

    expect(result.markdown).toContain("Skill-triggering policy");
    expect(result.markdown).toContain("Trigger examples: What changed this week?");
    expect(result.skillCount).toBe(1);
  });
});
