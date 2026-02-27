import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import { isInternalToolHistoryLeakText } from "@/lib/messages/internal-tool-history";

describe("converter internal tool history guard", () => {
  it("hides leaked internal tool fallback assistant text while preserving real tool parts", () => {
    const leakedText =
      '[Previous tool result; call_id=call_legacy]: {"status":"success","stdout":"..." }';
    const now = new Date().toISOString();

    const uiMessages = convertDBMessagesToUIMessages([
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: leakedText }],
        createdAt: now,
        orderingIndex: 1,
      },
      {
        id: "a1",
        role: "assistant",
        content: [
          { type: "text", text: leakedText },
          {
            type: "tool-call",
            toolCallId: "call_legacy",
            toolName: "localGrep",
            args: { pattern: "x" },
            state: "input-available",
          },
          {
            type: "tool-result",
            toolCallId: "call_legacy",
            toolName: "localGrep",
            result: { status: "success", matchCount: 1 },
            status: "success",
            state: "output-available",
          },
        ],
        createdAt: now,
        orderingIndex: 2,
      },
    ] as any);

    expect(uiMessages).toHaveLength(2);

    const user = uiMessages.find((msg) => msg.role === "user");
    const assistant = uiMessages.find((msg) => msg.role === "assistant");

    const userTextParts = (user?.parts ?? []).filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof (part as { text?: unknown }).text === "string"
    );
    expect(userTextParts[0]?.text).toContain("[Previous tool result;");

    const assistantTextParts = (assistant?.parts ?? []).filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof (part as { text?: unknown }).text === "string"
    );
    expect(assistantTextParts.some((part) => isInternalToolHistoryLeakText(part.text))).toBe(false);

    const assistantToolParts = (assistant?.parts ?? []).filter(
      (part) => typeof part.type === "string" && part.type.startsWith("tool-")
    );
    expect(assistantToolParts.length).toBeGreaterThan(0);
  });

  it("replays exported fixture without leaking internal fallback text into assistant UI", () => {
    const fixturePath = path.join(
      process.cwd(),
      "docs/dev/auth-and-vector-engine-audit-162c03ba.json"
    );
    const raw = fs.readFileSync(fixturePath, "utf8");
    const fixture = JSON.parse(raw) as { messages: unknown[] };

    const uiMessages = convertDBMessagesToUIMessages(
      (fixture.messages ?? []) as any
    );

    const assistant = uiMessages.find((msg) => msg.role === "assistant");
    expect(assistant).toBeTruthy();

    const assistantTextParts = (assistant?.parts ?? []).filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof (part as { text?: unknown }).text === "string"
    );
    expect(assistantTextParts.some((part) => isInternalToolHistoryLeakText(part.text))).toBe(false);
    expect(
      assistantTextParts.some((part) => part.text.includes("[Previous tool result; call_id="))
    ).toBe(false);
  });
});
