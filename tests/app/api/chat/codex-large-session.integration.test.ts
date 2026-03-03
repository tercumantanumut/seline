/**
 * Integration test for the Codex provider with large session tool histories.
 *
 * Reproduces the exact failure scenario from session 96dcffd3:
 * - 106 tool calls in a single assistant message
 * - Subsequent chat runs fail with "Unknown error" (4.5s) or hang (35 min)
 *
 * Root cause: nested tool-call parts inside assistant message content were
 * invisible to normalizeOrphanedToolOutputs, causing 106 synthetic calls
 * with arguments: "{}". The fix extracts these nested parts in filterCodexInput.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { splitToolResultsFromAssistantMessages } from "@/app/api/chat/message-splitter";
import { reconcileToolCallPairs, toModelToolResultOutput } from "@/app/api/chat/tool-call-utils";
import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  truncateCodexInput,
  MAX_CODEX_INPUT_ITEMS,
  MAX_CODEX_PAYLOAD_BYTES,
  type CodexInputItem,
} from "@/lib/auth/codex-input-utils";
import { transformCodexRequest } from "@/lib/auth/codex-request";

// ─── Reproduce the exact production failure scenario ─────────────────────────

describe("Codex large session: production failure reproduction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reproduces the 106-tool-call session pipeline end-to-end", async () => {
    const TOOL_COUNT = 106;

    // Phase 1: Simulate what extractContent produces for 106 dynamic-tool parts
    const contentParts: Array<Record<string, unknown>> = [
      { type: "text", text: "I'll search the codebase now." },
    ];

    for (let i = 0; i < TOOL_COUNT; i++) {
      contentParts.push({
        type: "tool-call",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        input: { pattern: `handler_${i}`, paths: ["/src/lib"] },
      });
      contentParts.push({
        type: "tool-result",
        toolCallId: `call_${i}`,
        toolName: "localGrep",
        output: toModelToolResultOutput({
          status: "success",
          matchCount: 2,
          matches: [
            { file: `/src/lib/handler-${i}.ts`, line: 42, content: `export function handler_${i}()` },
          ],
        }),
      });
    }

    contentParts.push({ type: "text", text: "Search complete. Found all handlers." });

    // Phase 2: reconcileToolCallPairs
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const reconciled = reconcileToolCallPairs(contentParts as any);

    // Phase 3: splitToolResultsFromAssistantMessages
    const messages = [
      { role: "user" as const, content: "Search the codebase for all handlers" },
      { role: "assistant" as const, content: reconciled },
      { role: "user" as const, content: "Now fix the authentication bug" },
    ] as any[];

    const split = splitToolResultsFromAssistantMessages(messages);

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // Validate message structure
    expect(split.length).toBeGreaterThanOrEqual(4);

    // Validate tool messages follow assistant messages
    for (let i = 0; i < split.length; i++) {
      if (split[i].role === "tool") {
        expect(split[i - 1]?.role).toBe("assistant");
      }
    }

    // Validate all 106 tool results are present
    let totalToolResults = 0;
    for (const msg of split) {
      if (Array.isArray(msg.content)) {
        totalToolResults += (msg.content as Array<Record<string, unknown>>).filter(
          (p) => p.type === "tool-result"
        ).length;
      }
    }
    expect(totalToolResults).toBe(TOOL_COUNT);

    // Last message is user
    expect(split[split.length - 1].role).toBe("user");
    expect(split[split.length - 1].content).toBe("Now fix the authentication bug");
  });

  it("filterCodexInput extracts nested tool-calls, eliminating synthetic empty-arg calls", () => {
    const TOOL_COUNT = 106;

    // Simulate what reaches filterCodexInput when the AI SDK leaves nested
    // tool-call parts inside the assistant message content array.
    const codexInput: CodexInputItem[] = [
      { type: "message", role: "user", content: "Search the codebase" },
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "text", text: "I'll search now." },
          ...Array.from({ length: TOOL_COUNT }, (_, i) => ({
            type: "tool-call",
            toolCallId: `call_${i}`,
            toolName: "localGrep",
            input: { pattern: `handler_${i}`, paths: ["/src/lib"] },
          })),
        ],
      },
    ];

    // Top-level tool outputs for the same call IDs
    for (let i = 0; i < TOOL_COUNT; i++) {
      codexInput.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: JSON.stringify({
          status: "success",
          matchCount: 2,
          matches: [
            { file: `/src/lib/handler-${i}.ts`, line: 42, content: `handler_${i}()` },
          ],
        }),
      });
    }

    codexInput.push({ type: "message", role: "assistant", content: "Found all handlers." });
    codexInput.push({ type: "message", role: "user", content: "Fix the bug" });

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Step 1: Filter — extracts nested tool-calls from assistant content
    const filtered = filterCodexInput(codexInput) || [];

    // The assistant message originally had 106 nested tool-calls that are now top-level.
    // Original: 1 user + 1 assistant(with nested) + 106 outputs + 1 assistant + 1 user = 110
    // After extraction: 1 user + 1 assistant(text only) + 106 function_calls + 106 outputs + 1 assistant + 1 user = 216
    expect(filtered.length).toBe(codexInput.length + TOOL_COUNT);

    // Step 2: Normalize orphaned outputs
    const normalized = normalizeOrphanedToolOutputs(filtered);

    // ROOT CAUSE FIX: No synthetic empty-arg calls should be created because
    // filterCodexInput already extracted the tool calls as top-level function_call items.
    const syntheticCalls = normalized.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(syntheticCalls.length).toBe(0);

    // All call/output pairs should be matched
    const calls = normalized.filter((item) => item.type === "function_call");
    const outputs = normalized.filter((item) => item.type === "function_call_output");
    expect(calls.length).toBe(TOOL_COUNT);
    expect(outputs.length).toBe(TOOL_COUNT);

    // All extracted calls should have real arguments (JSON stringified input)
    for (const call of calls) {
      expect(call.arguments).not.toBe("{}");
      expect(() => JSON.parse(call.arguments as string)).not.toThrow();
    }

    // Step 3: Truncate if needed
    const truncated = truncateCodexInput(normalized);

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // Should stay within limits
    expect(truncated.length).toBeLessThanOrEqual(MAX_CODEX_INPUT_ITEMS);
    const payloadSize = JSON.stringify(truncated).length;
    expect(payloadSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);

    // The last user message must always be preserved
    const lastItem = truncated[truncated.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.role).toBe("user");
    expect(lastItem.content).toBe("Fix the bug");
  });

  it("regression: real failing envelope (~110 items / ~940KB) with nested calls", () => {
    const TOOL_COUNT = 106;
    const LARGE_OUTPUT = "x".repeat(9_000); // ~9KB per output, ~950KB total

    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Search everything" },
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "text", text: "Starting batch search" },
          ...Array.from({ length: TOOL_COUNT }, (_, i) => ({
            type: "tool-call",
            toolCallId: `call_${i}`,
            toolName: "localGrep",
            input: { pattern: `pattern_${i}`, paths: ["/src"] },
          })),
        ],
      },
      ...Array.from({ length: TOOL_COUNT }, (_, i) => ({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: LARGE_OUTPUT,
      } as CodexInputItem)),
      { type: "message", role: "assistant", content: "Done." },
      { type: "message", role: "user", content: "Continue" },
    ];

    // Baseline: nested-call envelope is ~110 items but ~940KB
    expect(input.length).toBe(110);
    const baselineBytes = JSON.stringify(input).length;
    expect(baselineBytes).toBeGreaterThan(900 * 1024);
    expect(baselineBytes).toBeLessThan(1100 * 1024);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const filtered = filterCodexInput(input) ?? [];
    const normalized = normalizeOrphanedToolOutputs(filtered);

    // Calls should be extracted from assistant content, not synthesized as "{}"
    const extractedCalls = normalized.filter((item) => item.type === "function_call");
    const syntheticCalls = normalized.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(extractedCalls.length).toBe(TOOL_COUNT);
    expect(syntheticCalls.length).toBe(0);

    // After extraction: 110 original + 106 extracted = 216 items
    expect(normalized.length).toBe(input.length + TOOL_COUNT);

    // Final: truncation MUST trigger because 216 items > 200 limit
    // AND ~950KB+ is close to/exceeds 1MB limit
    const truncated = truncateCodexInput(normalized);
    expect(truncated.length).toBeLessThanOrEqual(MAX_CODEX_INPUT_ITEMS);
    expect(JSON.stringify(truncated).length).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);

    // Last user message preserved
    const lastItem = truncated[truncated.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.role).toBe("user");
    expect(lastItem.content).toBe("Continue");

    consoleSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("transformCodexRequest produces valid output for 106-tool session", async () => {
    const TOOL_COUNT = 106;

    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Search the codebase" },
    ];

    // Matched pairs (best case — already top-level)
    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push({
        type: "function_call",
        call_id: `call_${i}`,
        name: "localGrep",
        arguments: JSON.stringify({ pattern: `handler_${i}` }),
      });
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: JSON.stringify({ status: "success", matchCount: 2 }),
      });
    }

    input.push({ type: "message", role: "user", content: "Fix it" });

    const body: Record<string, any> = {
      model: "gpt-5.3-codex-high",
      input,
      stream: true,
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await transformCodexRequest(body, "You are helpful.");

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // Should be JSON-serializable without error
    expect(() => JSON.stringify(result)).not.toThrow();

    // Should have required fields
    expect(result.model).toBeDefined();
    expect(result.stream).toBe(true);
    expect(result.instructions).toBe("You are helpful.");
    expect(Array.isArray(result.input)).toBe(true);

    // Payload should be within limits
    const payloadSize = JSON.stringify(result).length;
    expect(payloadSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);
  });
});

// ─── Truncation correctness ──────────────────────────────────────────────────

describe("truncateCodexInput correctness", () => {
  it("preserves all items when under limits", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Hello" },
      { type: "function_call", call_id: "c1", name: "tool", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", name: "tool", output: "ok" },
      { type: "message", role: "user", content: "Bye" },
    ];

    const result = truncateCodexInput(input);
    expect(result).toEqual(input);
  });

  it("truncates oldest tool pairs when exceeding item count", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Start" },
    ];

    // Create 250 tool pairs (500 items) to exceed MAX_CODEX_INPUT_ITEMS (400)
    for (let i = 0; i < 250; i++) {
      input.push({ type: "function_call", call_id: `c${i}`, name: "tool", arguments: `{"i":${i}}` });
      input.push({ type: "function_call_output", call_id: `c${i}`, name: "tool", output: `r${i}` });
    }

    input.push({ type: "message", role: "user", content: "Continue" });

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = truncateCodexInput(input);
    consoleSpy.mockRestore();

    // Should be truncated
    expect(result.length).toBeLessThanOrEqual(MAX_CODEX_INPUT_ITEMS);

    // First message preserved
    expect(result[0].type).toBe("message");
    expect(result[0].content).toBe("Start");

    // Last message preserved
    const lastItem = result[result.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.content).toBe("Continue");

    // Should still have some tool pairs (the most recent ones)
    const calls = result.filter((item) => item.type === "function_call");
    const outputs = result.filter((item) => item.type === "function_call_output");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBe(outputs.length);

    // The most recent tool pair should be preserved (c249)
    expect(calls.some((c) => c.call_id === "c249")).toBe(true);
    expect(outputs.some((o) => o.call_id === "c249")).toBe(true);
  });

  it("truncates by payload size for large tool outputs", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Start" },
    ];

    // Create 30 tool pairs with large outputs (~80KB each = ~2.4MB total)
    const largeOutput = "x".repeat(80 * 1024);
    for (let i = 0; i < 30; i++) {
      input.push({ type: "function_call", call_id: `c${i}`, name: "readFile", arguments: `{"f":"${i}"}` });
      input.push({
        type: "function_call_output",
        call_id: `c${i}`,
        name: "readFile",
        output: largeOutput,
      });
    }

    input.push({ type: "message", role: "user", content: "Analyze" });

    // Total > MAX_CODEX_PAYLOAD_BYTES (1MB)
    const originalSize = JSON.stringify(input).length;
    expect(originalSize).toBeGreaterThan(MAX_CODEX_PAYLOAD_BYTES);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = truncateCodexInput(input);
    consoleSpy.mockRestore();

    const truncatedSize = JSON.stringify(result).length;
    expect(truncatedSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);

    // Last message preserved
    const lastItem = result[result.length - 1];
    expect(lastItem.content).toBe("Analyze");

    // Some tool pairs should remain (most recent)
    const calls = result.filter((item) => item.type === "function_call");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(30);
  });

  it("handles edge case: no tool items in input", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Hello" },
      { type: "message", role: "assistant", content: "Hi" },
      { type: "message", role: "user", content: "Bye" },
    ];

    const result = truncateCodexInput(input);
    expect(result).toEqual(input);
  });

  it("handles edge case: all items are tool items", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < 250; i++) {
      input.push({ type: "function_call", call_id: `c${i}`, name: "tool", arguments: `{"i":${i}}` });
      input.push({ type: "function_call_output", call_id: `c${i}`, name: "tool", output: `r${i}` });
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = truncateCodexInput(input);
    consoleSpy.mockRestore();

    expect(result.length).toBeLessThanOrEqual(MAX_CODEX_INPUT_ITEMS);

    // Most recent pairs preserved
    const calls = result.filter((item) => item.type === "function_call");
    expect(calls.some((c) => c.call_id === "c249")).toBe(true);
  });
});

// ─── Error surfacing ──────────────────────────────────────────────────────────

describe("error surfacing for large sessions", () => {
  it("transformCodexRequest does not throw for oversized input", async () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Start" },
    ];

    // Create huge input
    for (let i = 0; i < 200; i++) {
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: JSON.stringify({ data: "x".repeat(2000) }),
      });
    }

    input.push({ type: "message", role: "user", content: "Continue" });

    const body: Record<string, any> = {
      model: "gpt-5.3-codex-high",
      input,
      stream: true,
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Should NOT throw
    const result = await transformCodexRequest(body, "You are helpful.");

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    expect(result).toBeDefined();
    const resultInput = result.input as CodexInputItem[];
    expect(resultInput.length).toBeLessThanOrEqual(MAX_CODEX_INPUT_ITEMS);
  });
});
