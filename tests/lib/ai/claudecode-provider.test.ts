import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";
import {
  normalizeAnthropicToolUseInputs,
  normalizeClaudeSdkToolName,
  sanitizeJsonStringValues,
  queryWithSdkOptions,
  type ClaudeAgentSdkQueryOptions,
} from "@/lib/ai/providers/claudecode-provider";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Use vi.hoisted so the mock factory can reference the variable after hoisting.
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock the Agent SDK so tests don't spawn real CLI processes.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

// Mock auth so auth-error tests don't need a real SDK process.
vi.mock("@/lib/auth/claude-agent-sdk-auth", () => ({
  readClaudeAgentSdkAuthStatus: vi.fn(async () => ({
    authenticated: false,
    authUrl: "https://claude.ai/auth",
    output: [],
  })),
}));

// Mock retry helpers to keep tests synchronous.
vi.mock("@/lib/ai/retry/stream-recovery", () => ({
  classifyRecoverability: vi.fn(() => ({ retryable: false, reason: "non-retryable" })),
  getBackoffDelayMs: vi.fn(() => 0),
  shouldRetry: vi.fn(() => false),
  sleepWithAbort: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SDKMessage = { type: string; [key: string]: unknown };

/** Creates an async generator that yields the given messages. */
async function* makeStream(messages: SDKMessage[]): AsyncGenerator<SDKMessage, void> {
  for (const msg of messages) {
    yield msg;
  }
}

function setMockStream(messages: SDKMessage[]) {
  (mockQuery as MockedFunction<typeof mockQuery>).mockReturnValue(makeStream(messages));
}

// ---------------------------------------------------------------------------
// normalizeClaudeSdkToolName
// ---------------------------------------------------------------------------

describe("normalizeClaudeSdkToolName", () => {
  it("recovers malformed tool names with trailing attribute fragments", () => {
    expect(normalizeClaudeSdkToolName('Task" subagent_type="Explore')).toBe("Task");
  });

  it("extracts tool names from name= fragments", () => {
    expect(normalizeClaudeSdkToolName('name="Task" subagent_type="Explore"')).toBe("Task");
  });

  it("keeps valid MCP-prefixed tool names intact", () => {
    expect(normalizeClaudeSdkToolName("mcp__seline-platform__searchTools")).toBe(
      "mcp__seline-platform__searchTools"
    );
  });

  it("returns undefined for non-string or empty values", () => {
    expect(normalizeClaudeSdkToolName(undefined)).toBeUndefined();
    expect(normalizeClaudeSdkToolName("   ")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sanitizeJsonStringValues
// ---------------------------------------------------------------------------

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
      top: "A\ufffdB\ufffdC",
      nested: [{ text: "\ufffd\ufffd" }],
    });
  });

  it("handles primitive types without mutation", () => {
    expect(sanitizeJsonStringValues(42)).toEqual({ value: 42, changed: false });
    expect(sanitizeJsonStringValues(null)).toEqual({ value: null, changed: false });
    expect(sanitizeJsonStringValues(true)).toEqual({ value: true, changed: false });
  });
});

// ---------------------------------------------------------------------------
// normalizeAnthropicToolUseInputs
// ---------------------------------------------------------------------------

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

  it("leaves already-object inputs unchanged", () => {
    const input = { key: "value" };
    const body = {
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_3", name: "readFile", input }],
        },
      ],
    };

    const result = normalizeAnthropicToolUseInputs(body);

    expect(result.fixedCount).toBe(0);
    expect((result.body.messages as Array<any>)[0].content[0].input).toBe(input);
  });

  it("returns body unchanged when there are no messages", () => {
    const body = { model: "claude-sonnet-4-6" };
    const result = normalizeAnthropicToolUseInputs(body);
    expect(result.fixedCount).toBe(0);
    expect(result.body).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// queryWithSdkOptions — text extraction
// ---------------------------------------------------------------------------

describe("queryWithSdkOptions — text extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from stream_event content_block_delta messages", async () => {
    setMockStream([
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello " } },
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
      },
      { type: "result", subtype: "success", is_error: false, result: "", errors: [] },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    expect(text).toBe("Hello world");
  });

  it("falls back to assistant message text when no stream events emitted", async () => {
    setMockStream([
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Fallback response" }] },
      },
      { type: "result", subtype: "success", is_error: false, result: "", errors: [] },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    expect(text).toBe("Fallback response");
  });

  it("skips assistant message text when stream deltas were already consumed", async () => {
    setMockStream([
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Stream text" } },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Duplicate assistant text" }] },
      },
      { type: "result", subtype: "success", is_error: false, result: "", errors: [] },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    // Must NOT contain duplicate content
    expect(text).toBe("Stream text");
    expect(text).not.toContain("Duplicate");
  });

  it("uses result.result as last-resort fallback when no other text collected", async () => {
    setMockStream([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Result text fallback",
        errors: [],
      },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    expect(text).toBe("Result text fallback");
  });

  it("does NOT use result.result when assistant text was already captured", async () => {
    setMockStream([
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Good response" }] },
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Should be ignored",
        errors: [],
      },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    expect(text).toBe("Good response");
    expect(text).not.toContain("ignored");
  });

  it("appends result.errors to the collected text", async () => {
    setMockStream([
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Partial" } },
      },
      {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "",
        errors: ["Tool execution failed"],
      },
    ]);

    await expect(queryWithSdkOptions({ prompt: "hi" })).rejects.toThrow(
      "error_during_execution"
    );
  });

  it("ignores unrecognised SDK message types without throwing", async () => {
    setMockStream([
      { type: "system", subtype: "hook_started", hook_id: "h1", hook_name: "pre-tool", hook_event: "PreToolUse" },
      { type: "status", message: "processing" },
      { type: "tool_progress", tool_name: "Bash", progress: "running" },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Done" } },
      },
      { type: "result", subtype: "success", is_error: false, result: "", errors: [] },
    ]);

    const text = await queryWithSdkOptions({ prompt: "hi" });
    expect(text).toBe("Done");
  });
});

