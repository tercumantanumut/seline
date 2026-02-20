import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { getMessagesSignature } from "@/lib/chat/message-signature";

describe("getMessagesSignature", () => {
  it("changes when user text tail changes", () => {
    const before: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello world" }],
      } as UIMessage,
    ];

    const after: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello world!" }],
      } as UIMessage,
    ];

    expect(getMessagesSignature(before)).not.toBe(getMessagesSignature(after));
  });

  it("changes when last assistant tool payload changes", () => {
    const base = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "executeCommand",
          toolCallId: "call-1",
          state: "output-available",
          input: { command: "echo" },
          output: { stdout: "line-1" },
        },
      ],
    } as unknown as UIMessage;

    const changed = {
      ...base,
      parts: [
        {
          ...(base.parts?.[0] as Record<string, unknown>),
          output: { stdout: "line-2" },
        },
      ],
    } as UIMessage;

    expect(getMessagesSignature([base])).not.toBe(getMessagesSignature([changed]));
  });

  it("stays stable for structurally identical messages", () => {
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "same" }],
      } as UIMessage,
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "same reply" }],
      } as UIMessage,
    ];

    expect(getMessagesSignature(messages)).toBe(getMessagesSignature(messages));
  });
});
