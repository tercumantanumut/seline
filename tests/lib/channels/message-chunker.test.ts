import { describe, expect, it } from "vitest";
import { generateSummaryHeader, splitMessageIntoChunks } from "@/lib/channels/message-chunker";

describe("message chunker", () => {
  const safeLimit = 3800;

  it("returns single chunk for small messages", () => {
    const text = "Small message";
    const chunks = splitMessageIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].isFirst).toBe(true);
    expect(chunks[0].isLast).toBe(true);
  });

  it("respects maximum chunk length", () => {
    const text = "A".repeat(10000);
    const chunks = splitMessageIntoChunks(text, { maxLength: safeLimit });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(safeLimit);
    }
  });

  it("preserves markdown header boundaries when possible", () => {
    const text = "## Header 1\n".repeat(100) + "Content here";
    const chunks = splitMessageIntoChunks(text, { maxLength: 500 });
    for (const chunk of chunks) {
      const lines = chunk.text.split("\n");
      const lastLine = lines[lines.length - 1];
      expect(lastLine).not.toMatch(/^## [^#]*$/);
    }
  });

  it("adds chunk numbering correctly", () => {
    const text = "A".repeat(10000);
    const chunks = splitMessageIntoChunks(text, { maxLength: 3000, addChunkHeaders: true });
    expect(chunks[0].text).toMatch(/^\(1\/\d+\)\s/);
    expect(chunks[1].text).toMatch(/^\(2\/\d+\)\s/);
  });

  it("handles 10KB input", () => {
    const text = "Plan content ".repeat(800);
    const chunks = splitMessageIntoChunks(text, { maxLength: safeLimit });
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
    expect(totalLength).toBeGreaterThan(text.length * 0.9);
  });

  it("handles 30KB input", () => {
    const text = "X".repeat(30000);
    const chunks = splitMessageIntoChunks(text, { maxLength: safeLimit });
    expect(chunks.length).toBeGreaterThan(7);
    expect(chunks[0].index).toBe(1);
    expect(chunks[chunks.length - 1].index).toBe(chunks.length);
  });

  it("handles 100KB input", () => {
    const text = "Content ".repeat(13000);
    const chunks = splitMessageIntoChunks(text, { maxLength: safeLimit });
    expect(chunks.length).toBeGreaterThan(25);
    const indices = chunks.map((chunk) => chunk.index);
    expect(indices).toEqual(indices.slice().sort((a, b) => a - b));
  });

  it("generates a readable summary header", () => {
    const header = generateSummaryHeader(5, 12_400);
    expect(header).toMatch(/Plan below is 5 parts/);
  });
});
