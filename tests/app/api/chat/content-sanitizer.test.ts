import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TEXT_CONTENT_LENGTH, sanitizeTextContent } from "@/app/api/chat/content-sanitizer";
import { storeFullContent } from "@/lib/ai/truncated-content-store";

vi.mock("@/lib/ai/truncated-content-store", () => ({
  storeFullContent: vi.fn(() => "trunc_test_123"),
}));

vi.mock("@/lib/messages/internal-tool-history", () => ({
  isInternalToolHistoryLeakText: vi.fn(() => false),
}));

describe("content-sanitizer text length limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a 25,000 character limit", () => {
    expect(MAX_TEXT_CONTENT_LENGTH).toBe(25_000);
  });

  it("does not truncate text at exactly the limit", () => {
    const chunk = "This is normal prose with spaces and punctuation.X";
    const input = chunk.repeat(Math.ceil(MAX_TEXT_CONTENT_LENGTH / chunk.length)).slice(0, MAX_TEXT_CONTENT_LENGTH);
    const output = sanitizeTextContent(input, "unit-test", "session-1");
    expect(output).toBe(input);
    expect(storeFullContent).not.toHaveBeenCalled();
  });

  it("truncates and stores full content when over limit with sessionId", () => {
    const chunk = "Long user prompt content with spaces, punctuation, and symbols !? ";
    const input = chunk
      .repeat(Math.ceil((MAX_TEXT_CONTENT_LENGTH + 500) / chunk.length))
      .slice(0, MAX_TEXT_CONTENT_LENGTH + 500);
    const output = sanitizeTextContent(input, "unit-test", "session-2");

    expect(storeFullContent).toHaveBeenCalledTimes(1);
    expect(storeFullContent).toHaveBeenCalledWith(
      "session-2",
      "unit-test",
      input,
      MAX_TEXT_CONTENT_LENGTH
    );
    expect(output.length).toBeGreaterThan(MAX_TEXT_CONTENT_LENGTH);
    expect(output).toContain("CONTENT TRUNCATED");
    expect(output).toContain("25,000");
    expect(output).toContain('contentId="trunc_test_123"');
  });

  it("truncates with fallback notice when sessionId is missing", () => {
    const chunk = "Another long content block with natural language and spaces. ";
    const input = chunk
      .repeat(Math.ceil((MAX_TEXT_CONTENT_LENGTH + 1) / chunk.length))
      .slice(0, MAX_TEXT_CONTENT_LENGTH + 1);
    const output = sanitizeTextContent(input, "unit-test");

    expect(storeFullContent).not.toHaveBeenCalled();
    expect(output).toContain("Content truncated at 25,000 chars");
  });
});
