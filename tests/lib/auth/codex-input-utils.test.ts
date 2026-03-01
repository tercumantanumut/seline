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

  it("strips leaked internal tool-history fallback assistant messages", () => {
    const input: CodexInputItem[] = [
      {
        type: "message",
        role: "assistant",
        content:
          '[Previous tool result; call_id=call_legacy]: {"status":"success","stdout":"..."}',
      },
      { type: "message", role: "assistant", content: "real assistant text" },
    ];

    const filtered = filterCodexInput(input);

    expect(filtered).toEqual([
      { type: "message", role: "assistant", content: "real assistant text" },
    ]);
  });

  it("preserves tool correlation when call id is provided via id", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", id: "call_legacy", name: "executeCommand", arguments: "{\"command\":\"pwd\"}" },
      { type: "function_call_output", call_id: "call_legacy", name: "executeCommand", output: { status: "success" } },
    ];

    const filtered = filterCodexInput(input);
    expect(filtered?.[0]).toMatchObject({
      type: "function_call",
      call_id: "call_legacy",
      name: "executeCommand",
    });
    expect(filtered?.[0]).not.toHaveProperty("id");

    const normalized = normalizeOrphanedToolOutputs(filtered ?? []);
    expect(normalized).toEqual(filtered);
  });

  it("keeps matched function call and output pairs", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", call_id: "call_1", name: "executeCommand", arguments: "{\"command\":\"pwd\"}" },
      { type: "function_call_output", call_id: "call_1", name: "executeCommand", output: { status: "success" } },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized).toEqual(input);
  });

  it("reconstructs missing output for orphaned calls without converting to assistant text", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", call_id: "call_1", name: "executeCommand", arguments: "{\"command\":\"ls\"}" },
      { type: "message", role: "user", content: "next prompt" },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized[0]).toMatchObject({
      type: "function_call",
      call_id: "call_1",
      name: "executeCommand",
    });
    expect(normalized[1]).toMatchObject({
      type: "message",
      role: "user",
    });
    expect(normalized[2]).toMatchObject({
      type: "function_call_output",
      call_id: "call_1",
      name: "executeCommand",
      output: {
        status: "error",
        reconstructed: true,
      },
    });
    expect(normalized.some((item) => item.type === "message" && String(item.content).includes("[Previous"))).toBe(false);
  });

  it("reconstructs missing call before orphaned outputs", () => {
    const input: CodexInputItem[] = [
      { type: "function_call_output", call_id: "call_2", name: "executeCommand", output: { status: "success" } },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      type: "function_call",
      call_id: "call_2",
      name: "executeCommand",
    });
    expect(normalized[1]).toEqual(input[0]);
  });

  it("drops duplicate tool call/output events by call_id", () => {
    const input: CodexInputItem[] = [
      { type: "function_call", call_id: "call_dup", name: "executeCommand", arguments: "{\"command\":\"pwd\"}" },
      { type: "function_call", call_id: "call_dup", name: "executeCommand", arguments: "{\"command\":\"pwd\"}" },
      { type: "function_call_output", call_id: "call_dup", name: "executeCommand", output: { status: "success" } },
      { type: "function_call_output", call_id: "call_dup", name: "executeCommand", output: { status: "success" } },
    ];

    const normalized = normalizeOrphanedToolOutputs(input);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].type).toBe("function_call");
    expect(normalized[1].type).toBe("function_call_output");
  });
});
