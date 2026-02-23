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

const characterMocks = vi.hoisted(() => ({
  getCharacter: vi.fn(),
  getCharacterStats: vi.fn(),
}));

const pluginRegistryMocks = vi.hoisted(() => ({
  getAvailablePluginsForAgent: vi.fn(),
}));

const workflowMocks = vi.hoisted(() => ({
  getWorkflowByAgentId: vi.fn(),
  getWorkflowResources: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/characters/queries", () => characterMocks);
vi.mock("@/lib/plugins/registry", () => pluginRegistryMocks);
vi.mock("@/lib/agents/workflows", () => workflowMocks);

import { GET } from "@/app/api/characters/[id]/resources/route";

describe("GET /api/characters/[id]/resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    characterMocks.getCharacter.mockResolvedValue({
      id: "character-1",
      userId: "user-1",
      metadata: {
        enabledTools: ["readFile", "localGrep"],
        enabledMcpTools: ["server:toolA", "server:toolB"],
        customComfyUIWorkflowIds: ["wf-1"],
      },
    });

    characterMocks.getCharacterStats.mockResolvedValue({
      characterId: "character-1",
      skillCount: 3,
      runCount: 0,
      successRate: null,
      activeSince: null,
      lastActive: null,
    });

    pluginRegistryMocks.getAvailablePluginsForAgent.mockResolvedValue([
      {
        enabledForAgent: true,
        plugin: {
          id: "plugin-1",
          name: "plugin-a",
          description: "Plugin A",
          version: "1.0.0",
          status: "active",
          components: {
            skills: [{ name: "skill-a" }, { name: "skill-b" }],
            hooks: {
              hooks: {
                PreToolUse: [
                  {
                    matcher: "readFile",
                    hooks: [{ type: "command", command: "echo ok" }],
                  },
                ],
              },
            },
            mcpServers: {
              serverA: { type: "stdio", command: "node" },
            },
          },
        },
      },
      {
        enabledForAgent: false,
        plugin: {
          id: "plugin-2",
          name: "plugin-b",
          description: "Plugin B",
          version: "1.0.0",
          status: "active",
          components: {
            skills: [{ name: "skill-c" }],
            hooks: null,
            mcpServers: null,
          },
        },
      },
    ]);

    workflowMocks.getWorkflowByAgentId.mockResolvedValue({
      workflow: { id: "workflow-1", name: "wf-1" },
    });

    workflowMocks.getWorkflowResources.mockResolvedValue({
      role: "initiator",
      sharedResources: {
        pluginIds: ["plugin-1"],
        syncFolderIds: ["folder-1", "folder-2"],
        hookEvents: ["PreToolUse"],
        mcpServerNames: ["serverA"],
      },
    });
  });

  it("returns aggregated resource counters and per-agent plugin assignment", async () => {
    const response = await GET(
      new Request("http://localhost/api/characters/character-1/resources") as any,
      { params: Promise.resolve({ id: "character-1" }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.resources.skills.count).toBe(3);
    expect(payload.resources.tools.enabledCount).toBe(2);
    expect(payload.resources.mcp.enabledToolCount).toBe(2);
    expect(payload.resources.plugins.totalCount).toBe(2);
    expect(payload.resources.plugins.enabledCount).toBe(1);
    expect(payload.resources.plugins.skillCount).toBe(2);
    expect(payload.resources.plugins.hookHandlerCount).toBe(1);
    expect(payload.resources.workflows.customComfyUIWorkflowCount).toBe(1);
    expect(payload.resources.workflows.active).toEqual({
      id: "workflow-1",
      name: "wf-1",
      role: "initiator",
      sharedPluginCount: 1,
      sharedFolderCount: 2,
      sharedHookCount: 1,
      sharedMcpServerCount: 1,
    });

    expect(payload.plugins).toHaveLength(2);
    expect(payload.plugins[0]).toMatchObject({
      id: "plugin-1",
      enabledForAgent: true,
      skillCount: 2,
      hookHandlerCount: 1,
      hasMcp: true,
    });
  });

  it("returns 404 when character does not exist", async () => {
    characterMocks.getCharacter.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/characters/missing/resources") as any,
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when character belongs to another user", async () => {
    characterMocks.getCharacter.mockResolvedValueOnce({
      id: "character-2",
      userId: "user-2",
      metadata: {},
    });

    const response = await GET(
      new Request("http://localhost/api/characters/character-2/resources") as any,
      { params: Promise.resolve({ id: "character-2" }) }
    );

    expect(response.status).toBe(403);
  });
});
