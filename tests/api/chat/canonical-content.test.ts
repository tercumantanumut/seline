import { describe, expect, it } from "vitest";

import {
  buildCanonicalAssistantContentFromSteps,
  mergeCanonicalAssistantContent,
  reconcileDbToolCallResultPairs,
  isReconstructedMissingResult,
  countCanonicalTruncationMarkers,
  isAbortLikeTerminationError,
  shouldTreatStreamErrorAsCancellation,
} from "@/app/api/chat/canonical-content";
import type { DBContentPart } from "@/lib/messages/converter";

// ── helpers ──────────────────────────────────────────────────────────────────

function textPart(text: string): DBContentPart {
  return { type: "text", text };
}

function toolCall(id: string, name = "tool", args: unknown = {}): DBContentPart {
  return { type: "tool-call", toolCallId: id, toolName: name, args };
}

function toolResult(id: string, name = "tool", result: unknown = { status: "ok" }): DBContentPart {
  return {
    type: "tool-result",
    toolCallId: id,
    toolName: name,
    result,
    status: "success",
    state: "output-available",
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// mergeCanonicalAssistantContent
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeCanonicalAssistantContent", () => {
  // ── text dedup basics ───────────────────────────────────────────────────

  it("exact text match → skip duplicate", () => {
    const streamed = [textPart("hello world")];
    const step = [textPart("hello world")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe("hello world");
  });

  it("whitespace-only difference → skip (trim comparison)", () => {
    const streamed = [textPart("\n\nHey! What's up?")];
    const step = [textPart("Hey! What's up?")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(1);
  });

  it("existing superset of incoming → skip", () => {
    const streamed = [textPart("hello world, how are you?")];
    const step = [textPart("hello world")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe("hello world, how are you?");
  });

  it("incoming extends a single existing text → replace", () => {
    const streamed = [textPart("hello")];
    const step = [textPart("hello world")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe("hello world");
  });

  it("genuinely new text → append", () => {
    const streamed = [textPart("alpha")];
    const step = [textPart("beta")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(2);
  });

  // ── blob-drop heuristic (multi-part subsumption) ─────────────────────

  it("incoming subsumes 2+ existing parts → drop (concatenated step blob)", () => {
    const streamed: DBContentPart[] = [
      textPart("Let me check the code."),
      toolCall("tc1", "Read"),
      toolResult("tc1", "Read"),
      textPart("Now let me fix the bug."),
      toolCall("tc2", "Edit"),
      toolResult("tc2", "Edit"),
      textPart("Done. Here's the summary."),
    ];
    // AI SDK concatenates all text blocks in a step into one string
    const blob = "Let me check the code.Now let me fix the bug.Done. Here's the summary.";
    const step = [textPart(blob)];

    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    // Should keep the 3 original parts, NOT add the blob
    expect(textParts).toHaveLength(3);
  });

  // ── Fix #1: empty text parts don't corrupt subsumption count ──────────

  it("empty text parts in base don't trigger blob-drop heuristic", () => {
    const streamed: DBContentPart[] = [
      textPart(""),   // empty part #1
      textPart(""),   // empty part #2
    ];
    const step = [textPart("hello world")];

    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter(
      (p) => p.type === "text" && (p as { text: string }).text.trim() !== ""
    );
    // "hello world" is genuinely new content — must NOT be dropped
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe("hello world");
  });

  it("one empty + one real subsumable → single replacement, not blob-drop", () => {
    const streamed: DBContentPart[] = [
      textPart(""),
      textPart("hello"),
    ];
    const step = [textPart("hello world")];

    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter(
      (p) => p.type === "text" && (p as { text: string }).text.trim() !== ""
    );
    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { text: string }).text).toBe("hello world");
  });

  // ── stripFakeToolCallJson gating ──────────────────────────────────────
  // With STRIP_FAKE_TOOL_JSON disabled (default), fake tool JSON stays in text.
  // The merge just compares raw trimmed text.

  it("fake tool JSON in streaming text: no stripping when flag is off (default)", () => {
    // Without the flag, fake JSON is NOT stripped — texts differ → 2 parts
    const fakeToolJson = '{"type":"tool-result","toolCallId":"tc_x","toolName":"Write","result":{}}';
    const streamedText = `Start.\n${fakeToolJson}`;
    const cleanText = "Start.";

    const streamed = [textPart(streamedText)];
    const step = [textPart(cleanText)];

    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    // Streaming text contains the fake JSON, step text doesn't — but step is a
    // substring of the trimmed streaming text → existing superset → 1 part
    expect(textParts).toHaveLength(1);
  });

  it("fake tool JSON as entire streaming text: step text appended as new content", () => {
    // Streaming text is ONLY fake tool JSON (no real text). Step has real text.
    // They don't overlap at all → step text appended.
    const fakeToolJson = '{"type":"tool-call","toolCallId":"tc_123","toolName":"Read","args":{}}';
    const streamed = [textPart(fakeToolJson)];
    const step = [textPart("Let me check.")];

    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    // 2 parts: original fake-JSON text (still in base) + new step text
    expect(textParts).toHaveLength(2);
    expect((textParts[1] as { text: string }).text).toBe("Let me check.");
  });

  // ── tool-call/result merging ──────────────────────────────────────────

  it("new tool-call from step gets appended", () => {
    const streamed = [toolCall("tc1", "Read")];
    const step = [toolCall("tc2", "Write")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    expect(merged.filter((p) => p.type === "tool-call")).toHaveLength(2);
  });

  it("existing tool-call gets args filled from step", () => {
    const streamed: DBContentPart[] = [
      { type: "tool-call", toolCallId: "tc1", toolName: "Read" },
    ];
    const step = [toolCall("tc1", "Read", { filePath: "/foo" })];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const tc = merged.find(
      (p) => p.type === "tool-call" && p.toolCallId === "tc1"
    ) as { args?: unknown };
    expect(tc?.args).toEqual({ filePath: "/foo" });
  });

  it("new tool-result from step gets appended", () => {
    const streamed: DBContentPart[] = [
      toolCall("tc1", "Read"),
    ];
    const step = [toolResult("tc1", "Read", { content: "file data" })];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    expect(merged.filter((p) => p.type === "tool-result")).toHaveLength(1);
  });

  it("reconstructed tool-result gets replaced by real result", () => {
    const streamed: DBContentPart[] = [
      toolCall("tc1", "Read"),
      {
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "Read",
        result: {
          error: "Tool execution did not return a persisted result in conversation history.",
          reconstructed: true,
        },
        status: "error",
        state: "output-error",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    const step = [toolResult("tc1", "Read", { content: "real result" })];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const tr = merged.find(
      (p) => p.type === "tool-result" && p.toolCallId === "tc1"
    ) as { result?: unknown };
    expect(tr?.result).toEqual({ content: "real result" });
  });

  // ── edge cases ────────────────────────────────────────────────────────

  it("empty streamed + step → returns step parts (reconciled)", () => {
    const step = [textPart("hello"), toolCall("tc1")];
    const merged = mergeCanonicalAssistantContent(undefined, step);
    expect(merged.length).toBeGreaterThanOrEqual(2);
  });

  it("streamed + empty step → returns base parts (reconciled)", () => {
    const streamed = [textPart("hello"), toolCall("tc1")];
    const merged = mergeCanonicalAssistantContent(streamed, []);
    expect(merged.length).toBeGreaterThanOrEqual(2);
  });

  it("both empty → returns empty", () => {
    const merged = mergeCanonicalAssistantContent([], []);
    expect(merged).toEqual([]);
  });

  it("empty incoming text is skipped", () => {
    const streamed = [textPart("hello")];
    const step = [textPart(""), textPart("   ")];
    const merged = mergeCanonicalAssistantContent(streamed, step);
    const textParts = merged.filter((p) => p.type === "text");
    expect(textParts).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileDbToolCallResultPairs
// ─────────────────────────────────────────────────────────────────────────────

describe("reconcileDbToolCallResultPairs", () => {
  it("passes through well-formed call+result pairs", () => {
    const parts: DBContentPart[] = [
      toolCall("tc1", "Read"),
      toolResult("tc1", "Read"),
    ];
    const reconciled = reconcileDbToolCallResultPairs(parts);
    expect(reconciled).toHaveLength(2);
    expect(reconciled[0].type).toBe("tool-call");
    expect(reconciled[1].type).toBe("tool-result");
  });

  it("injects missing tool-call before orphaned tool-result", () => {
    const parts: DBContentPart[] = [
      toolResult("tc1", "Read", { content: "data" }),
    ];
    const reconciled = reconcileDbToolCallResultPairs(parts);
    expect(reconciled).toHaveLength(2);
    expect(reconciled[0].type).toBe("tool-call");
    expect((reconciled[0] as { toolCallId: string }).toolCallId).toBe("tc1");
    expect((reconciled[0] as { args?: unknown }).args).toEqual({
      __reconstructed: true,
      reason: "missing_tool_call_in_history",
    });
  });

  it("injects missing tool-result after orphaned tool-call", () => {
    const parts: DBContentPart[] = [
      toolCall("tc1", "Read"),
    ];
    const reconciled = reconcileDbToolCallResultPairs(parts);
    expect(reconciled).toHaveLength(2);
    expect(reconciled[1].type).toBe("tool-result");
    expect((reconciled[1] as { result?: unknown }).result).toMatchObject({
      status: "error",
      reconstructed: true,
    });
  });

  it("preserves text parts in order", () => {
    const parts: DBContentPart[] = [
      textPart("before"),
      toolCall("tc1", "Read"),
      toolResult("tc1", "Read"),
      textPart("after"),
    ];
    const reconciled = reconcileDbToolCallResultPairs(parts);
    expect(reconciled[0]).toEqual(textPart("before"));
    expect(reconciled[reconciled.length - 1]).toEqual(textPart("after"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCanonicalAssistantContentFromSteps
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCanonicalAssistantContentFromSteps", () => {
  it("returns fallback text when no steps", () => {
    const parts = buildCanonicalAssistantContentFromSteps(undefined, "fallback text");
    expect(parts).toHaveLength(1);
    expect((parts[0] as { text: string }).text).toBe("fallback text");
  });

  it("returns empty for empty steps and no fallback", () => {
    const parts = buildCanonicalAssistantContentFromSteps([]);
    expect(parts).toHaveLength(0);
  });

  it("builds text from step text", () => {
    const parts = buildCanonicalAssistantContentFromSteps([{ text: "hello" }]);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("text");
  });

  it("preserves fake tool-call JSON when STRIP_FAKE_TOOL_JSON is off (default)", () => {
    // With the env flag off, stripFakeToolCallJson is a passthrough (trim only)
    const fakeJson = '{"type":"tool-call","toolCallId":"tc_x","toolName":"Read","args":{}}';
    const parts = buildCanonicalAssistantContentFromSteps([
      { text: `Some text\n${fakeJson}\nMore text` },
    ]);
    expect(parts).toHaveLength(1);
    const textContent = (parts[0] as { text: string }).text;
    // Fake JSON is preserved since stripping is disabled
    expect(textContent).toContain("tool-call");
    expect(textContent).toContain("Some text");
    expect(textContent).toContain("More text");
  });

  it("deduplicates tool calls by ID", () => {
    const parts = buildCanonicalAssistantContentFromSteps([
      {
        toolCalls: [
          { toolCallId: "tc1", toolName: "Read", input: { filePath: "/a" } },
          { toolCallId: "tc1", toolName: "Read", input: { filePath: "/a" } },
        ],
      },
    ]);
    const calls = parts.filter((p) => p.type === "tool-call");
    expect(calls).toHaveLength(1);
  });

  it("deduplicates tool results by ID", () => {
    const parts = buildCanonicalAssistantContentFromSteps([
      {
        toolCalls: [{ toolCallId: "tc1", toolName: "Read", input: { filePath: "/a" } }],
        toolResults: [
          { toolCallId: "tc1", output: { content: "data" } },
          { toolCallId: "tc1", output: { content: "data" } },
        ],
      },
    ]);
    const results = parts.filter((p) => p.type === "tool-result");
    expect(results).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isReconstructedMissingResult
// ─────────────────────────────────────────────────────────────────────────────

describe("isReconstructedMissingResult", () => {
  it("true for { reconstructed: true }", () => {
    expect(isReconstructedMissingResult({ reconstructed: true })).toBe(true);
  });

  it("true for error message with 'did not return a persisted result'", () => {
    expect(
      isReconstructedMissingResult({
        error: "Tool execution did not return a persisted result in conversation history.",
      })
    ).toBe(true);
  });

  it("false for null/undefined", () => {
    expect(isReconstructedMissingResult(null)).toBe(false);
    expect(isReconstructedMissingResult(undefined)).toBe(false);
  });

  it("false for arrays", () => {
    expect(isReconstructedMissingResult([1, 2, 3])).toBe(false);
  });

  it("false for normal objects", () => {
    expect(isReconstructedMissingResult({ status: "ok" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// countCanonicalTruncationMarkers
// ─────────────────────────────────────────────────────────────────────────────

describe("countCanonicalTruncationMarkers", () => {
  it("counts truncated: true markers", () => {
    const parts: DBContentPart[] = [
      toolCall("tc1"),
      {
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "tool",
        result: { truncated: true, content: "..." },
        state: "output-available",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(countCanonicalTruncationMarkers(parts)).toBe(1);
  });

  it("counts truncatedContentId markers", () => {
    const parts: DBContentPart[] = [
      toolCall("tc1"),
      {
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "tool",
        result: { truncatedContentId: "trunc_abc123" },
        state: "output-available",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(countCanonicalTruncationMarkers(parts)).toBe(1);
  });

  it("returns 0 for no markers", () => {
    const parts: DBContentPart[] = [textPart("hello"), toolCall("tc1"), toolResult("tc1")];
    expect(countCanonicalTruncationMarkers(parts)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isAbortLikeTerminationError + shouldTreatStreamErrorAsCancellation
// ─────────────────────────────────────────────────────────────────────────────

describe("isAbortLikeTerminationError", () => {
  it.each([
    "Request was aborted",
    "Stream terminated early",
    "interrupted by user",
    "The controller was closed",
    "connection reset by peer",
    "socket hang up",
  ])("returns true for: %s", (msg) => {
    expect(isAbortLikeTerminationError(msg)).toBe(true);
  });

  it("returns false for normal errors", () => {
    expect(isAbortLikeTerminationError("Internal server error")).toBe(false);
    expect(isAbortLikeTerminationError("Rate limit exceeded")).toBe(false);
  });
});

describe("shouldTreatStreamErrorAsCancellation", () => {
  it("returns false for credit errors", () => {
    expect(
      shouldTreatStreamErrorAsCancellation({
        errorMessage: "aborted",
        isCreditError: true,
        streamAborted: true,
        classificationRecoverable: true,
      })
    ).toBe(false);
  });

  it("returns true when stream was aborted", () => {
    expect(
      shouldTreatStreamErrorAsCancellation({
        errorMessage: "some error",
        isCreditError: false,
        streamAborted: true,
        classificationRecoverable: false,
      })
    ).toBe(true);
  });

  it("returns true for user_abort classification", () => {
    expect(
      shouldTreatStreamErrorAsCancellation({
        errorMessage: "error",
        isCreditError: false,
        streamAborted: false,
        classificationRecoverable: false,
        classificationReason: "user_abort",
      })
    ).toBe(true);
  });

  it("returns true for recoverable abort-like errors", () => {
    expect(
      shouldTreatStreamErrorAsCancellation({
        errorMessage: "socket hang up",
        isCreditError: false,
        streamAborted: false,
        classificationRecoverable: true,
      })
    ).toBe(true);
  });

  it("returns false for non-recoverable non-abort errors", () => {
    expect(
      shouldTreatStreamErrorAsCancellation({
        errorMessage: "internal server error",
        isCreditError: false,
        streamAborted: false,
        classificationRecoverable: false,
      })
    ).toBe(false);
  });
});
