import { describe, expect, it } from "vitest";

import {
  normalizeTranscriptText,
  padTranscriptText,
  buildTranscriptInsertion,
  finalizeTranscriptText,
} from "@/components/assistant-ui/voice-transcript-utils";

// ---------------------------------------------------------------------------
// normalizeTranscriptText
// ---------------------------------------------------------------------------

describe("normalizeTranscriptText", () => {
  it("trims whitespace from strings", () => {
    expect(normalizeTranscriptText("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for non-string values", () => {
    expect(normalizeTranscriptText(undefined)).toBe("");
    expect(normalizeTranscriptText(null)).toBe("");
    expect(normalizeTranscriptText(42)).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeTranscriptText("   \t\n  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// padTranscriptText
// ---------------------------------------------------------------------------

describe("padTranscriptText", () => {
  it("adds leading space when left context ends with non-whitespace", () => {
    expect(padTranscriptText("world", "hello", "")).toBe(" world");
  });

  it("does not add leading space when left context ends with whitespace", () => {
    expect(padTranscriptText("world", "hello ", "")).toBe("world");
  });

  it("adds trailing space when right context starts with non-whitespace", () => {
    expect(padTranscriptText("hello", "", "world")).toBe("hello ");
  });

  it("does not add trailing space when right context starts with whitespace", () => {
    expect(padTranscriptText("hello", "", " world")).toBe("hello");
  });

  it("does not add leading space before punctuation in transcript", () => {
    expect(padTranscriptText(", then", "hello", "")).toBe(", then");
  });

  it("does not add trailing space before punctuation in right context", () => {
    expect(padTranscriptText("hello", "", ".")).toBe("hello");
  });

  it("returns empty string for empty/whitespace-only transcript", () => {
    expect(padTranscriptText("", "left", "right")).toBe("");
    expect(padTranscriptText("   ", "left", "right")).toBe("");
  });

  it("adds both spaces when sandwiched between text", () => {
    expect(padTranscriptText("middle", "left", "right")).toBe(" middle ");
  });

  it("handles empty context on both sides", () => {
    expect(padTranscriptText("hello", "", "")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// buildTranscriptInsertion — cursor/selection-aware insertion for simple input
// ---------------------------------------------------------------------------

describe("buildTranscriptInsertion", () => {
  it("inserts transcript at cursor position in the middle of text", () => {
    const result = buildTranscriptInsertion({
      currentValue: "hello world",
      transcript: "beautiful",
      selectionStart: 6,
      selectionEnd: 6,
    });

    expect(result).not.toBeNull();
    expect(result!.nextValue).toBe("hello beautiful world");
    expect(result!.nextCursor).toBe("hello beautiful ".length);
  });

  it("replaces selected text with transcript", () => {
    const result = buildTranscriptInsertion({
      currentValue: "hello world",
      transcript: "everyone",
      selectionStart: 6,
      selectionEnd: 11,
    });

    expect(result).not.toBeNull();
    expect(result!.nextValue).toBe("hello everyone");
    expect(result!.nextCursor).toBe("hello everyone".length);
  });

  it("appends at end when no selection is provided", () => {
    const result = buildTranscriptInsertion({
      currentValue: "hello",
      transcript: "world",
      selectionStart: null,
      selectionEnd: null,
    });

    expect(result).not.toBeNull();
    expect(result!.nextValue).toBe("hello world");
  });

  it("inserts at start of empty string", () => {
    const result = buildTranscriptInsertion({
      currentValue: "",
      transcript: "hello",
      selectionStart: 0,
      selectionEnd: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.nextValue).toBe("hello");
  });

  it("returns null for empty transcript", () => {
    const result = buildTranscriptInsertion({
      currentValue: "hello",
      transcript: "",
      selectionStart: 0,
      selectionEnd: 0,
    });

    expect(result).toBeNull();
  });

  it("handles multiline content with cursor on a later line", () => {
    const multiline = "line one\nline two\nline three";
    // Cursor at start of "line three" (index 18 = after second \n)
    const result = buildTranscriptInsertion({
      currentValue: multiline,
      transcript: "inserted",
      selectionStart: 18,
      selectionEnd: 18,
    });

    expect(result).not.toBeNull();
    expect(result!.nextValue).toContain("inserted");
    // No leading space needed after \n; trailing space added before "line"
    expect(result!.nextValue).toBe("line one\nline two\ninserted line three");
  });

  it("clamps out-of-bounds selection values", () => {
    const result = buildTranscriptInsertion({
      currentValue: "hi",
      transcript: "world",
      selectionStart: -5,
      selectionEnd: 100,
    });

    expect(result).not.toBeNull();
    // Should clamp to [0, 2] — replaces "hi" with "world"
    expect(result!.nextValue).toBe("world");
  });
});

// ---------------------------------------------------------------------------
// finalizeTranscriptText — enhancement on/off behavior
// ---------------------------------------------------------------------------

describe("finalizeTranscriptText", () => {
  it("returns raw transcript when post-processing is disabled", () => {
    const result = finalizeTranscriptText({
      transcript: "  hello there  ",
      postProcessingEnabled: false,
      enhancedText: "Hello there.",
    });

    expect(result.transcript).toBe("hello there");
    expect(result.finalText).toBe("hello there");
    expect(result.fallbackText).toBe("hello there");
    expect(result.usedEnhancedText).toBe(false);
  });

  it("returns enhanced text when post-processing is enabled and enhanced text is available", () => {
    const result = finalizeTranscriptText({
      transcript: "um hello there",
      postProcessingEnabled: true,
      enhancedText: "Hello there.",
    });

    expect(result.transcript).toBe("um hello there");
    expect(result.finalText).toBe("Hello there.");
    expect(result.fallbackText).toBe("um hello there");
    expect(result.usedEnhancedText).toBe(true);
  });

  it("falls back to raw transcript when enhanced text is empty", () => {
    const result = finalizeTranscriptText({
      transcript: "hello",
      postProcessingEnabled: true,
      enhancedText: "",
    });

    expect(result.finalText).toBe("hello");
    expect(result.usedEnhancedText).toBe(false);
  });

  it("falls back to raw transcript when enhanced text is null", () => {
    const result = finalizeTranscriptText({
      transcript: "hello",
      postProcessingEnabled: true,
      enhancedText: null,
    });

    expect(result.finalText).toBe("hello");
    expect(result.usedEnhancedText).toBe(false);
  });

  it("handles empty transcript gracefully", () => {
    const result = finalizeTranscriptText({
      transcript: "",
      postProcessingEnabled: true,
      enhancedText: null,
    });

    expect(result.transcript).toBe("");
    expect(result.finalText).toBe("");
    expect(result.fallbackText).toBe("");
    expect(result.usedEnhancedText).toBe(false);
  });

  it("handles whitespace-only transcript", () => {
    const result = finalizeTranscriptText({
      transcript: "   ",
      postProcessingEnabled: false,
    });

    expect(result.transcript).toBe("");
    expect(result.finalText).toBe("");
  });
});