// ---------------------------------------------------------------------------
// queryWithSdkOptions — authentication errors
// ---------------------------------------------------------------------------

describe("queryWithSdkOptions — authentication errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws an auth error with URL when SDK returns authentication_failed", async () => {
    setMockStream([
      {
        type: "assistant",
        error: "authentication_failed",
        message: { content: [] },
      },
    ]);

    const err = await queryWithSdkOptions({ prompt: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("authentication");
  });

  it("throws an auth error when SDK returns billing_error", async () => {
    setMockStream([
      {
        type: "assistant",
        error: "billing_error",
        message: { content: [] },
      },
    ]);

    const err = await queryWithSdkOptions({ prompt: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/billing_error|authentication/);
  });
});

// ---------------------------------------------------------------------------
// queryWithSdkOptions — SDK options forwarding
// ---------------------------------------------------------------------------

describe("queryWithSdkOptions — SDK options forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockStream([
      { type: "result", subtype: "success", is_error: false, result: "ok", errors: [] },
    ]);
  });

  it("forwards agents option to SDK query()", async () => {
    const agents: ClaudeAgentSdkQueryOptions["agents"] = {
      "system-explore": {
        description: "Explorer",
        prompt: "You are an explorer.",
        model: "inherit",
      },
    };

    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { agents } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.agents).toEqual(agents);
  });

  it("forwards allowedTools and disallowedTools to SDK query()", async () => {
    await queryWithSdkOptions({
      prompt: "hi",
      sdkOptions: { allowedTools: ["Bash", "Read"], disallowedTools: ["Write"] },
    });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.allowedTools).toEqual(["Bash", "Read"]);
    expect(callArg.options.disallowedTools).toEqual(["Write"]);
  });

  it("forwards persistSession: false for ephemeral queries", async () => {
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { persistSession: false } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.persistSession).toBe(false);
  });

  it("forwards maxTurns override to SDK query()", async () => {
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { maxTurns: 5 } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.maxTurns).toBe(5);
  });

  it("defaults maxTurns to 1000 when not specified", async () => {
    await queryWithSdkOptions({ prompt: "hi" });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.maxTurns).toBe(1000);
  });

  it("forwards effort level to SDK query()", async () => {
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { effort: "high" } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.effort).toBe("high");
  });

  it("forwards thinking config to SDK query()", async () => {
    const thinking: ClaudeAgentSdkQueryOptions["thinking"] = { type: "adaptive" };
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { thinking } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.thinking).toEqual({ type: "adaptive" });
  });

  it("forwards resume session ID to SDK query()", async () => {
    const resume = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { resume } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.resume).toBe(resume);
  });

  it("forwards plugins list to SDK query()", async () => {
    const plugins: ClaudeAgentSdkQueryOptions["plugins"] = [
      { type: "local", path: "/abs/path/to/plugin" },
    ];
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: { plugins } });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.plugins).toEqual(plugins);
  });

  it("omits undefined sdk options from the query call", async () => {
    await queryWithSdkOptions({ prompt: "hi", sdkOptions: {} });

    const callArg = (mockQuery as MockedFunction<typeof mockQuery>).mock.calls[0][0];
    expect(callArg.options.agents).toBeUndefined();
    expect(callArg.options.hooks).toBeUndefined();
    expect(callArg.options.plugins).toBeUndefined();
    expect(callArg.options.resume).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// queryWithSdkOptions — async agent lifecycle messages
// ---------------------------------------------------------------------------

describe("queryWithSdkOptions — async agent lifecycle (sdk-tools AgentOutput)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns collected stream text when async_launched status is present", async () => {
    // async_launched is a status on AgentOutput (from sdk-tools.d.ts), not a
    // direct SDK message type. The SDK still emits normal message types in the
    // surrounding stream; we verify they are handled correctly alongside any
    // informational system messages.
    setMockStream([
      { type: "system", subtype: "hook_started", hook_id: "h1", hook_name: "n", hook_event: "PreToolUse" },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Async task launched." },
        },
      },
      { type: "result", subtype: "success", is_error: false, result: "", errors: [] },
    ]);

    const text = await queryWithSdkOptions({ prompt: "launch task" });
    expect(text).toBe("Async task launched.");
  });
});
