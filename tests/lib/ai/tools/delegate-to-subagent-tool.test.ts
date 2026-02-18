import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkflowByAgentId: vi.fn(),
  getWorkflowMembers: vi.fn(),
  getCharacterFull: vi.fn(),
  createSession: vi.fn(),
  getMessages: vi.fn(),
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
    });

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

  it("start supports run_in_background=false alias by performing start+observe wait", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Investigate flaky tests",
      run_in_background: false,
      waitSeconds: 0.2,
    });

    expect(result.success).toBe(true);
    expect(typeof result.delegationId).toBe("string");
    expect(result.running).toBe(false);
    expect(result.completed).toBe(true);
    expect(String(result.message || "")).toContain("runInBackground=false");
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

  it("start validates advisory max_turns alias range", async () => {
    const tool = makeTool();
    const result = await (tool as any).execute({
      action: "start",
      agentName: "Research Analyst",
      task: "Analyze module",
      max_turns: 999,
    });

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("maxTurns");
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
