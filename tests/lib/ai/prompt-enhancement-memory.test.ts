import { describe, expect, it } from "vitest";

import {
  decideMemoryInjection,
  normalizeApprovedMemoryMarkdown,
} from "@/lib/ai/prompt-enhancement-memory";

describe("prompt-enhancement-memory", () => {
  it("deduplicates repeated approved memory bullet lines while preserving order", () => {
    const markdown = [
      "## User Preferences & Context",
      "- Keep responses concise",
      "- Use TypeScript examples",
      "- Keep responses concise",
      "",
      "- Use TypeScript examples",
    ].join("\n");

    const normalized = normalizeApprovedMemoryMarkdown(markdown);

    expect(normalized.dedupedMemoryLineCount).toBe(2);
    expect(normalized.markdown).toContain("- Keep responses concise");
    expect(normalized.markdown).toContain("- Use TypeScript examples");
    expect(normalized.markdown.match(/- Keep responses concise/g)?.length).toBe(1);
    expect(normalized.markdown.match(/- Use TypeScript examples/g)?.length).toBe(1);
  });

  it("injects memory only when signature is new for the session", () => {
    const markdown = "- Remember workspace preference\n- Remember workspace preference";

    const first = decideMemoryInjection(markdown, null);
    const second = decideMemoryInjection(markdown, first.signature);

    expect(first.shouldInject).toBe(true);
    expect(first.injectedMarkdown).toContain("Remember workspace preference");
    expect(first.tokenEstimateInjected).toBeGreaterThan(0);

    expect(second.shouldInject).toBe(false);
    expect(second.injectedMarkdown).toBe("");
    expect(second.tokenEstimateInjected).toBe(0);
  });

  it("re-injects when memory content materially changes", () => {
    const first = decideMemoryInjection("- memory A", null);
    const second = decideMemoryInjection("- memory B", first.signature);

    expect(first.signature).not.toBe(second.signature);
    expect(second.shouldInject).toBe(true);
    expect(second.injectedMarkdown).toContain("memory B");
  });
});
