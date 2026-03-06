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

describe("POST /api/chat/tool-result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.getSession.mockResolvedValue({
      id: "sess-1",
      userId: "auth-user-1",
    });
    bridgeMocks.resolveInteractiveWait.mockReturnValue(true);
  });

  it("resolves interactive wait and returns resolved=true for valid payload", async () => {
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

    expect(sessionMocks.getSession).toHaveBeenCalledWith("sess-1");
    expect(bridgeMocks.resolveInteractiveWait).toHaveBeenCalledWith(
      "sess-1",
      "tool-call-1",
      { "Which style do you prefer?": "Modern" },
    );
  });

  it("returns 400 for invalid answers payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/tool-result", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "sess-1",
          toolUseId: "tool-call-1",
          answers: ["Modern"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Missing required fields");
    expect(sessionMocks.getSession).not.toHaveBeenCalled();
    expect(bridgeMocks.resolveInteractiveWait).not.toHaveBeenCalled();
  });

  it("returns 403 when session does not belong to authenticated user", async () => {
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

  it("returns 401 when auth guard rejects request", async () => {
    authMocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));

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

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
