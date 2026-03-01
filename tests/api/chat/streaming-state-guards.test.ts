import { describe, it, expect } from "vitest";
import {
  recordToolInputDelta,
  recordToolInputStart,
  finalizeStreamingToolCalls,
  MAX_ARGS_TEXT_BYTES,
  type StreamingMessageState,
} from "@/app/api/chat/streaming-state";

function makeState(): StreamingMessageState {
  return {
    parts: [],
    toolCallParts: new Map(),
    loggedIncompleteToolCalls: new Set(),
    lastBroadcastAt: 0,
    lastBroadcastSignature: "",
  };
}

describe("recordToolInputDelta - argsText size cap", () => {
  it("accumulates deltas normally when under the limit", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");

    const delta = "a".repeat(1000);
    const result = recordToolInputDelta(state, "tc-1", delta);

    expect(result).toBe(true);
    const part = state.toolCallParts.get("tc-1");
    expect(part?.argsText).toHaveLength(1000);
  });

  it("stops accumulating when combined size would exceed MAX_ARGS_TEXT_BYTES", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");

    // Fill to just under the limit
    const bigChunk = "x".repeat(MAX_ARGS_TEXT_BYTES - 100);
    recordToolInputDelta(state, "tc-1", bigChunk);
    const part = state.toolCallParts.get("tc-1");
    expect(part!.argsText!.length).toBe(MAX_ARGS_TEXT_BYTES - 100);

    // A small delta that fits should still be accepted
    const fitsChunk = "y".repeat(50);
    const fitsResult = recordToolInputDelta(state, "tc-1", fitsChunk);
    expect(fitsResult).toBe(true);
    expect(part!.argsText!.length).toBe(MAX_ARGS_TEXT_BYTES - 50);

    // A delta that would push it over the limit should be rejected
    const overflowChunk = "z".repeat(100);
    const overflowResult = recordToolInputDelta(state, "tc-1", overflowChunk);
    expect(overflowResult).toBe(false);

    // argsText should not have grown
    expect(part!.argsText!.length).toBe(MAX_ARGS_TEXT_BYTES - 50);
  });

  it("rejects a single oversized delta that exceeds the cap from zero", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");

    // A single delta larger than the cap should be rejected
    const result = recordToolInputDelta(state, "tc-1", "x".repeat(MAX_ARGS_TEXT_BYTES + 1));
    expect(result).toBe(false);

    const part = state.toolCallParts.get("tc-1");
    expect(part?.argsText).toBeUndefined();
  });

  it("logs the oversized warning exactly once per tool call", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");

    // Fill to capacity
    recordToolInputDelta(state, "tc-1", "x".repeat(MAX_ARGS_TEXT_BYTES));

    // Try two more deltas that would exceed
    recordToolInputDelta(state, "tc-1", "a");
    recordToolInputDelta(state, "tc-1", "b");

    // The oversized log key should appear exactly once
    const oversizedKeys = Array.from(state.loggedIncompleteToolCalls).filter(
      (k) => k.startsWith("oversized:")
    );
    expect(oversizedKeys).toHaveLength(1);
    expect(oversizedKeys[0]).toBe("oversized:tc-1");
  });

  it("does not affect separate tool calls", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");
    recordToolInputStart(state, "tc-2", "readFile");

    // Fill tc-1 to capacity, then try to exceed
    recordToolInputDelta(state, "tc-1", "x".repeat(MAX_ARGS_TEXT_BYTES));
    const blocked = recordToolInputDelta(state, "tc-1", "more");
    expect(blocked).toBe(false);

    // tc-2 should still accept deltas
    const ok = recordToolInputDelta(state, "tc-2", '{"path": "/tmp"}');
    expect(ok).toBe(true);
    expect(state.toolCallParts.get("tc-2")?.argsText).toBe('{"path": "/tmp"}');
  });
});

describe("finalizeStreamingToolCalls - log truncation", () => {
  it("finalizes valid JSON argsText normally", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "readFile");
    recordToolInputDelta(state, "tc-1", '{"path": "/tmp/test.ts"}');

    const changed = finalizeStreamingToolCalls(state);

    expect(changed).toBe(true);
    const part = state.toolCallParts.get("tc-1");
    expect(part?.args).toEqual({ path: "/tmp/test.ts" });
    expect(part?.state).toBe("input-available");
  });

  it("repairs truncated JSON and finalizes", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");
    // Missing closing brace
    recordToolInputDelta(state, "tc-1", '{"filePath": "/tmp/test.ts", "oldString": "hello');

    const changed = finalizeStreamingToolCalls(state);

    expect(changed).toBe(true);
    const part = state.toolCallParts.get("tc-1");
    expect(part?.state).toBe("input-available");
    // Should have repaired the JSON
    expect(part?.args).toBeDefined();
  });

  it("falls back to empty args for completely malformed argsText", () => {
    const state = makeState();
    recordToolInputStart(state, "tc-1", "editFile");
    // Not even close to valid JSON
    recordToolInputDelta(state, "tc-1", "this is not json at all");

    const changed = finalizeStreamingToolCalls(state);

    expect(changed).toBe(true);
    const part = state.toolCallParts.get("tc-1");
    expect(part?.state).toBe("input-available");
    expect(part?.args).toEqual({});
  });
});
