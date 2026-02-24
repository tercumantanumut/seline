import { describe, expect, it } from "vitest";
import { buildWorkflowPromptContext } from "@/lib/agents/workflows";

describe("buildWorkflowPromptContext", () => {
  it("builds initiator protocol with active delegation reuse guidance", () => {
    const prompt = buildWorkflowPromptContext({
      workflowName: "Product Ops Workflow",
      role: "initiator",
      sharedPluginCount: 2,
      sharedFolderCount: 4,
      subagentDirectory: [
        "- Research Analyst (id: agent-research): Market and competitor research",
      ],
      activeDelegations: [
        {
          delegationId: "del-123",
          delegateAgent: "Research Analyst",
          task: "Analyze pricing changes",
          running: true,
          elapsed: 45_000,
        },
      ],
    });

    expect(prompt).toContain("Workflow: Product Ops Workflow");
    expect(prompt).toContain("Role: initiator");
    expect(prompt).toContain("## Initiator / Orchestrator Contract");
    expect(prompt).toContain("list -> start -> observe(waitSeconds) -> continue or stop");
    expect(prompt).toContain("runInBackground");
    expect(prompt).toContain("- resume: map to continue using delegationId");
    expect(prompt).not.toContain("run_in_background");
    expect(prompt).not.toContain("resume(agent_id)");
    expect(prompt).not.toContain("max_turns");
    expect(prompt).toContain("prefer background: true");
    expect(prompt).toContain("sleep 45");
    expect(prompt).toContain("Active delegations");
    expect(prompt).toContain("del-123");
  });

  it("builds subagent executor protocol with structured output contract", () => {
    const prompt = buildWorkflowPromptContext({
      workflowName: "Engineering Workflow",
      role: "subagent",
      sharedPluginCount: 1,
      sharedFolderCount: 3,
      subagentDirectory: [],
    });

    expect(prompt).toContain("Role: subagent");
    expect(prompt).toContain("Sub-agents:\n- none");
    expect(prompt).toContain("## Subagent / Executor Contract");
    expect(prompt).toContain("Summary, Findings, Evidence, Risks, Next Actions");
    expect(prompt).toContain("Do not orchestrate further delegation unless the initiator explicitly requests it.");
    expect(prompt).not.toContain("## Initiator / Orchestrator Contract");
  });
});
