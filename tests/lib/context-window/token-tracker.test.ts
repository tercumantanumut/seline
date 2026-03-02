import { describe, expect, it } from "vitest";

import {
  TokenTracker,
  getReliableMessageTokenCount,
} from "@/lib/context-window/token-tracker";

describe("TokenTracker legacy token handling", () => {
  it("falls back to content estimate for legacy assistant rows", () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(80) }],
      tokenCount: 500,
      metadata: {
        usage: {
          inputTokens: 420,
          outputTokens: 80,
          totalTokens: 500,
        },
      },
    } as any;

    expect(getReliableMessageTokenCount(message)).toBe(20);
  });

  it("keeps tokenCount for non-legacy assistant rows", () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(80) }],
      tokenCount: 33,
      metadata: {
        usage: {
          inputTokens: 420,
          outputTokens: 80,
          totalTokens: 500,
        },
      },
    } as any;

    expect(getReliableMessageTokenCount(message)).toBe(33);
  });

  it("ignores synthetic tool-result messages from context usage", async () => {
    const usage = await TokenTracker.calculateUsage(
      "session-1",
      [
        {
          id: "assistant-1",
          sessionId: "session-1",
          role: "assistant",
          content: [{ type: "text", text: "ok" }],
          tokenCount: 1,
          isCompacted: false,
          metadata: {},
        },
        {
          id: "tool-1",
          sessionId: "session-1",
          role: "tool",
          content: [{ type: "tool-result", result: { status: "success" } }],
          tokenCount: 999,
          isCompacted: false,
          metadata: { syntheticToolResult: true },
        },
      ] as any,
      0,
      null
    );

    expect(usage.toolResultTokens).toBe(0);
    expect(usage.assistantMessageTokens).toBe(5);
  });
});
