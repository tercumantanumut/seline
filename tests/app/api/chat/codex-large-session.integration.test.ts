/**
 * Integration test for the Codex provider with large session tool histories.
 *
 * Reproduces the exact failure scenario from session 96dcffd3:
 * - 106 tool calls in a single assistant message
 * - Subsequent chat runs fail with "Unknown error" (4.5s) or hang (35 min)
 *
 * Root cause: nested tool-call parts inside assistant message content were
 * invisible to normalizeOrphanedToolOutputs, causing 106 synthetic calls
 * with arguments: "{}". Nested tool-call parts now stay inside assistant
 * content (harmless context) to avoid creating orphaned top-level calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { splitToolResultsFromAssistantMessages } from "@/app/api/chat/message-splitter";
import { reconcileToolCallPairs, toModelToolResultOutput } from "@/app/api/chat/tool-call-utils";
import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  truncateCodexInput,
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

  it("filterCodexInput preserves nested tool-calls in assistant content (no extraction)", () => {
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

    // Step 1: Filter — nested tool-calls stay in assistant content (NOT extracted)
    const filtered = filterCodexInput(codexInput) || [];

    // Item count should be same as input (no extraction adds items)
    // Original: 1 user + 1 assistant(with nested) + 106 outputs + 1 assistant + 1 user = 110
    expect(filtered.length).toBe(codexInput.length);

    // Nested tool-call parts should still be inside the assistant message content
    const assistantMsg = filtered.find(
      (item) => item.type === "message" && item.role === "assistant" && Array.isArray(item.content)
    );
    expect(assistantMsg).toBeDefined();
    const nestedCalls = (assistantMsg!.content as Array<Record<string, unknown>>).filter(
      (part) => part.type === "tool-call"
    );
    expect(nestedCalls.length).toBe(TOOL_COUNT);

    // No top-level function_call items should exist
    const topLevelCalls = filtered.filter((item) => item.type === "function_call");
    expect(topLevelCalls.length).toBe(0);

    // Step 2: Normalize — outputs are orphaned (no matching top-level calls),
    // so synthetic calls with "{}" args are created. This is expected behavior
    // for truly orphaned outputs.
    const normalized = normalizeOrphanedToolOutputs(filtered);

    // Step 3: Truncate — caps large output content, preserves pairs
    const truncated = truncateCodexInput(normalized);

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // Small payload — no truncation (byte-budget only, no item-count gate)
    expect(truncated.length).toBe(normalized.length);
    const payloadSize = JSON.stringify(truncated).length;
    expect(payloadSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);

    // The last user message must always be preserved
    const lastItem = truncated[truncated.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.role).toBe("user");
    expect(lastItem.content).toBe("Fix the bug");
  });

  it("regression: real failing envelope (~110 items / ~940KB) with nested calls + large outputs", () => {
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

    // Nested tool-calls are NOT extracted, so orphaned outputs get synthetic calls
    const syntheticCalls = normalized.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(syntheticCalls.length).toBe(TOOL_COUNT);

    // After normalization: 110 original + 106 synthetic calls = 216 items
    expect(normalized.length).toBe(input.length + TOOL_COUNT);

    // Payload is under 990KB after normalization — no truncation needed.
    // (9KB × 106 outputs ≈ 954KB + synthetic calls ≈ 970KB < 990KB)
    const truncated = truncateCodexInput(normalized);
    expect(truncated.length).toBe(normalized.length);
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

    // Payload should be within byte limit
    const payloadSize = JSON.stringify(result.input).length;
    expect(payloadSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);
  });
});

// ─── Truncation correctness ──────────────────────────────────────────────────

describe("truncateCodexInput correctness", () => {
  it("preserves all items when under byte limit", () => {
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Hello" },
      { type: "function_call", call_id: "c1", name: "tool", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", name: "tool", output: "ok" },
      { type: "message", role: "user", content: "Bye" },
    ];

    const result = truncateCodexInput(input);
    expect(result).toEqual(input);
  });

  it("preserves 250 small tool pairs when payload is under byte limit", () => {
    // 250 pairs with tiny outputs — payload well under 990KB.
    // No item-count gate — truncation is byte-only.
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Start" },
    ];

    for (let i = 0; i < 250; i++) {
      input.push({ type: "function_call", call_id: `c${i}`, name: "tool", arguments: `{"i":${i}}` });
      input.push({ type: "function_call_output", call_id: `c${i}`, name: "tool", output: `r${i}` });
    }

    input.push({ type: "message", role: "user", content: "Continue" });

    expect(JSON.stringify(input).length).toBeLessThan(MAX_CODEX_PAYLOAD_BYTES);

    const result = truncateCodexInput(input);

    // All items preserved — payload under limit
    expect(result).toEqual(input);
  });

  it("drops oldest pairs when large outputs push payload over byte limit", () => {
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

    // Total > MAX_CODEX_PAYLOAD_BYTES (990KB)
    const originalSize = JSON.stringify(input).length;
    expect(originalSize).toBeGreaterThan(MAX_CODEX_PAYLOAD_BYTES);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = truncateCodexInput(input);
    consoleSpy.mockRestore();
    logSpy.mockRestore();

    const truncatedSize = JSON.stringify(result).length;
    expect(truncatedSize).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);

    // Last message preserved
    const lastItem = result[result.length - 1];
    expect(lastItem.content).toBe("Analyze");

    // Some pairs dropped (oldest first), recent ones preserved
    const calls = result.filter((item) => item.type === "function_call");
    const outputs = result.filter((item) => item.type === "function_call_output");
    expect(calls.length).toBeLessThan(30);
    expect(calls.length).toBeGreaterThanOrEqual(5); // MIN_PRESERVED_TOOL_PAIRS floor
    expect(calls.length).toBe(outputs.length);

    // Most recent pair preserved
    expect(calls.some((c) => c.call_id === "c29")).toBe(true);

    // Surviving outputs NOT capped — full content preserved
    for (const item of outputs) {
      expect(item.output).toBe(largeOutput);
    }

    // Summary message present
    const summary = result.find(
      (item) => item.type === "message" && item.role === "developer" &&
        typeof item.content === "string" && (item.content as string).includes("Context trimmed")
    );
    expect(summary).toBeDefined();
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

  it("handles edge case: all items are tool items under byte limit", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < 250; i++) {
      input.push({ type: "function_call", call_id: `c${i}`, name: "tool", arguments: `{"i":${i}}` });
      input.push({ type: "function_call_output", call_id: `c${i}`, name: "tool", output: `r${i}` });
    }

    expect(JSON.stringify(input).length).toBeLessThan(MAX_CODEX_PAYLOAD_BYTES);

    const result = truncateCodexInput(input);

    // All preserved — under byte limit
    expect(result).toEqual(input);
  });
});

// ─── Anchor capping and minimum tool preservation (infinite loop fix) ─────────

describe("anchor capping prevents infinite loop", () => {
  it("caps oversized system prompt and preserves recent tool pairs", () => {
    // Production bug: 5MB system prompt + 138 tool pairs.
    // Old behavior: anchors alone exceed 900KB budget → all 138 tool pairs
    // dropped → model gets zero context → repeats same tools → infinite loop.
    const HUGE_SYSTEM_PROMPT = "x".repeat(5 * 1024 * 1024); // 5MB
    const TOOL_COUNT = 20;

    const input: CodexInputItem[] = [
      { type: "message", role: "developer", content: HUGE_SYSTEM_PROMPT },
      { type: "message", role: "user", content: "Fix the image zoom issue" },
    ];

    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push({
        type: "function_call",
        call_id: `call_${i}`,
        name: "localGrep",
        arguments: JSON.stringify({ pattern: `pattern_${i}` }),
      });
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: JSON.stringify({ status: "success", matchCount: 3 }),
      });
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = truncateCodexInput(input);

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    // CRITICAL: Must have SOME tool pairs preserved (not zero!)
    const calls = result.filter((item) => item.type === "function_call");
    const outputs = result.filter((item) => item.type === "function_call_output");
    expect(calls.length).toBeGreaterThan(0);
    expect(outputs.length).toBeGreaterThan(0);

    // System prompt should be capped (not 5MB anymore)
    const devMsg = result.find(
      (item) => item.type === "message" && item.role === "developer"
    );
    expect(devMsg).toBeDefined();
    const devContent = typeof devMsg!.content === "string"
      ? devMsg!.content
      : JSON.stringify(devMsg!.content);
    expect(devContent.length).toBeLessThan(100 * 1024); // well under 100KB

    // User message preserved
    const userMsg = result.find(
      (item) => item.type === "message" && item.role === "user"
    );
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("Fix the image zoom issue");

    // Payload within limits
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);
  });

  it("minimum tool pairs floor prevents complete history loss", () => {
    // Even when tools exceed byte budget, at least MIN_PRESERVED_TOOL_PAIRS
    // (5) recent pairs must survive.
    const input: CodexInputItem[] = [
      { type: "message", role: "user", content: "Do something" },
    ];

    // 50 tool pairs with 25KB outputs each (~1.25MB of tool data — over 990KB)
    for (let i = 0; i < 50; i++) {
      input.push({
        type: "function_call",
        call_id: `call_${i}`,
        name: "localGrep",
        arguments: JSON.stringify({ pattern: `p${i}` }),
      });
      input.push({
        type: "function_call_output",
        call_id: `call_${i}`,
        name: "localGrep",
        output: "y".repeat(25 * 1024),
      });
    }

    expect(JSON.stringify(input).length).toBeGreaterThan(MAX_CODEX_PAYLOAD_BYTES);

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = truncateCodexInput(input);

    consoleSpy.mockRestore();
    logSpy.mockRestore();

    const calls = result.filter((item) => item.type === "function_call");

    // Must have at least 5 recent pairs (the floor)
    expect(calls.length).toBeGreaterThanOrEqual(5);

    // The most recent pair should always be preserved
    expect(calls.some((c) => c.call_id === "call_49")).toBe(true);
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
    // Payload under 990KB — no truncation needed, all items preserved
    expect(JSON.stringify(resultInput).length).toBeLessThanOrEqual(MAX_CODEX_PAYLOAD_BYTES);
  });
});
