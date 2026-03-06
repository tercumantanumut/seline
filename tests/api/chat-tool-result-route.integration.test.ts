import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => "auth-user-1"),
}));

const sessionMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  resolveInteractiveWait: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => ({
  requireAuth: authMocks.requireAuth,
}));

vi.mock("@/lib/db/queries-sessions", () => ({
  getSession: sessionMocks.getSession,
}));

vi.mock("@/lib/interactive-tool-bridge", () => ({
  resolveInteractiveWait: bridgeMocks.resolveInteractiveWait,
}));

import { POST } from "@/app/api/chat/tool-result/route";

describe("POST /api/chat/tool-result (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.getSession.mockResolvedValue({
      id: "sess-1",
      userId: "auth-user-1",
    });
    bridgeMocks.resolveInteractiveWait.mockReturnValue(true);
  });

  it("resolves pending interactive question for owned session", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/tool-result", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "sess-1",
          toolUseId: "tool-call-1",
          answers: {
            "Which style do you prefer?": "Modern",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resolved: true });
    expect(bridgeMocks.resolveInteractiveWait).toHaveBeenCalledWith(
      "sess-1",
      "tool-call-1",
      { "Which style do you prefer?": "Modern" },
    );
  });

  it("rejects when session ownership does not match", async () => {
    sessionMocks.getSession.mockResolvedValueOnce({
      id: "sess-1",
      userId: "someone-else",
    });

    const response = await POST(
      new Request("http://localhost/api/chat/tool-result", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "sess-1",
          toolUseId: "tool-call-1",
          answers: {
            "Which style do you prefer?": "Classic",
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(bridgeMocks.resolveInteractiveWait).not.toHaveBeenCalled();
  });
});
