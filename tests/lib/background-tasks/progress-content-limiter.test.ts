import { describe, it, expect } from "vitest";
import { limitProgressContent } from "@/lib/background-tasks/progress-content-limiter";

describe("limitProgressContent", () => {
  it("returns unchanged content when under limit", () => {
    const content = [
      { type: "text", text: "Hello world" },
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "localGrep",
        result: { status: "success", matchCount: 3, results: "short results" },
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toEqual(content);
    expect(result.truncatedParts).toBe(0);
  });

  it("returns empty result for undefined input", () => {
    const result = limitProgressContent(undefined);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toEqual([]);
    expect(result.originalTokens).toBe(0);
  });

  it("returns empty result for empty array", () => {
    const result = limitProgressContent([]);

    expect(result.wasTruncated).toBe(false);
    expect(result.content).toEqual([]);
  });

  it("truncates oversized tool-result string results", () => {
    // Create a tool-result with a massive string result (~100K chars = ~25K tokens)
    const massiveResult = "x".repeat(200_000);
    const content = [
      { type: "text", text: "Some text" },
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "localGrep",
        result: massiveResult,
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);
    expect(result.truncatedParts).toBeGreaterThan(0);
    expect(result.finalTokens).toBeLessThan(result.originalTokens);

    // The tool-result should still exist but with truncated content
    const toolResult = result.content.find(
      (p) => (p as Record<string, unknown>).type === "tool-result"
    ) as Record<string, unknown>;
    expect(toolResult).toBeDefined();
    expect(typeof toolResult.result).toBe("string");
    expect((toolResult.result as string).length).toBeLessThan(massiveResult.length);
    expect((toolResult.result as string)).toContain("truncated");
  });

  it("truncates oversized tool-result object results with 'results' field", () => {
    // Simulate a localGrep result with a massive `results` string field
    const massiveResults = "match line\n".repeat(30_000); // ~330K chars
    const content = [
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "localGrep",
        result: {
          status: "success",
          matchCount: 30000,
          results: massiveResults,
          pattern: "test",
        },
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);
    expect(result.truncatedParts).toBe(1);

    const toolResult = result.content[0] as Record<string, unknown>;
    const resultObj = toolResult.result as Record<string, unknown>;

    // The results field should be truncated
    expect((resultObj.results as string).length).toBeLessThan(massiveResults.length);
    expect(resultObj._progressTruncated).toBe(true);
  });

  it("handles multiple tool-results, truncating only oversized ones", () => {
    const smallResult = { status: "success", content: "small" };
    const massiveResult = "y".repeat(200_000);

    const content = [
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "readFile",
        result: smallResult,
      },
      {
        type: "tool-result",
        toolCallId: "tc-2",
        toolName: "localGrep",
        result: massiveResult,
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);
    // Only the second result should be truncated
    expect(result.truncatedParts).toBeGreaterThanOrEqual(1);

    // First result should be unchanged
    const first = result.content[0] as Record<string, unknown>;
    expect(first.toolCallId).toBe("tc-1");
  });

  it("falls back to stripped results when pass 1 is still too large", () => {
    // Create content that's so large even per-part truncation isn't enough
    // Multiple tool-results each at the per-part limit
    const content = Array.from({ length: 10 }, (_, i) => ({
      type: "tool-result" as const,
      toolCallId: `tc-${i}`,
      toolName: "localGrep",
      result: "z".repeat(60_000), // Each at 60K chars, 10 = 600K total
    }));

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);
    expect(result.finalTokens).toBeLessThanOrEqual(20_000);

    // All results should have been stripped to summaries
    for (const part of result.content) {
      const p = part as Record<string, unknown>;
      if (p.type === "tool-result") {
        const resultObj = p.result as Record<string, unknown>;
        expect(resultObj._progressTruncated).toBe(true);
      }
    }
  });

  it("hard-caps to a summary when non-tool text keeps payload over budget", () => {
    const content = [
      { type: "text", text: "x".repeat(400_000) },
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "localGrep",
        result: "y".repeat(200_000),
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);
    expect(result.hardCapped).toBe(true);
    expect(result.finalTokens).toBeLessThanOrEqual(20_000);

    expect(result.content).toHaveLength(1);
    const summaryPart = result.content[0] as Record<string, unknown>;
    expect(summaryPart.type).toBe("text");
    expect(typeof summaryPart.text).toBe("string");
    expect((summaryPart.text as string).toLowerCase()).toContain("omitted");
  });

  it("preserves non-tool-result parts", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "tool-call", toolCallId: "tc-1", toolName: "localGrep", args: { pattern: "test" } },
      {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "localGrep",
        result: "a".repeat(200_000),
      },
    ];

    const result = limitProgressContent(content);

    expect(result.wasTruncated).toBe(true);

    // Text and tool-call parts should be preserved
    const textPart = result.content.find(
      (p) => (p as Record<string, unknown>).type === "text"
    ) as Record<string, unknown>;
    expect(textPart).toBeDefined();
    expect(textPart.text).toBe("Hello");

    const toolCallPart = result.content.find(
      (p) => (p as Record<string, unknown>).type === "tool-call"
    ) as Record<string, unknown>;
    expect(toolCallPart).toBeDefined();
    expect(toolCallPart.toolCallId).toBe("tc-1");
  });
});
