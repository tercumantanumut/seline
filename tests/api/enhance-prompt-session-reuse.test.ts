import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => {}),
  getLocalUser: vi.fn(async () => ({ id: "user-123" })),
}));

const dbMocks = vi.hoisted(() => ({
  getOrCreateCharacterSession: vi.fn(),
  createSession: vi.fn(),
  getSessionByMetadataKey: vi.fn(),
  getSession: vi.fn(),
}));

const observabilityMocks = vi.hoisted(() => ({
  createAgentRun: vi.fn(async () => ({ id: "run-1" })),
  completeAgentRun: vi.fn(async () => {}),
  withRunContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
}));

const enhancementMocks = vi.hoisted(() => ({
  enhancePromptWithLLM: vi.fn(async () => ({
    enhanced: true,
    prompt: "enhanced",
    originalQuery: "input",
    filesFound: 0,
    chunksRetrieved: 0,
    usedLLM: true,
  })),
  enhancePrompt: vi.fn(async () => ({
    enhanced: true,
    prompt: "heuristic",
    originalQuery: "input",
    filesFound: 0,
    chunksRetrieved: 0,
    expandedConcepts: [],
    dependenciesResolved: [],
  })),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/observability", () => observabilityMocks);
vi.mock("@/lib/ai/prompt-enhancement-v2", () => ({
  enhancePromptWithLLM: enhancementMocks.enhancePromptWithLLM,
}));
vi.mock("@/lib/ai/prompt-enhancement", () => ({
  enhancePrompt: enhancementMocks.enhancePrompt,
}));

import { POST } from "@/app/api/enhance-prompt/route";

describe("POST /api/enhance-prompt session reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getSession.mockResolvedValue(null);
  });

  it("reuses stable metadata-keyed session for non-character enhance requests", async () => {
    dbMocks.getSessionByMetadataKey.mockResolvedValue({
      id: "existing-session",
      metadata: {
        type: "prompt-enhancement",
        key: "prompt-enhancement:user-123",
      },
    });

    const req = new Request("http://localhost/api/enhance-prompt", {
      method: "POST",
      body: JSON.stringify({ input: "Improve this", useLLM: true }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(dbMocks.getSessionByMetadataKey).toHaveBeenCalledWith(
      "user-123",
      "prompt-enhancement",
      "prompt-enhancement:user-123"
    );
    expect(dbMocks.createSession).not.toHaveBeenCalled();
    expect(enhancementMocks.enhancePromptWithLLM).toHaveBeenCalled();

    const llmOptions = enhancementMocks.enhancePromptWithLLM.mock.calls[0][2];
    expect(llmOptions.sessionId).toBe("existing-session");
  });

  it("creates metadata-keyed session when none exists", async () => {
    dbMocks.getSessionByMetadataKey.mockResolvedValue(null);
    dbMocks.createSession.mockResolvedValue({
      id: "new-session",
      metadata: {
        type: "prompt-enhancement",
        key: "prompt-enhancement:user-123",
      },
    });

    const req = new Request("http://localhost/api/enhance-prompt", {
      method: "POST",
      body: JSON.stringify({ input: "Improve this", useLLM: true }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(dbMocks.createSession).toHaveBeenCalledWith({
      title: "Prompt Enhancement",
      userId: "user-123",
      metadata: {
        type: "prompt-enhancement",
        key: "prompt-enhancement:user-123",
      },
    });
  });

  it("uses provided sessionId when it belongs to the current user", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "chat-session-1",
      userId: "user-123",
      metadata: { sessionProvider: "codex", sessionUtilityModel: "gpt-5.3-codex-medium" },
    });

    const req = new Request("http://localhost/api/enhance-prompt", {
      method: "POST",
      body: JSON.stringify({
        input: "Improve this",
        sessionId: "chat-session-1",
        useLLM: true,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(dbMocks.getSession).toHaveBeenCalledWith("chat-session-1");
    expect(dbMocks.getSessionByMetadataKey).not.toHaveBeenCalled();
    expect(dbMocks.createSession).not.toHaveBeenCalled();

    const llmOptions = enhancementMocks.enhancePromptWithLLM.mock.calls[0][2];
    expect(llmOptions.sessionId).toBe("chat-session-1");
    expect(llmOptions.sessionMetadata).toEqual({
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });
  });

  it("falls through to metadata-keyed session when provided sessionId is not owned by user", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "chat-session-1",
      userId: "someone-else",
      metadata: {},
    });
    dbMocks.getSessionByMetadataKey.mockResolvedValue({
      id: "fallback-session",
      metadata: { type: "prompt-enhancement", key: "prompt-enhancement:user-123" },
    });

    const req = new Request("http://localhost/api/enhance-prompt", {
      method: "POST",
      body: JSON.stringify({
        input: "Improve this",
        sessionId: "chat-session-1",
        useLLM: true,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(enhancementMocks.enhancePromptWithLLM).toHaveBeenCalled();
    const llmOptions = enhancementMocks.enhancePromptWithLLM.mock.calls[0][2];
    expect(llmOptions.sessionId).toBe("fallback-session");
  });
});
