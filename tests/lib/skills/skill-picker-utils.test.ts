import { describe, expect, it } from "vitest";
import {
  buildSkillRunIntent,
  detectSlashSkillTrigger,
  getRequiredSkillInputs,
  insertSkillRunIntent,
} from "@/lib/skills/skill-picker-utils";

describe("skill-picker-utils", () => {
  it("detects slash trigger at start and returns query up to cursor", () => {
    const input = "/real notes";
    const trigger = detectSlashSkillTrigger(input, 5);

    expect(trigger).toEqual({
      query: "real",
      matchStart: 0,
      matchEnd: 5,
      hasLeadingWhitespace: false,
    });
  });

  it("ignores slash mention that is not at the cursor", () => {
    const input = "please /research this";
    const trigger = detectSlashSkillTrigger(input, input.length);

    expect(trigger).toBeNull();
  });

  it("replaces slash query with natural language run intent", () => {
    const result = insertSkillRunIntent("/resi", 5, "realEstateScraper", []);

    expect(result.value).toBe("Run the realEstateScraper skill ");
    expect(result.nextCursor).toBe(result.value.length);
  });

  it("adds required input hint to inserted intent", () => {
    const required = getRequiredSkillInputs([
      { name: "listingUrl", required: true },
      { name: "style", required: false },
      { name: "budget", required: true },
    ]);

    expect(required).toEqual(["listingUrl", "budget"]);
    expect(buildSkillRunIntent("realEstateScraper", required)).toBe(
      "Run the realEstateScraper skill (I'll need: listingUrl, budget)"
    );
  });

  it("appends run intent when no slash trigger exists", () => {
    const result = insertSkillRunIntent("Analyze this", 12, "dataAnalyzer", []);

    expect(result.value).toBe("Analyze this Run the dataAnalyzer skill ");
    expect(result.nextCursor).toBe(result.value.length);
  });
});
