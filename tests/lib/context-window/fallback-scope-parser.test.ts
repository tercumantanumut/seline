import { describe, expect, it } from "vitest";

import { LegacyScopeHeuristic } from "@/lib/context-window/fallback-scope-parser";

describe("LegacyScopeHeuristic", () => {
  it("classifies delegated tool-call names as delegated with high confidence", () => {
    const heuristic = new LegacyScopeHeuristic();

    const inferred = heuristic.inferPart({
      type: "tool-call",
      toolCallId: "tc-1",
      toolName: "Task",
    });

    expect(inferred.scope).toBe("delegated");
    expect(inferred.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("classifies paired tool-result for active delegated call as delegated", () => {
    const heuristic = new LegacyScopeHeuristic();

    heuristic.inferPart({
      type: "tool-call",
      toolCallId: "tc-2",
      toolName: "Task",
    });

    const inferred = heuristic.inferPart({
      type: "tool-result",
      toolCallId: "tc-2",
      toolName: "Task",
    });

    expect(inferred.scope).toBe("delegated");
    expect(inferred.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("infers untagged delegate observe intermediate results as delegated", () => {
    const heuristic = new LegacyScopeHeuristic();

    const inferred = heuristic.inferPart({
      type: "tool-result",
      toolCallId: "tc-observe-1",
      toolName: "delegateToSubagent",
      result: {
        running: true,
        completed: false,
      },
    });

    expect(inferred).toEqual({
      scope: "delegated",
      confidence: 0.95,
      reason: "delegate_observe_intermediate_running",
    });
  });

  it("classifies text while delegated call is active as delegated", () => {
    const heuristic = new LegacyScopeHeuristic();

    heuristic.inferPart({
      type: "tool-call",
      toolCallId: "tc-3",
      toolName: "Task",
    });

    const inferred = heuristic.inferPart({
      type: "text",
      text: "worker chatter",
    });

    expect(inferred.scope).toBe("delegated");
  });

  it("defaults plain text parts to main scope", () => {
    const heuristic = new LegacyScopeHeuristic();

    const inferred = heuristic.inferPart({
      type: "text",
      text: "normal root message",
    });

    expect(inferred.scope).toBe("main");
    expect(inferred.confidence).toBeLessThan(0.7);
  });

  it("uses session metadata isDelegation to classify message as delegated", () => {
    const heuristic = new LegacyScopeHeuristic({ isDelegation: true });

    const inferred = heuristic.inferMessage({ role: "assistant", content: "hello" } as any);

    expect(inferred.scope).toBe("delegated");
    expect(inferred.confidence).toBeGreaterThan(0.95);
  });
});
