import { describe, expect, it } from "vitest";
import { formatArgsPreview } from "@/components/assistant-ui/tool-fallback";

describe("formatArgsPreview", () => {
  it("returns original args when below preview threshold", () => {
    const value = "{\"a\":1}";
    expect(formatArgsPreview(value)).toBe(value);
  });

  it("truncates long args and appends hidden-char summary", () => {
    const value = "x".repeat(2500);
    const preview = formatArgsPreview(value);
    expect(preview.length).toBeLessThan(value.length);
    expect(preview).toContain("more characters hidden in preview");
  });
});
