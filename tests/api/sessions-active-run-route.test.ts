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

const bridgeMocks = vi.hoisted(() => ({
  hasPendingInteractiveWait: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/observability/queries", () => observabilityMocks);
vi.mock("@/lib/interactive-tool-bridge", () => bridgeMocks);

import { GET } from "@/app/api/sessions/[id]/active-run/route";

describe("GET /api/sessions/[id]/active-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.hasPendingInteractiveWait.mockReturnValue(false);
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
      shouldResumeBackgroundRun: true,
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
      hasInteractiveWait: false,
      shouldResumeBackgroundRun: false,
      latestDeepResearchRunId: "run-research",
      latestDeepResearchStatus: "running",
    });
  });

  it("reports when a foreground chat run is waiting on interactive user input", async () => {
    const now = new Date().toISOString();
    bridgeMocks.hasPendingInteractiveWait.mockReturnValueOnce(true);

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
      hasInteractiveWait: true,
      shouldResumeBackgroundRun: false,
    });
    expect(bridgeMocks.hasPendingInteractiveWait).toHaveBeenCalledWith("session-1");
  });
});
