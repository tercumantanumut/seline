import { describe, expect, it } from "vitest";
import { normalizeSdkPassthroughOutput } from "@/app/api/chat/sdk-passthrough-normalizer";

describe("normalizeSdkPassthroughOutput", () => {
  it("normalizes calculator discovery string outputs into canonical success objects", () => {
    const output = normalizeSdkPassthroughOutput(
      "mcp__seline-platform__calculator",
      'Tool "calculator" requires discovery first. Call searchTools("calculator") to activate it, then retry.',
      { expression: "14 + 5" }
    );

    expect(output.status).toBe("success");
    expect(output.content).toContain('Tool "calculator" requires discovery first');
    expect(typeof output.summary).toBe("string");
  });

  it("unwraps MCP text-wrapped calculator JSON into structured numeric result", () => {
    const wrapped = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            expression: "14 + 5",
            result: 19,
            type: "number",
          }),
        },
      ],
    };

    const output = normalizeSdkPassthroughOutput(
      "mcp__seline-platform__calculator",
      wrapped,
      { expression: "14 + 5" }
    );

    expect(output.status).toBe("success");
    expect(output.success).toBe(true);
    expect(output.expression).toBe("14 + 5");
    expect(output.result).toBe(19);
    expect(output.type).toBe("number");
  });

  it("unwraps MCP text-wrapped searchTools JSON and preserves query/results", () => {
    const wrapped = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "success",
            query: "calculator",
            results: [{ name: "calculator", displayName: "Calculator", isAvailable: true }],
            message: 'Found 1 result(s) matching "calculator". 1 tool(s).',
          }),
        },
      ],
    };

    const output = normalizeSdkPassthroughOutput(
      "mcp__seline-platform__searchTools",
      wrapped,
      { query: "calculator" }
    );

    expect(output.status).toBe("success");
    expect(output.query).toBe("calculator");
    expect(Array.isArray(output.results)).toBe(true);
    expect((output.results as Array<{ name?: string }>)[0]?.name).toBe("calculator");
    expect(output.message).toContain("Found 1 result");
  });
});

