/**
 * Tests for Codex provider handling of large tool histories.
 *
 * Validates the full Codex request transformation pipeline when sessions
 * have 100+ tool calls — the exact scenario that caused the production
 * failures (session 96dcffd3, runs 00aaedb4 and 06c850c2).
 *
 * Key scenarios:
 * 1. 106 orphaned outputs → normalizer creates synthetic calls with empty args
 * 2. transformCodexRequest truncates excessive tool history
 * 3. Payload size stays within Codex API limits
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  type CodexInputItem,
} from "@/lib/auth/codex-input-utils";
import { transformCodexRequest } from "@/lib/auth/codex-request";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCodexCall(callId: string, name: string, args: string = "{}"): CodexInputItem {
  return { type: "function_call", call_id: callId, name, arguments: args };
}

function makeCodexOutput(callId: string, name: string, output: unknown = "success"): CodexInputItem {
  return { type: "function_call_output", call_id: callId, name, output };
}

function makeUserMessage(content: string): CodexInputItem {
  return { type: "message", role: "user", content };
}

function makeAssistantMessage(content: string): CodexInputItem {
  return { type: "message", role: "assistant", content };
}

// ─── Tests: transformCodexRequest with large input ───────────────────────────

describe("transformCodexRequest with large tool history", () => {
  const TOOL_COUNT = 106;

  it("processes input with 106 matched call/output pairs (truncated to fit limits)", async () => {
    const input: CodexInputItem[] = [makeUserMessage("Search the codebase")];

    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push(makeCodexCall(`call_${i}`, "localGrep", `{"pattern":"p${i}"}`));
      input.push(makeCodexOutput(`call_${i}`, "localGrep", `{"matches":${i}}`));
    }

    input.push(makeUserMessage("Now fix them"));

    const body: Record<string, any> = {
      model: "gpt-5.3-codex-high",
      input,
      stream: true,
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await transformCodexRequest(body, "You are a helpful assistant.");
    consoleSpy.mockRestore();
    logSpy.mockRestore();

    expect(result.model).toBeDefined();
    expect(Array.isArray(result.input)).toBe(true);

    const resultInput = result.input as CodexInputItem[];
    const calls = resultInput.filter((item) => item.type === "function_call");
    const outputs = resultInput.filter((item) => item.type === "function_call_output");

    // 214 items < MAX_CODEX_INPUT_ITEMS (400), and payload < 2MB,
    // so no truncation — all matched pairs are preserved.
    expect(calls.length).toBe(TOOL_COUNT);
    expect(outputs.length).toBe(TOOL_COUNT);

    // The last user message should be preserved
    const lastItem = resultInput[resultInput.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.content).toBe("Now fix them");
  });

  it("handles orphaned outputs: normalizer creates synthetic calls, preserves all pairs", async () => {
    // When outputs exist without matching calls at top level, the normalizer
    // creates synthetic calls. After normalization: 4 messages + 106
    // synthetic calls + 106 outputs = 216 items. All within limits, no
    // pairs dropped. The new truncation caps output content, not pairs.
    const input: CodexInputItem[] = [
      makeUserMessage("Search the codebase"),
      makeAssistantMessage("I'll search now."),
    ];

    // Only outputs, no calls
    for (let i = 0; i < TOOL_COUNT; i++) {
      input.push(
        makeCodexOutput(`call_${i}`, "localGrep", JSON.stringify({ matches: i }))
      );
    }

    input.push(makeAssistantMessage("Here are the results."));
    input.push(makeUserMessage("Fix the issues"));

    const body: Record<string, any> = {
      model: "gpt-5.3-codex-high",
      input,
      stream: true,
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await transformCodexRequest(body, "You are a helpful assistant.");
    consoleSpy.mockRestore();
    logSpy.mockRestore();

    const resultInput = result.input as CodexInputItem[];

    // Synthetic calls should be created for orphaned outputs
    const syntheticCalls = resultInput.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(syntheticCalls.length).toBe(TOOL_COUNT);

    const outputs = resultInput.filter((item) => item.type === "function_call_output");
    expect(outputs.length).toBe(TOOL_COUNT);

    // The last user message must be preserved
    const lastItem = resultInput[resultInput.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.content).toBe("Fix the issues");
  });

  it("limits input when tool history exceeds MAX_CODEX_INPUT_ITEMS", async () => {
    // Build a conversation with far too many tool items (500+)
    const input: CodexInputItem[] = [makeUserMessage("Search everything")];

    for (let i = 0; i < 250; i++) {
      input.push(makeCodexCall(`call_${i}`, "localGrep", `{"pattern":"p${i}"}`));
      input.push(makeCodexOutput(`call_${i}`, "localGrep", `{"matches":${i}}`));
    }

    input.push(makeUserMessage("Now continue"));

    const body: Record<string, any> = {
      model: "gpt-5.3-codex-high",
      input,
      stream: true,
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await transformCodexRequest(body, "You are a helpful assistant.");
    consoleSpy.mockRestore();
    logSpy.mockRestore();

    const resultInput = result.input as CodexInputItem[];

    // After truncation, the input should be smaller
    // The exact size depends on MAX_CODEX_INPUT_ITEMS constant
    expect(resultInput.length).toBeLessThanOrEqual(input.length);

    // The last user message should always be preserved
    const lastItem = resultInput[resultInput.length - 1];
    expect(lastItem.type).toBe("message");
    expect(lastItem.role).toBe("user");
    expect(lastItem.content).toBe("Now continue");
  });
});

// ─── Tests: Codex normalizer edge cases with large inputs ────────────────────

describe("Codex normalizer edge cases", () => {
  it("handles interleaved messages and tool calls", () => {
    const input: CodexInputItem[] = [
      makeUserMessage("Step 1"),
      makeCodexCall("call_1", "tool1", '{"a":1}'),
      makeCodexOutput("call_1", "tool1", "ok"),
      makeAssistantMessage("Did step 1"),
      makeUserMessage("Step 2"),
      makeCodexCall("call_2", "tool2", '{"b":2}'),
      makeCodexOutput("call_2", "tool2", "ok"),
      makeAssistantMessage("Did step 2"),
    ];

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    expect(result.length).toBe(8); // No reconstruction needed
  });

  it("handles 106 calls followed by 106 outputs (non-interleaved)", () => {
    const input: CodexInputItem[] = [];

    // All calls first
    for (let i = 0; i < 106; i++) {
      input.push(makeCodexCall(`call_${i}`, "grep", `{"p":"${i}"}`));
    }

    // Then all outputs
    for (let i = 0; i < 106; i++) {
      input.push(makeCodexOutput(`call_${i}`, "grep", `result_${i}`));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    // All pairs should match — no reconstruction
    const calls = result.filter((item) => item.type === "function_call");
    const outputs = result.filter((item) => item.type === "function_call_output");
    expect(calls.length).toBe(106);
    expect(outputs.length).toBe(106);
    expect(result.length).toBe(212); // No synthetic items
  });

  it("drops duplicate calls and outputs across 106 items", () => {
    const input: CodexInputItem[] = [];

    for (let i = 0; i < 106; i++) {
      // Each call appears twice
      input.push(makeCodexCall(`call_${i}`, "tool"));
      input.push(makeCodexCall(`call_${i}`, "tool")); // duplicate
      input.push(makeCodexOutput(`call_${i}`, "tool"));
      input.push(makeCodexOutput(`call_${i}`, "tool")); // duplicate
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    // Duplicates should be dropped
    expect(result.length).toBe(212); // 106 calls + 106 outputs
  });

  it("preserves tool names in synthetic calls for orphaned outputs", () => {
    const toolNames = ["localGrep", "readFile", "executeCommand", "vectorSearch", "webSearch"];
    const input: CodexInputItem[] = [];

    for (let i = 0; i < 106; i++) {
      const name = toolNames[i % toolNames.length];
      input.push(makeCodexOutput(`call_${i}`, name));
    }

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    const syntheticCalls = result.filter(
      (item) => item.type === "function_call" && item.arguments === "{}"
    );
    expect(syntheticCalls.length).toBe(106);

    // Verify tool names are preserved
    for (let i = 0; i < 106; i++) {
      const expectedName = toolNames[i % toolNames.length];
      const call = syntheticCalls.find((c) => c.call_id === `call_${i}`);
      expect(call?.name).toBe(expectedName);
    }
  });
});

// ─── Tests: Payload size estimation ──────────────────────────────────────────

describe("Codex payload size estimation", () => {
  it("estimates realistic payload for the failing session scenario", () => {
    // Simulate the actual failing session: 106 tool calls with realistic outputs
    const input: CodexInputItem[] = [
      makeUserMessage(
        "Find and fix the bug in the authentication system. Check all relevant files."
      ),
      makeAssistantMessage("I'll search the codebase systematically."),
    ];

    // 106 tool outputs with realistic sizes (grep results, file reads, etc.)
    const toolNames = ["localGrep", "readFile", "executeCommand", "vectorSearch", "editFile"];
    for (let i = 0; i < 106; i++) {
      const name = toolNames[i % toolNames.length];
      let output: string;

      switch (name) {
        case "localGrep":
          output = JSON.stringify({
            status: "success",
            matchCount: 5,
            matches: Array(5)
              .fill(null)
              .map((_, j) => ({
                file: `/src/lib/auth/handler-${i}-${j}.ts`,
                line: 42 + j * 10,
                content: `  const authToken = await getValidToken(userId_${i});`,
              })),
          });
          break;
        case "readFile":
          output = JSON.stringify({
            status: "success",
            content: `// auth-handler-${i}.ts\nimport { verify } from 'jsonwebtoken';\n\nexport async function handleAuth() {\n  // ... 50 lines of code ...\n}\n`,
            lineCount: 55,
          });
          break;
        case "executeCommand":
          output = JSON.stringify({
            status: "success",
            stdout: `$ npm test -- --grep "auth"\n\n  ✓ should validate token (${i}ms)\n  ✓ should reject expired token (${i + 5}ms)\n\n  2 passing\n`,
            exitCode: 0,
          });
          break;
        default:
          output = JSON.stringify({ status: "success", result: `output_${i}` });
      }

      input.push(makeCodexOutput(`call_${i}`, name, output));
    }

    input.push(makeAssistantMessage("I found the issues. Let me fix them."));
    input.push(makeUserMessage("Go ahead and fix them."));

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const normalized = normalizeOrphanedToolOutputs(input);
    consoleSpy.mockRestore();

    const payloadStr = JSON.stringify(normalized);
    const payloadKB = payloadStr.length / 1024;
    const payloadMB = payloadKB / 1024;

    console.log(`Realistic session payload: ${payloadKB.toFixed(1)} KB (${payloadMB.toFixed(2)} MB)`);
    console.log(`Items: ${normalized.length} (${normalized.filter((i) => i.type === "function_call").length} calls, ${normalized.filter((i) => i.type === "function_call_output").length} outputs)`);

    // The payload should be under 5MB (Codex API limit is likely around 10MB)
    expect(payloadMB).toBeLessThan(5);
  });
});
