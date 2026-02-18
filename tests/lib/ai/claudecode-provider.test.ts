import { describe, it, expect } from "vitest";
import { sanitizeJsonStringValues } from "@/lib/ai/providers/claudecode-provider";

describe("sanitizeJsonStringValues", () => {
  it("preserves valid surrogate pairs", () => {
    const input = {
      text: "ok \u{1F600} end",
      nested: [{ value: "pair: \u{1F604}" }],
    };

    const result = sanitizeJsonStringValues(input);

    expect(result.changed).toBe(false);
    expect(result.value).toEqual(input);
  });

  it("replaces lone high and low surrogates recursively", () => {
    const loneHigh = "\ud83d";
    const loneLow = "\ude00";

    const input = {
      top: `A${loneHigh}B${loneLow}C`,
      nested: [{ text: `${loneLow}${loneHigh}` }],
    };

    const result = sanitizeJsonStringValues(input);

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      top: "A�B�C",
      nested: [{ text: "��" }],
    });
  });
});
