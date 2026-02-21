import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRuntimeSkills: vi.fn(),
  resolveRuntimeSkill: vi.fn(),
  updateSkillRunStats: vi.fn(),
  trackSkillTelemetryEvent: vi.fn(),
  renderSkillPrompt: vi.fn(),
}));

vi.mock("@/lib/skills/runtime-catalog", () => ({
  listRuntimeSkills: mocks.listRuntimeSkills,
  resolveRuntimeSkill: mocks.resolveRuntimeSkill,
}));

vi.mock("@/lib/skills/queries", () => ({
  updateSkillRunStats: mocks.updateSkillRunStats,
}));

vi.mock("@/lib/skills/telemetry", () => ({
  trackSkillTelemetryEvent: mocks.trackSkillTelemetryEvent,
}));

vi.mock("@/lib/skills/runtime", () => ({
  renderSkillPrompt: mocks.renderSkillPrompt,
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "scheduled-task-1" }]),
      })),
    })),
  },
}));

vi.mock("@/lib/db/sqlite-schedule-schema", () => ({
  scheduledTasks: {},
}));

vi.mock("@/lib/scheduler/scheduler-service", () => ({
  getScheduler: () => ({
    reloadSchedule: vi.fn(async () => {}),
  }),
}));

async function loadTool() {
  const mod = await import("@/lib/ai/tools/run-skill-tool");
  return mod.createRunSkillTool({
    sessionId: "sess-1",
    userId: "user-1",
    characterId: "char-1",
  });
}

describe("createRunSkillTool list action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.listRuntimeSkills.mockResolvedValue([
      {
        canonicalId: "skill-1",
        source: "db",
        name: "trend-digest",
        displayName: "Trend Digest",
        description: "Summarize trends",
        modelInvocationAllowed: true,
        versionRef: "v1",
        dbSkill: {
          runCount: 3,
          successCount: 3,
          status: "active",
          id: "db-skill-1",
          toolHints: [],
        },
      },
    ]);
  });

  it("supports action=list without any env gate", async () => {
    const tool = await loadTool();
    const result = await (tool as any).execute({ action: "list" });

    expect(result.success).toBe(true);
    expect(result.action).toBe("list");
    expect(result.count).toBe(1);
    expect(mocks.listRuntimeSkills).toHaveBeenCalledTimes(1);
  });

  it("defaults to list when no action and no skill target are provided", async () => {
    const tool = await loadTool();
    const result = await (tool as any).execute({});

    expect(result.success).toBe(true);
    expect(result.action).toBe("list");
    expect(result.count).toBe(1);
    expect(mocks.listRuntimeSkills).toHaveBeenCalledTimes(1);
  });
});
