import { describe, expect, it } from "vitest";

import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  type CodexInputItem,
} from "@/lib/auth/codex-input-utils";

describe("codex-input-utils", () => {
  it("strips item references and transient ids from codex input", () => {
    const input: CodexInputItem[] = [
      { type: "item_reference", id: "ref_1" },
      { type: "message", id: "msg_1", role: "user", content: "hello" },
    ];

    const filtered = filterCodexInput(input);

    expect(filtered).toEqual([{ type: "message", role: "user", content: "hello" }]);
  });

  it("keeps matched function call and output pairs", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", call_id: "call_1", name: "executeCommand", arguments: "{\"command\":\"pwd\"}" },
      { type: "function_call_output", call_id: "call_1", name: "executeCommand", output: { status: "success" } },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized).toEqual(input);
  });

  it("converts orphaned function calls into assistant messages", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", call_id: "call_1", name: "executeCommand", arguments: "{\"command\":\"ls\"}" },
      { type: "message", role: "user", content: "next prompt" },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized[0].type).toBe("message");
    expect(normalized[0].role).toBe("assistant");
    expect(String(normalized[0].content)).toContain("missing output");
    expect(String(normalized[0].content)).toContain("call_1");
  });

  it("converts orphaned function outputs into assistant messages", () => {
    const input: CodexInputItem[] = [
      { type: "function_call_output", call_id: "call_2", name: "executeCommand", output: { status: "success" } },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized[0].type).toBe("message");
    expect(normalized[0].role).toBe("assistant");
    expect(String(normalized[0].content)).toContain("result");
    expect(String(normalized[0].content)).toContain("call_2");
  });
});
