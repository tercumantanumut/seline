import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkflowByAgentId: vi.fn(),
  getWorkflowMembers: vi.fn(),
  getCharacterFull: vi.fn(),
  createSession: vi.fn(),
  getMessages: vi.fn(),
  listAgentRunsBySession: vi.fn(),
  markRunAsCancelled: vi.fn(),
  abortChatRun: vi.fn(),
  removeChatAbortController: vi.fn(),
  taskRegistryGet: vi.fn(),
  taskRegistryUpdateStatus: vi.fn(),
}));

vi.mock("@/lib/agents/workflows", () => ({
  getWorkflowByAgentId: mocks.getWorkflowByAgentId,
  getWorkflowMembers: mocks.getWorkflowMembers,
}));

vi.mock("@/lib/characters/queries", () => ({
  getCharacterFull: mocks.getCharacterFull,
}));

vi.mock("@/lib/db/sqlite-queries", () => ({
  createSession: mocks.createSession,
  getMessages: mocks.getMessages,
}));

vi.mock("@/lib/observability/queries", () => ({
  listAgentRunsBySession: mocks.listAgentRunsBySession,
  markRunAsCancelled: mocks.markRunAsCancelled,
}));

vi.mock("@/lib/background-tasks/chat-abort-registry", () => ({
  abortChatRun: mocks.abortChatRun,
  removeChatAbortController: mocks.removeChatAbortController,
}));

vi.mock("@/lib/background-tasks/registry", () => ({
  taskRegistry: {
    get: mocks.taskRegistryGet,
    updateStatus: mocks.taskRegistryUpdateStatus,
  },
}));

const bridgeMocks = vi.hoisted(() => ({
  getPendingInteractivePrompts: vi.fn(),
  resolveInteractiveWait: vi.fn(),
}));

vi.mock("@/lib/interactive-tool-bridge", () => ({
  getPendingInteractivePrompts: bridgeMocks.getPendingInteractivePrompts,
  resolveInteractiveWait: bridgeMocks.resolveInteractiveWait,
}));

import { createDelegateToSubagentTool } from "@/lib/ai/tools/delegate-to-subagent-tool";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTool() {
  return createDelegateToSubagentTool({
    sessionId: "sess-main",
    userId: "user-1",
    characterId: "agent-init",
  });
}

