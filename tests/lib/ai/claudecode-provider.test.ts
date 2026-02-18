import { describe, it, expect } from "vitest";
import {
  normalizeAnthropicToolUseInputs,
  sanitizeJsonStringValues,
} from "@/lib/ai/providers/claudecode-provider";

describe("sanitizeJsonStringValues", () => {
  it("preserves valid surrogate pairs", () => {
    const input = {
      text: "ok \u{1F600} end",
      nested: [{ value: "pair: \u{1F604}" }],
    };

    const result = sanitizeJsonStringValues(input);

    expect(result.changed).toBe(false);
    expect(result.value).toEqual(input);
  });

  it("replaces lone high and low surrogates recursively", () => {
    const loneHigh = "\ud83d";
    const loneLow = "\ude00";

    const input = {
      top: `A${loneHigh}B${loneLow}C`,
      nested: [{ text: `${loneLow}${loneHigh}` }],
    };

    const result = sanitizeJsonStringValues(input);

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      top: "A�B�C",
      nested: [{ text: "��" }],
    });
  });
});

describe("normalizeAnthropicToolUseInputs", () => {
  it("parses tool_use input when input is a JSON string object", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "editFile",
              input: "{\"filePath\":\"app/today/page.tsx\",\"edits\":[{\"oldString\":\"a\",\"newString\":\"b\"}]}",
            },
          ],
        },
      ],
    };

    const result = normalizeAnthropicToolUseInputs(body);

    expect(result.fixedCount).toBe(1);
    const normalizedInput = (result.body.messages as Array<any>)[0].content[0].input;
    expect(normalizedInput).toEqual({
      filePath: "app/today/page.tsx",
      edits: [{ oldString: "a", newString: "b" }],
    });
  });

  it("replaces non-object tool_use input with recovery placeholder", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_2",
              name: "editFile",
              input: "[1,2,3]",
            },
          ],
        },
      ],
    };

    const result = normalizeAnthropicToolUseInputs(body);

    expect(result.fixedCount).toBe(1);
    const normalizedInput = (result.body.messages as Array<any>)[0].content[0].input;
    expect(normalizedInput).toEqual({
      _recoveredInvalidToolUseInput: true,
      _inputType: "string",
    });
  });
});
