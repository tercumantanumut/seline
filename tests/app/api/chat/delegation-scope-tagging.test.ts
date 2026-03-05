import { describe, expect, it } from "vitest";

import { tagIntermediateDelegationParts } from "@/app/api/chat/delegation-scope-tagging";
import type { DBContentPart } from "@/lib/messages/converter";
import type { StreamingMessageState } from "@/app/api/chat/streaming-state";

function makeState(parts: StreamingMessageState["parts"]): StreamingMessageState {
  return {
    parts,
    toolCallParts: new Map(),
    loggedIncompleteToolCalls: new Set(),
    lastBroadcastAt: 0,
    lastBroadcastSignature: "",
  };
}

describe("tagIntermediateDelegationParts", () => {
  it("tags only the targeted toolCallId pair and does not cross-tag neighbors", () => {
    const state = makeState([
      { type: "tool-call", toolCallId: "observe-1", toolName: "delegateToSubagent", state: "input-available" },
      {
        type: "tool-result",
        toolCallId: "observe-1",
        toolName: "delegateToSubagent",
        state: "output-available",
        result: { running: true, completed: false },
      },
      { type: "tool-call", toolCallId: "observe-2", toolName: "delegateToSubagent", state: "input-available" },
      {
        type: "tool-result",
        toolCallId: "observe-2",
        toolName: "delegateToSubagent",
        state: "output-available",
        result: { running: true, completed: false },
      },
      { type: "tool-call", toolCallId: "read-1", toolName: "readFile", state: "input-available" },
      {
        type: "tool-result",
        toolCallId: "read-1",
        toolName: "readFile",
        state: "output-available",
        result: { status: "success" },
      },
    ]);

    const changed = tagIntermediateDelegationParts(state, "observe-1");

    expect(changed).toBe(true);

    const taggedCall = state.parts.find(
      (part) => part.type === "tool-call" && part.toolCallId === "observe-1"
    );
    const taggedResult = state.parts.find(
      (part) => part.type === "tool-result" && part.toolCallId === "observe-1"
    );

    expect(taggedCall).toMatchObject({ contextScope: "delegated", provenanceVersion: 1 });
    expect(taggedResult).toMatchObject({ contextScope: "delegated", provenanceVersion: 1 });

    const untouchedSecondCall = state.parts.find(
      (part) => part.type === "tool-call" && part.toolCallId === "observe-2"
    );
    const untouchedSecondResult = state.parts.find(
      (part) => part.type === "tool-result" && part.toolCallId === "observe-2"
    );
    const untouchedReadCall = state.parts.find(
      (part) => part.type === "tool-call" && part.toolCallId === "read-1"
    );
    const untouchedReadResult = state.parts.find(
      (part) => part.type === "tool-result" && part.toolCallId === "read-1"
    );

    expect(untouchedSecondCall).not.toHaveProperty("contextScope");
    expect(untouchedSecondResult).not.toHaveProperty("contextScope");
    expect(untouchedReadCall).not.toHaveProperty("contextScope");
    expect(untouchedReadResult).not.toHaveProperty("contextScope");
  });

  it("does not tag final observe results", () => {
    const state = makeState([
      { type: "tool-call", toolCallId: "observe-final", toolName: "delegateToSubagent", state: "input-available" },
      {
        type: "tool-result",
        toolCallId: "observe-final",
        toolName: "delegateToSubagent",
        state: "output-available",
        result: { running: false, completed: true },
      },
    ]);

    const changed = tagIntermediateDelegationParts(state, "observe-final");

    expect(changed).toBe(false);

    const callPart = state.parts.find(
      (part) => part.type === "tool-call" && part.toolCallId === "observe-final"
    );
    const resultPart = state.parts.find(
      (part) => part.type === "tool-result" && part.toolCallId === "observe-final"
    );

    expect(callPart).not.toHaveProperty("contextScope");
    expect(resultPart).not.toHaveProperty("contextScope");
  });
});