describe("delegate-to-subagent-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getWorkflowByAgentId.mockResolvedValue({
      workflow: { id: "wf-1", name: "Main Workflow" },
      member: { workflowId: "wf-1", agentId: "agent-init", role: "initiator" },
    });

    mocks.getWorkflowMembers.mockResolvedValue([
      { workflowId: "wf-1", agentId: "agent-init", role: "initiator", metadataSeed: {} },
      {
        workflowId: "wf-1",
        agentId: "agent-research",
        role: "subagent",
        metadataSeed: { purpose: "Research and synthesis" },
      },
      {
        workflowId: "wf-1",
        agentId: "agent-review",
        role: "subagent",
        metadataSeed: { purpose: "Code review" },
      },
    ]);

    mocks.getCharacterFull.mockImplementation(async (agentId: string) => {
      if (agentId === "agent-research") {
        return {
          id: "agent-research",
          name: "researcher",
          displayName: "Research Analyst",
          tagline: "Research specialist",
        };
      }
      if (agentId === "agent-review") {
        return {
          id: "agent-review",
          name: "reviewer",
          displayName: "Code Reviewer",
          tagline: "Review specialist",
        };
      }
      if (agentId === "agent-init") {
        return {
          id: "agent-init",
          name: "initiator",
          displayName: "Initiator",
          tagline: "Main coordinator",
        };
      }
      return null;
    });

    mocks.createSession.mockResolvedValue({ id: "delegation-session-1" });
    mocks.getMessages.mockResolvedValue([
      { role: "assistant", content: [{ type: "text", text: "done" }] },
    ]);
    mocks.listAgentRunsBySession.mockResolvedValue([]);
    mocks.markRunAsCancelled.mockResolvedValue(undefined);
    mocks.abortChatRun.mockReturnValue(true);
    mocks.taskRegistryGet.mockReturnValue(undefined);
    bridgeMocks.getPendingInteractivePrompts.mockReturnValue([]);
    bridgeMocks.resolveInteractiveWait.mockReturnValue(false);

    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
      text: async () => "",
    });
  });

  it("list returns available sub-agents with names and ids", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({ action: "list" });

    expect(result.success).toBe(true);
    expect(result.availableAgents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent-research",
          agentName: "Research Analyst",
        }),
        expect.objectContaining({
          agentId: "agent-review",
          agentName: "Code Reviewer",
        }),
      ]),
    );
  });

  it("start resolves sub-agent by agentName", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Summarize recent API changes",
    });

    expect(result.success).toBe(true);
    expect(result.delegateAgent).toBe("Research Analyst");
    expect(result.delegationId).toBeTypeOf("string");

    await (tool as any).execute({
      action: "stop",
      delegationId: result.delegationId,
    });
  });

  it("start returns a clear ambiguity error when agentName is not unique", async () => {
    mocks.getWorkflowMembers.mockResolvedValue([
      { workflowId: "wf-1", agentId: "agent-init", role: "initiator", metadataSeed: {} },
      { workflowId: "wf-1", agentId: "agent-1", role: "subagent", metadataSeed: {} },
      { workflowId: "wf-1", agentId: "agent-2", role: "subagent", metadataSeed: {} },
    ]);

    mocks.getCharacterFull.mockImplementation(async (agentId: string) => {
      if (agentId === "agent-1") {
        return { id: "agent-1", name: "analyst-east", displayName: "Analyst East" };
      }
      if (agentId === "agent-2") {
        return { id: "agent-2", name: "analyst-west", displayName: "Analyst West" };
      }
      return { id: "agent-init", name: "initiator", displayName: "Initiator" };
    });

    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Analyst",
      task: "Run analysis",
    });

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("matches multiple sub-agents");
    expect(Array.isArray(result.availableAgents)).toBe(true);
  });

  it("stop cancels the underlying active run so background UI state can clear", async () => {
    mocks.listAgentRunsBySession.mockResolvedValue([
      {
        id: "run-delegated-1",
        status: "running",
        startedAt: new Date(Date.now() - 2_000).toISOString(),
      },
    ]);
    mocks.taskRegistryGet.mockReturnValue({
      startedAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const tool = makeTool();
    const start = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Investigate lingering active session UI",
      mode: "background",
    });

    const stopped = await (tool as any).execute({
      action: "stop",
      delegationId: start.delegationId,
    });

    expect(stopped.success).toBe(true);
    expect(mocks.listAgentRunsBySession).toHaveBeenCalledWith("delegation-session-1");
    expect(mocks.abortChatRun).toHaveBeenCalledWith("run-delegated-1", "user_cancelled");
    expect(mocks.markRunAsCancelled).toHaveBeenCalledWith("run-delegated-1", "user_cancelled");
    expect(mocks.taskRegistryUpdateStatus).toHaveBeenCalledWith(
      "run-delegated-1",
      "cancelled",
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
    expect(mocks.removeChatAbortController).toHaveBeenCalledWith("run-delegated-1");
  });

  it("stop falls back cleanly when no active run exists yet", async () => {
    mocks.listAgentRunsBySession.mockResolvedValue([]);

    const tool = makeTool();
    const start = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Cancel before run registration",
      mode: "background",
    });

    const stopped = await (tool as any).execute({
      action: "stop",
      delegationId: start.delegationId,
    });

    expect(stopped.success).toBe(true);
    expect(mocks.markRunAsCancelled).not.toHaveBeenCalled();
    expect(mocks.taskRegistryUpdateStatus).not.toHaveBeenCalled();
    expect(mocks.removeChatAbortController).not.toHaveBeenCalled();
  });

  it("observe supports waitSeconds so callers can avoid tight polling loops", async () => {
    let readCount = 0;
    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (readCount === 0) {
              readCount += 1;
              await delay(180);
              return { done: false, value: new Uint8Array([1]) };
            }
            return { done: true, value: undefined };
          },
        }),
      },
      text: async () => "",
    });

    const tool = makeTool();
    const start = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Investigate build regressions",
      mode: "background",
    });

    expect(start.success).toBe(true);
    expect(start.mode).toBe("background");

    const immediateObserve = await (tool as any).execute({
      action: "observe",
      delegationId: start.delegationId,
    });
    expect(immediateObserve.running).toBe(true);

    const waitedObserve = await (tool as any).execute({
      action: "observe",
      delegationId: start.delegationId,
      waitSeconds: 0.3,
    });
    expect(waitedObserve.success).toBe(true);
    expect(waitedObserve.running).toBe(false);
    expect(waitedObserve.completed).toBe(true);
    expect(waitedObserve.waitTimedOut).toBe(false);
    expect((waitedObserve.waitedMs as number) >= 150).toBe(true);
  });

  it("start supports runInBackground=false by returning the blocking result shape", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Investigate flaky tests",
      runInBackground: false,
      waitSeconds: 0.2,
    });

    expect(result.success).toBe(true);
    expect(typeof result.delegationId).toBe("string");
    expect(result.mode).toBe("blocking");
    expect(result.completed).toBe(true);
    expect(result.result).toBe("done");
    expect(result.running).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it("start returns pending interactive prompts when a sub-agent asks a question", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            await delay(40);
            return { done: false, value: new Uint8Array([1]) };
          },
        }),
      },
      text: async () => "",
    });

    bridgeMocks.getPendingInteractivePrompts.mockImplementation(() => [
      {
        sessionId: "delegation-session-1",
        toolUseId: "toolu_123",
        questions: [{ question: "Proceed?", options: [] }],
        createdAt: Date.now(),
      },
    ]);

    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Run QA check",
      waitSeconds: 0.2,
    });

    expect(result.success).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.pendingInteractivePrompts).toEqual([
      expect.objectContaining({
        toolUseId: "toolu_123",
        questions: [{ question: "Proceed?", options: [] }],
      }),
    ]);
    expect(String(result.message || "")).toContain("interactive answer");
  });

  it("start supports resume alias by mapping to continue semantics", async () => {
    const tool = makeTool();

    const started = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Initial analysis",
    });

    const resumed = await (tool as any).execute({
      action: "start",
      resume: started.delegationId,
      task: "Focus only on regressions",
    });

    expect(resumed.success).toBe(true);
    expect(String(resumed.message || "")).toContain("Follow-up message sent");
  });

  it("continue aborts previous run without surfacing an abort failure", async () => {
    let readCount = 0;
    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (readCount === 0) {
              readCount += 1;
              await delay(150);
              return { done: false, value: new Uint8Array([1]) };
            }
            return { done: true, value: undefined };
          },
        }),
      },
      text: async () => "",
    });

    const tool = makeTool();
    const started = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Initial analysis",
    });

    await delay(10);

    const resumed = await (tool as any).execute({
      action: "continue",
      delegationId: started.delegationId,
      followUpMessage: "Focus only on regressions",
    });

    expect(resumed.success).toBe(true);

    await delay(300);

    const observed = await (tool as any).execute({
      action: "observe",
      delegationId: started.delegationId,
    });

    expect(observed.success).toBe(true);
    expect(observed.completed).toBe(true);
    expect(observed.running).toBe(false);
    expect(String(observed.error || "")).toBe("");
  });

  it("answer forwards interactive responses into the delegation session", async () => {
    const tool = makeTool();
    const started = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Initial analysis",
      mode: "background",
    });

    bridgeMocks.resolveInteractiveWait.mockReturnValueOnce(true);

    const answered = await (tool as any).execute({
      action: "answer",
      delegationId: started.delegationId,
      toolUseId: "toolu_123",
      answers: { Proceed: "Continue and confirm generation" },
    });

    expect(answered.success).toBe(true);
    expect(bridgeMocks.resolveInteractiveWait).toHaveBeenCalledWith(
      "delegation-session-1",
      "toolu_123",
      { Proceed: "Continue and confirm generation" },
    );
  });

  it("start ignores maxTurns and does not inject execution constraints", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Analyze module",
      maxTurns: 999,
    });

    expect(result.success).toBe(true);

    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const delegatedPrompt = String(fetchBody.messages?.[0]?.content || "");
    expect(delegatedPrompt).not.toContain("Execution constraint from initiator");
  });

  it("observe rejects waitSeconds over the max limit", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "observe",
      delegationId: "del-test",
      waitSeconds: 601,
    });

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("cannot exceed 600");
  });

  it("observe returns full lastResponse and bounded/truncated prior response previews", async () => {
    const longPrior = "P".repeat(1_450);
    const longLast = "L".repeat(9_200);
    mocks.getMessages.mockResolvedValue([
      { role: "assistant", content: [{ type: "text", text: "step-1" }] },
      { role: "assistant", content: [{ type: "text", text: "step-2" }] },
      { role: "assistant", content: [{ type: "text", text: longPrior }] },
      { role: "assistant", content: [{ type: "text", text: "step-4" }] },
      { role: "assistant", content: [{ type: "text", text: "step-5" }] },
      { role: "assistant", content: [{ type: "text", text: "step-6" }] },
      { role: "assistant", content: [{ type: "text", text: "step-7" }] },
      { role: "assistant", content: [{ type: "text", text: "step-8" }] },
      { role: "assistant", content: [{ type: "text", text: longLast }] },
      { role: "tool", content: [{ type: "text", text: "tool output" }] },
    ]);

    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
      text: async () => "",
    });

    const tool = makeTool();
    const start = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Investigate delegation history output",
    });

    const observed = await (tool as any).execute({
      action: "observe",
      delegationId: start.delegationId,
    });

    expect(observed.success).toBe(true);
    expect(observed.lastResponse).toBe(longLast);
    expect(observed.allResponses).toHaveLength(6);
    expect(observed.allResponses?.join("\n")).not.toContain(longLast);
    expect(observed.allResponses?.some((r: string) => r.includes("[Response truncated]"))).toBe(true);
    expect(observed.responseCount).toBe(9);
    expect(observed.responsePreviewCount).toBe(6);
    expect(observed.responsePreviewOmittedCount).toBe(2);
    expect(observed.responsePreviewTruncatedCount).toBe(1);
  });
});
