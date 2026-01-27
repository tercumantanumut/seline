import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  getToolResultsForSession: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  createMessage: mocks.createMessage,
  getToolResultsForSession: mocks.getToolResultsForSession,
  createSession: vi.fn(),
  getSession: vi.fn(),
  getOrCreateLocalUser: vi.fn(),
  updateSession: vi.fn(),
  updateMessage: vi.fn(),
}));

import {
  enhanceFrontendMessagesWithToolResults,
  safeParseToolArgs,
} from "@/app/api/chat/route";

describe("enhanceFrontendMessagesWithToolResults", () => {
  beforeEach(() => {
    mocks.createMessage.mockReset();
    mocks.getToolResultsForSession.mockReset();
  });

  it("hydrates tool-* parts with db results", async () => {
    mocks.getToolResultsForSession.mockResolvedValue(
      new Map([
        ["call-1", { status: "success", content: "ok" }],
      ])
    );

    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-mcp_linear_create_issue",
            toolCallId: "call-1",
            input: { title: "Hello" },
            state: "input-available",
          },
        ],
      },
    ];

    const enhanced = await enhanceFrontendMessagesWithToolResults(
      messages,
      "session-1"
    );

    const part = enhanced[0].parts?.[0] as any;
    expect(part.output).toEqual({ status: "success", content: "ok" });
    expect(part.state).toBe("output-available");
  });

  it("persists frontend tool outputs when db is missing", async () => {
    mocks.getToolResultsForSession.mockResolvedValue(new Map());
    mocks.createMessage.mockResolvedValue({ id: "tool-msg-1" });

    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-mcp_linear_update_issue",
            toolCallId: "call-2",
            input: { id: "RLT-275" },
            output: { status: "success", content: "updated" },
            state: "output-available",
          },
        ],
      },
    ];

    const enhanced = await enhanceFrontendMessagesWithToolResults(
      messages,
      "session-2"
    );

    const part = enhanced[0].parts?.[0] as any;
    expect(part.output).toEqual({ status: "success", content: "updated" });
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-2",
        role: "tool",
        toolCallId: "call-2",
      })
    );
  });
});

describe("safeParseToolArgs", () => {
  it("prefers input over args/argsText", () => {
    const parsed = safeParseToolArgs({
      type: "tool-call",
      toolCallId: "call-3",
      toolName: "mcp_linear_create_issue",
      input: { title: "From input" },
      args: { title: "From args" },
      argsText: "{\"title\":\"From argsText\"}",
    });

    expect(parsed).toEqual({ title: "From input" });
  });
});
