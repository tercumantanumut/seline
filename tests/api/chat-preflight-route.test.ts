import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => "user-1"),
}));

const dbMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const contextWindowMocks = vi.hoisted(() => ({
  ContextWindowManager: {
    preFlightCheck: vi.fn(),
    getStatusMessage: vi.fn(() => "Compaction required before continuing."),
  },
}));

const sessionModelResolverMocks = vi.hoisted(() => ({
  getSessionModelId: vi.fn(() => "claude-sonnet"),
  getSessionProvider: vi.fn(() => "anthropic"),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/context-window", () => contextWindowMocks);
vi.mock("@/lib/ai/session-model-resolver", () => sessionModelResolverMocks);

import { POST } from "@/app/api/chat/preflight/route";
import { parseChatPreflightResponse } from "@/lib/chat/preflight";

describe("POST /api/chat/preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SSE-blocked payloads for 413 preflight failures", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "session-1",
      metadata: {},
    });
    contextWindowMocks.ContextWindowManager.preFlightCheck.mockResolvedValue({
      canProceed: false,
      status: {
        status: "exceeded",
      },
      recovery: { action: "compact", message: "Try compacting." },
      compactionResult: {
        success: true,
        tokensFreed: 2048,
        messagesCompacted: 5,
      },
      compactionDurationMs: 3210,
      error: "Context window limit exceeded",
    });

    const response = await POST(
      new Request("http://localhost/api/chat/preflight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": "session-1",
        },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const parsed = parseChatPreflightResponse(await response.text());
    expect(parsed).toMatchObject({
      ok: false,
      httpStatus: 413,
      error: "Context window limit exceeded",
      details: "Compaction required before continuing.",
      status: "exceeded",
      recovery: { action: "compact", message: "Try compacting." },
      compactionResult: {
        success: true,
        tokensFreed: 2048,
        messagesCompacted: 5,
      },
      compactionDurationMs: 3210,
    });
  });

  it("returns SSE success payloads when preflight can proceed", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "session-1",
      metadata: {},
    });
    contextWindowMocks.ContextWindowManager.preFlightCheck.mockResolvedValue({
      canProceed: true,
      status: {
        status: "safe",
      },
      compactionResult: {
        success: true,
        tokensFreed: 1024,
        messagesCompacted: 3,
      },
      compactionDurationMs: 1800,
    });

    const response = await POST(
      new Request("http://localhost/api/chat/preflight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": "session-1",
        },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    const parsed = parseChatPreflightResponse(await response.text());
    expect(parsed).toEqual({
      ok: true,
      status: "safe",
      compactionResult: {
        success: true,
        tokensFreed: 1024,
        messagesCompacted: 3,
      },
      compactionDurationMs: 1800,
    });
  });
});
