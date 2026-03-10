import { describe, expect, it } from "vitest";

import {
  parseTransportErrorResponse,
  shouldIgnoreUseChatError,
  toBlockedPayload,
} from "@/lib/chat/transport-errors";
import { parseChatPreflightResponse } from "@/lib/chat/preflight";

describe("chat transport error helpers", () => {
  it("parses structured 413 responses for the blocked banner", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Context window limit exceeded",
        details: "Compaction required before continuing.",
        status: "exceeded",
        recovery: { action: "compact", message: "Try compacting first." },
        compactionResult: {
          success: true,
          tokensFreed: 1234,
          messagesCompacted: 7,
        },
      }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      },
    );

    const parsed = await parseTransportErrorResponse(response);
    expect(parsed).toMatchObject({
      httpStatus: 413,
      status: "exceeded",
      message: "Context window limit exceeded",
      details: "Compaction required before continuing.",
      recovery: { action: "compact", message: "Try compacting first." },
      compactionResult: {
        success: true,
        tokensFreed: 1234,
        messagesCompacted: 7,
      },
    });

    expect(toBlockedPayload(parsed)).toEqual({
      message: "Context window limit exceeded",
      details: "Compaction required before continuing.",
      status: "exceeded",
      recovery: { action: "compact", message: "Try compacting first." },
      compactionResult: {
        success: true,
        tokensFreed: 1234,
        messagesCompacted: 7,
      },
    });
  });

  it("ignores non-413 responses for the blocked banner", () => {
    expect(
      toBlockedPayload({ httpStatus: 500, message: "Request failed" }),
    ).toBeNull();
  });

  it("parses SSE preflight payloads", () => {
    const blocked = parseChatPreflightResponse(
      [
        ": heartbeat",
        "",
        'data: {"ok":false,"httpStatus":413,"error":"Context window limit exceeded","status":"exceeded"}',
        "",
      ].join("\n"),
    );

    expect(blocked).toMatchObject({
      ok: false,
      httpStatus: 413,
      error: "Context window limit exceeded",
      status: "exceeded",
    });

    const ok = parseChatPreflightResponse('data: {"ok":true,"status":"safe"}\n\n');
    expect(ok).toEqual({ ok: true, status: "safe" });
  });

  it("keeps post-stream network noise suppressed but surfaces request-start failures", () => {
    expect(
      shouldIgnoreUseChatError(new TypeError("Failed to fetch"), "streaming"),
    ).toBe(true);
    expect(
      shouldIgnoreUseChatError(new TypeError("Failed to fetch"), "submitted"),
    ).toBe(false);
    expect(
      shouldIgnoreUseChatError(new Error("aborted by user"), "submitted"),
    ).toBe(true);
  });
});
