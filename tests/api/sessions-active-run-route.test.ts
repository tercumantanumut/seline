import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => "auth-user-1"),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
}));

const dbMocks = vi.hoisted(() => ({
  getOrCreateLocalUser: vi.fn(async () => ({ id: "user-1" })),
}));

const observabilityMocks = vi.hoisted(() => ({
  listAgentRunsBySession: vi.fn(),
  completeAgentRun: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/observability/queries", () => observabilityMocks);

import { GET } from "@/app/api/sessions/[id]/active-run/route";

describe("GET /api/sessions/[id]/active-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns foreground chat run as active", async () => {
    const now = new Date().toISOString();

    observabilityMocks.listAgentRunsBySession.mockResolvedValue([
      {
        id: "run-chat",
        sessionId: "session-1",
        pipelineName: "chat",
        status: "running",
        startedAt: now,
        updatedAt: now,
        metadata: {},
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/active-run") as any,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasActiveRun: true,
      runId: "run-chat",
      pipelineName: "chat",
    });
  });

  it("does not mark deep-research run as active foreground chat", async () => {
    const now = new Date().toISOString();

    observabilityMocks.listAgentRunsBySession.mockResolvedValue([
      {
        id: "run-research",
        sessionId: "session-1",
        pipelineName: "deep-research",
        status: "running",
        startedAt: now,
        updatedAt: now,
        metadata: { deepResearch: true },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/active-run") as any,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasActiveRun: false,
      runId: null,
      latestDeepResearchRunId: "run-research",
      latestDeepResearchStatus: "running",
    });
  });
});
