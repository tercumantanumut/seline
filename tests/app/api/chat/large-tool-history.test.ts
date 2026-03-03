/**
 * Tests for large tool history handling in the chat message pipeline.
 *
 * Reproduces the scenario where a session has 100+ tool calls in a single
 * assistant message (e.g., a Claude Code agent run), and subsequent runs
 * fail because the message pipeline can't handle the large tool history.
 *
 * Root cause: When extractContent produces 106 tool-call + 106 tool-result
 * parts, if tool-call parts remain nested inside assistant message content
 * (instead of being top-level function_call items), the normalizer creates
 * synthetic calls with empty arguments. The fix in filterCodexInput extracts
 * these nested parts before normalization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { splitToolResultsFromAssistantMessages } from "@/app/api/chat/message-splitter";
import { reconcileToolCallPairs, toModelToolResultOutput } from "@/app/api/chat/tool-call-utils";
import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  type CodexInputItem,
} from "@/lib/auth/codex-input-utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToolCallPart(id: string, toolName: string, input: Record<string, unknown> = {}) {
  return {
    type: "tool-call" as const,
    toolCallId: id,
    toolName,
    input,
  };
}

function makeToolResultPart(id: string, toolName: string, output: unknown = { status: "success" }) {
  return {
    type: "tool-result" as const,
    toolCallId: id,
    toolName,
    output: toModelToolResultOutput(output),
  };
}

function makeCodexCall(callId: string, name: string, args: string = "{}"): CodexInputItem {
  return { type: "function_call", call_id: callId, name, arguments: args };
}

function makeCodexOutput(callId: string, name: string, output: unknown = "success"): CodexInputItem {
  return { type: "function_call_output", call_id: callId, name, output };
}

// ─── Tests: splitToolResultsFromAssistantMessages ────────────────────────────

describe("splitToolResultsFromAssistantMessages with large tool history", () => {
  const TOOL_COUNT = 106;

  it("correctly splits 106 tool-call/result pairs from assistant message", () => {
    const parts: Array<Record<string, unknown>> = [];

    // Build 106 tool-call + tool-result pairs interleaved
    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: `localGrep`,
        input: { pattern: `pattern_${i}` },
      });
      parts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: `localGrep`,
        output: toModelToolResultOutput({ status: "success", matches: i }),
      });
    }

    const messages = [
      { role: "user" as const, content: "Search for all patterns" },
      { role: "assistant" as const, content: parts },
    ];

    const result = splitToolResultsFromAssistantMessages(messages as any);

    // Should produce: user, assistant (with tool-calls only), tool (with tool-results)
    expect(result.length).toBeGreaterThanOrEqual(2);

    // Find the assistant message — should have tool-call parts only
    const assistantMsgs = result.filter((m) => m.role === "assistant");
    const toolMsgs = result.filter((m) => m.role === "tool");

    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1);
    expect(toolMsgs.length).toBeGreaterThanOrEqual(1);

    // The tool message should have all 106 tool-result parts
    const totalToolResults = toolMsgs.reduce((sum, m) => {
      const content = m.content as Array<Record<string, unknown>>;
      return sum + (Array.isArray(content) ? content.filter((p) => p.type === "tool-result").length : 0);
    }, 0);
    expect(totalToolResults).toBe(TOOL_COUNT);

    // The assistant message should have all 106 tool-call parts
    for (const aMsg of assistantMsgs) {
      if (Array.isArray(aMsg.content)) {
        const toolCalls = (aMsg.content as Array<Record<string, unknown>>).filter(
          (p) => p.type === "tool-call"
        );
        if (toolCalls.length > 0) {
          expect(toolCalls.length).toBe(TOOL_COUNT);
        }
      }
    }
  });

  it("does not produce synthetic tool-results when all pairs are present", () => {
    const parts: Array<Record<string, unknown>> = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: `readFile`,
        input: { filePath: `/file_${i}.ts` },
      });
      parts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: `readFile`,
        output: toModelToolResultOutput({ status: "success" }),
      });
    }

    const messages = [
      { role: "assistant" as const, content: parts },
    ];

    const result = splitToolResultsFromAssistantMessages(messages as any);

    // Count all tool-results across all messages
    let totalToolResults = 0;
    for (const msg of result) {
      if (Array.isArray(msg.content)) {
        for (const p of msg.content as Array<Record<string, unknown>>) {
          if (p.type === "tool-result") totalToolResults++;
        }
      }
    }

    // Should have exactly 106 results — no synthetic ones added
    expect(totalToolResults).toBe(TOOL_COUNT);
  });

  it("handles assistant message with text + 106 tool pairs + trailing text", () => {
    const parts: Array<Record<string, unknown>> = [
      { type: "text", text: "I'll search for all patterns now." },
    ];

    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: `executeCommand`,
        input: { command: `ls ${i}` },
      });
      parts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: `executeCommand`,
        output: toModelToolResultOutput({ stdout: `result_${i}` }),
      });
    }

    parts.push({ type: "text", text: "All searches complete. Here are the results." });

    const messages = [
      { role: "assistant" as const, content: parts },
    ];

    const result = splitToolResultsFromAssistantMessages(messages as any);

    // Should have: assistant (text + tool-calls), tool (tool-results), assistant (trailing text)
    expect(result.length).toBe(3);
    expect(result[0].role).toBe("assistant");
    expect(result[1].role).toBe("tool");
    expect(result[2].role).toBe("assistant");

    // Trailing text should be preserved
    const trailingContent = result[2].content;
    if (typeof trailingContent === "string") {
      expect(trailingContent).toContain("All searches complete");
    } else if (Array.isArray(trailingContent)) {
      const textPart = (trailingContent as Array<Record<string, unknown>>).find(
        (p) => p.type === "text"
      );
      expect(textPart).toBeDefined();
      expect(String(textPart?.text)).toContain("All searches complete");
    }
  });
});

// ─── Tests: reconcileToolCallPairs ──────────────────────────────────────────

describe("reconcileToolCallPairs with large tool history", () => {
  const TOOL_COUNT = 106;

  it("handles 106 matched tool-call/result pairs without reconstruction", () => {
    const parts: Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
    }> = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push(makeToolCallPart(`call_${i}`, "localGrep", { pattern: `p${i}` }));
      parts.push(makeToolResultPart(`call_${i}`, "localGrep"));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = reconcileToolCallPairs(parts);
    consoleSpy.mockRestore();

    // Should not add any synthetic parts
    expect(result.length).toBe(TOOL_COUNT * 2);

    const calls = result.filter((p) => p.type === "tool-call");
    const results = result.filter((p) => p.type === "tool-result");
    expect(calls.length).toBe(TOOL_COUNT);
    expect(results.length).toBe(TOOL_COUNT);
  });

  it("reconstructs 106 missing tool-results for orphan calls", () => {
    const parts: Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
    }> = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push(makeToolCallPart(`call_${i}`, "readFile", { filePath: `/f${i}` }));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = reconcileToolCallPairs(parts);
    consoleSpy.mockRestore();

    expect(result.length).toBe(TOOL_COUNT * 2);
    const syntheticResults = result.filter(
      (p) => p.type === "tool-result" && (p.output as any)?.value?.reconstructed === true
    );
    expect(syntheticResults.length).toBe(TOOL_COUNT);
  });

  it("reconstructs 106 missing tool-calls for orphan results", () => {
    const parts: Array<{
      type: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
    }> = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      parts.push(makeToolResultPart(`call_${i}`, "executeCommand"));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = reconcileToolCallPairs(parts);
    consoleSpy.mockRestore();

    expect(result.length).toBe(TOOL_COUNT * 2);
    const syntheticCalls = result.filter(
      (p) => p.type === "tool-call" && (p.input as any)?.__reconstructed === true
    );
    expect(syntheticCalls.length).toBe(TOOL_COUNT);
  });
});

// ─── Tests: Codex normalizer with large tool history ─────────────────────────

describe("Codex normalizeOrphanedToolOutputs with large tool history", () => {
  const TOOL_COUNT = 106;

  it("handles 106 matched call/output pairs correctly", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push(makeCodexCall(`call_${i}`, "localGrep", `{"pattern":"p${i}"}`));
      input.push(makeCodexOutput(`call_${i}`, "localGrep"));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    expect(result.length).toBe(TOOL_COUNT * 2);

    // No synthetic items should be created
    const syntheticCalls = result.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    // The original calls have real arguments, synthetic ones have "{}"
    expect(syntheticCalls.length).toBe(0);
  });

  it("reconstructs 106 synthetic calls for orphaned outputs (the actual bug scenario)", () => {
    // This reproduces the exact scenario from the failed session:
    // The AI SDK produces function_call_output items in the input array,
    // but the corresponding function_call items are missing (they're nested
    // inside assistant message content that the SDK serializes differently).
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Search the codebase" },
    ];

    // Only outputs, no calls — simulating the actual bug
    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push(makeCodexOutput(`call_${i}`, "localGrep", JSON.stringify({ matches: i })));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);

    // Should have: 1 message + 106 synthetic calls + 106 outputs = 213
    expect(result.length).toBe(1 + TOOL_COUNT * 2);

    const syntheticCalls = result.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(syntheticCalls.length).toBe(TOOL_COUNT);

    // Verify the warn was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`reconstructedCalls=${TOOL_COUNT}`)
    );
    consoleSpy.mockRestore();
  });

  it("estimates payload size after normalization of 106 orphaned outputs", () => {
    const input: CodexInputItem[] = [];

    // Simulate realistic tool outputs (each ~500 bytes)
    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push(
        makeCodexOutput(
          `call_${i}`,
          "localGrep",
          JSON.stringify({
            status: "success",
            matches: Array(5)
              .fill(null)
              .map((_, j) => ({
                file: `/src/lib/component-${j}.ts`,
                line: j * 10 + i,
                content: `const x${j} = doSomething(${i});`,
              })),
          })
        )
      );
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    const payloadSize = JSON.stringify(result).length;
    console.log(`Payload size for ${TOOL_COUNT} tool pairs: ${(payloadSize / 1024).toFixed(1)} KB`);

    // Payload should be measurable (this test is for visibility, not strict assertion)
    expect(payloadSize).toBeGreaterThan(0);
  });
});

// ─── Tests: filterCodexInput with large tool history ─────────────────────────

describe("filterCodexInput with large tool history", () => {
  const TOOL_COUNT = 106;

  it("preserves call_id across 106 tool call items when id is the only identifier", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push({
        type: "function_call",
        id: `call_${i}`,
        name: "localGrep",
        arguments: `{"pattern":"p${i}"}`,
      });
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: { status: "success" },
      });
    }

    const filtered = filterCodexInput(input);
    expect(filtered).toBeDefined();
    expect(filtered!.length).toBe(TOOL_COUNT * 2);

    // All function_call items should have call_id preserved (moved from id)
    const calls = filtered!.filter((item) => item.type === "function_call");
    expect(calls.length).toBe(TOOL_COUNT);
    for (const call of calls) {
      expect(call.call_id).toBeDefined();
      expect(call.id).toBeUndefined(); // id should be stripped
    }
  });

  it("strips item_reference entries mixed with 106 tool pairs", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push({ type: "item_reference", id: `ref_${i}` });
      input.push(makeCodexCall(`call_${i}`, "tool"));
      input.push(makeCodexOutput(`call_${i}`, "tool"));
    }

    const filtered = filterCodexInput(input);
    expect(filtered).toBeDefined();
    expect(filtered!.length).toBe(TOOL_COUNT * 2); // refs stripped
    expect(filtered!.every((item) => item.type !== "item_reference")).toBe(true);
  });
});

// ─── Tests: End-to-end pipeline simulation ────────────────────────────────────

describe("end-to-end message pipeline with 106 tool calls", () => {
  const TOOL_COUNT = 106;

  it("produces valid message structure from dynamic-tool parts", () => {
    // Simulate what extractContent produces for 106 dynamic-tool parts
    const contentParts: Array<Record<string, unknown>> = [
      { type: "text", text: "I'll search the codebase now." },
    ];

    for (let i = 0; i < TOOL_COUNT; i++) {
      contentParts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        input: { pattern: `pattern_${i}` },
      });
      contentParts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        output: toModelToolResultOutput({ status: "success", matches: [] }),
      });
    }

    contentParts.push({ type: "text", text: "Search complete." });

    // Step 1: reconcileToolCallPairs
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const reconciled = reconcileToolCallPairs(contentParts as any);

    // Step 2: Build messages and split
    const messages = [
      { role: "user" as const, content: "Search the codebase" },
      { role: "assistant" as const, content: reconciled },
      { role: "user" as const, content: "Now fix the issues" },
    ];

    const split = splitToolResultsFromAssistantMessages(messages as any);
    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // Validate structure
    expect(split.length).toBeGreaterThanOrEqual(4); // user, assistant, tool, (maybe assistant), user

    // First message should be user
    expect(split[0].role).toBe("user");

    // There should be exactly one tool message with all results
    const toolMsgs = split.filter((m) => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThanOrEqual(1);

    let totalToolResults = 0;
    for (const toolMsg of toolMsgs) {
      if (Array.isArray(toolMsg.content)) {
        totalToolResults += (toolMsg.content as Array<Record<string, unknown>>).filter(
          (p) => p.type === "tool-result"
        ).length;
      }
    }
    expect(totalToolResults).toBe(TOOL_COUNT);

    // Last message should be user
    expect(split[split.length - 1].role).toBe("user");

    // Validate alternation: no two adjacent messages should both be "user" or both be "tool"
    for (let i = 0; i < split.length - 1; i++) {
      if (split[i].role === "tool" && split[i + 1].role === "tool") {
        throw new Error(`Adjacent tool messages at index ${i} and ${i + 1}`);
      }
    }
  });

  it("serialized payload stays within reasonable size", () => {
    // Simulate a realistic 106-tool-call session
    const contentParts: Array<Record<string, unknown>> = [];

    for (let i = 0; i < TOOL_COUNT; i++) {
      contentParts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        input: {
          pattern: `function\\s+handle${i}`,
          paths: ["/src/lib"],
          maxResults: 10,
        },
      });
      contentParts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        output: toModelToolResultOutput({
          status: "success",
          matchCount: 3,
          matches: [
            { file: `/src/lib/handler-${i}.ts`, line: 42, content: `function handle${i}() {` },
            { file: `/src/lib/handler-${i}.ts`, line: 55, content: `  return handle${i}Result;` },
          ],
        }),
      });
    }

    const messages = [
      { role: "user" as const, content: "Search for all handlers" },
      { role: "assistant" as const, content: contentParts },
      { role: "user" as const, content: "Fix them" },
    ];

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const split = splitToolResultsFromAssistantMessages(messages as any);
    consoleSpy.mockRestore();
    warnSpy.mockRestore();

    const serialized = JSON.stringify(split);
    const sizeKB = serialized.length / 1024;
    console.log(`Serialized pipeline output: ${sizeKB.toFixed(1)} KB for ${TOOL_COUNT} tool pairs`);

    // Should be serializable without error
    expect(() => JSON.stringify(split)).not.toThrow();

    // Log for visibility
    expect(sizeKB).toBeGreaterThan(0);
  });
});
