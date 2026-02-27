import { describe, expect, it } from "vitest";

import { sanitizeMessagesForInit } from "@/components/chat-provider";

describe("sanitizeMessagesForInit", () => {
  it("removes dangling input-streaming and input-available tool parts", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "starting" },
          {
            type: "tool-executeCommand",
            toolCallId: "tool-stream",
            state: "input-streaming",
            input: { command: "echo" },
          },
          {
            type: "tool-localGrep",
            toolCallId: "tool-dangling",
            state: "input-available",
            input: { pattern: "todo" },
          },
          {
            type: "tool-localGrep",
            toolCallId: "tool-complete",
            state: "output-available",
            input: { pattern: "done" },
            output: { count: 1 },
          },
        ],
      },
    ] as any;

    const sanitized = sanitizeMessagesForInit(messages);
    expect(sanitized).toHaveLength(1);

    const assistant = sanitized[0];
    const toolCallIds = assistant.parts
      .filter((part: any) => typeof part.type === "string" && part.type.startsWith("tool-"))
      .map((part: any) => part.toolCallId);

    expect(toolCallIds).toEqual(["tool-complete"]);
  });
});
