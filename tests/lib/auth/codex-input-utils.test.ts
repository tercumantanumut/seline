import { describe, expect, it, vi } from "vitest";

import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  truncateCodexInput,
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

  it("does NOT extract nested tool-call parts from assistant content (regression: prevents orphan loop)", () => {
    // This test validates that nested tool-call parts inside assistant message
    // content arrays are kept in-place, NOT extracted to top-level function_call
    // items. Extracting them caused orphaned calls → synthetic error outputs →
    // model retries → infinite loop.
    const input: CodexInputItem[] = [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "text", text: "Let me search the codebase." },
          { type: "tool-call", toolCallId: "call_nested_1", toolName: "localGrep", input: { pattern: "foo" } },
          { type: "tool-call", toolCallId: "call_nested_2", toolName: "readFile", input: { filePath: "/bar.ts" } },
        ],
      },
    ];

    const filtered = filterCodexInput(input);

    // All nested tool-call parts should stay inside the assistant message
    expect(filtered).toHaveLength(1);
    expect(filtered![0].type).toBe("message");
    expect(filtered![0].role).toBe("assistant");
    expect(Array.isArray(filtered![0].content)).toBe(true);
    expect((filtered![0].content as unknown[]).length).toBe(3);

    // No top-level function_call items should have been created
    const topLevelCalls = filtered!.filter((item) => item.type === "function_call");
    expect(topLevelCalls).toHaveLength(0);
  });
});

describe("truncateCodexInput", () => {
  it("returns input unchanged when within limits", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "hello" },
      { type: "function_call", call_id: "call_1", name: "tool", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", name: "tool", output: "ok" },
    ];

    const result = truncateCodexInput(input);
    expect(result).toEqual(input);
  });

  it("caps oversized tool output content instead of dropping pairs", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create 50 tool pairs with 20KB outputs each = ~1MB total (exceeds 900KB limit)
    const bigOutput = "x".repeat(20 * 1024); // 20 KB each
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "search" },
    ];

    for (let i = 0; i < 50; i++) {
      input.push({ type: "function_call", call_id: `call_${i}`, name: "readFile", arguments: `{"filePath":"/big_${i}.ts"}` });
      input.push({ type: "function_call_output", call_id: `call_${i}`, name: "readFile", output: bigOutput });
    }

    input.push({ type: "message", role: "user", content: "now fix it" });

    // Verify payload exceeds limit before truncation
    const originalSize = JSON.stringify(input).length;
    expect(originalSize).toBeGreaterThan(900 * 1024);

    const result = truncateCodexInput(input);

    // All 102 items should be preserved (no pairs dropped — outputs capped instead)
    expect(result).toHaveLength(102);

    // Big outputs should have been capped
    const cappedOutputs = result.filter(
      (item) => item.type === "function_call_output" &&
        typeof item.output === "string" &&
        (item.output as string).includes("[... truncated")
    );
    expect(cappedOutputs.length).toBe(50);

    // Each capped output should be smaller than original
    for (const item of cappedOutputs) {
      expect((item.output as string).length).toBeLessThan(bigOutput.length);
    }

    // All call/output pairs preserved — model knows what it did
    for (let i = 0; i < 50; i++) {
      expect(result.some((item) => item.type === "function_call" && item.call_id === `call_${i}`)).toBe(true);
      expect(result.some((item) => item.type === "function_call_output" && item.call_id === `call_${i}`)).toBe(true);
    }

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("prevents amnesia: all tool call IDs remain after truncation", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate 50 tool calls with large outputs (realistic session)
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Search the codebase" },
    ];

    for (let i = 0; i < 50; i++) {
      input.push({
        type: "function_call",
        call_id: `call_${i}`,
        name: "readFile",
        arguments: `{"filePath":"/file_${i}.ts"}`,
      });
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "readFile",
        output: "x".repeat(15 * 1024), // 15 KB each — will be capped
      });
    }

    input.push({ type: "message", role: "user", content: "Now fix everything" });

    const result = truncateCodexInput(input);

    // Every call_id should still be present in the result
    for (let i = 0; i < 50; i++) {
      const callExists = result.some(
        (item) => item.type === "function_call" && item.call_id === `call_${i}`
      );
      const outputExists = result.some(
        (item) => item.type === "function_call_output" && item.call_id === `call_${i}`
      );
      expect(callExists).toBe(true);
      expect(outputExists).toBe(true);
    }

    // User messages preserved
    expect(result[0].content).toBe("Search the codebase");
    expect(result[result.length - 1].content).toBe("Now fix everything");

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
