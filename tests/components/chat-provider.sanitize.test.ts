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

  it("keeps interrupted tool parts with output payloads", () => {
    const messages = [
      {
        id: "assistant-interrupted",
        role: "assistant",
        parts: [
          { type: "text", text: "Stopped while browsing" },
          {
            type: "tool-chromiumWorkspace",
            toolCallId: "tool-browser",
            state: "input-available",
            input: { action: "open", url: "https://example.com" },
            output: {
              status: "success",
              data: "Browser session opened. Navigated to: https://example.com",
              pageUrl: "https://example.com",
            },
          },
        ],
      },
    ] as any;

    const sanitized = sanitizeMessagesForInit(messages);
    expect(sanitized).toHaveLength(1);

    const assistant = sanitized[0];
    const browserPart = assistant.parts.find(
      (part: any) => part.toolCallId === "tool-browser"
    );

    expect(browserPart).toBeDefined();
    expect((browserPart as any).output).toEqual({
      status: "success",
      data: "Browser session opened. Navigated to: https://example.com",
      pageUrl: "https://example.com",
    });
  });
});
