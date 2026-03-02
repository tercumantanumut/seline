import { describe, expect, it } from "vitest";

import { plainTextToTiptapDoc } from "@/components/assistant-ui/tiptap-editor";

describe("plainTextToTiptapDoc", () => {
  it("returns null for whitespace-only input", () => {
    expect(plainTextToTiptapDoc("")).toBeNull();
    expect(plainTextToTiptapDoc("   \n\t")).toBeNull();
  });

  it("converts lines into paragraph nodes", () => {
    expect(plainTextToTiptapDoc("hello\nworld")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "world" }],
        },
      ],
    });
  });

  it("preserves blank lines as empty paragraphs", () => {
    expect(plainTextToTiptapDoc("a\n\n b")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a" }],
        },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: " b" }],
        },
      ],
    });
  });

  it("normalizes CRLF to paragraph breaks", () => {
    expect(plainTextToTiptapDoc("first\r\nsecond\rthird")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "first" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "second" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "third" }],
        },
      ],
    });
  });
});
