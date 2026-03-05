import { describe, expect, it } from "vitest";

import { isDelegatedSubagentIntermediateResult } from "@/lib/context-window/claudecode-scope-classifier";

describe("isDelegatedSubagentIntermediateResult", () => {
  it("returns true for intermediate delegate observe result", () => {
    const result = isDelegatedSubagentIntermediateResult({
      type: "tool-result",
      toolCallId: "deleg-1",
      toolName: "delegateToSubagent",
      result: {
        running: true,
        completed: false,
      },
    });

    expect(result).toBe(true);
  });

  it("returns false for final delegate observe result", () => {
    const result = isDelegatedSubagentIntermediateResult({
      type: "tool-result",
      toolCallId: "deleg-2",
      toolName: "delegateToSubagent",
      result: {
        running: false,
        completed: true,
      },
    });

    expect(result).toBe(false);
  });

  it("returns false for non-delegation tool results", () => {
    const result = isDelegatedSubagentIntermediateResult({
      type: "tool-result",
      toolCallId: "other-1",
      toolName: "readFile",
      result: {
        running: true,
        completed: false,
      },
    });

    expect(result).toBe(false);
  });

  it("returns false for malformed result payloads", () => {
    expect(
      isDelegatedSubagentIntermediateResult({
        type: "tool-result",
        toolCallId: "deleg-3",
        toolName: "delegateToSubagent",
        result: "running",
      })
    ).toBe(false);

    expect(
      isDelegatedSubagentIntermediateResult({
        type: "tool-result",
        toolCallId: "deleg-4",
        toolName: "delegateToSubagent",
      })
    ).toBe(false);
  });
});
