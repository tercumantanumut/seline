import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => "auth-user-1"),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
}));

const dbMocks = vi.hoisted(() => ({
  getOrCreateLocalUser: vi.fn(async () => ({ id: "user-1" })),
}));

const parserMocks = vi.hoisted(() => ({
  parsePluginPackage: vi.fn(),
  parsePluginFromMarkdown: vi.fn(),
  parsePluginFromFiles: vi.fn(),
  buildAgentMetadataSeed: vi.fn(() => ({
    sourcePath: "agents/sub-agent.md",
    description: "seed",
    purpose: "seed",
    systemPromptSeed: "seed",
  })),
}));

const characterMocks = vi.hoisted(() => ({
  createCharacter: vi.fn(),
  getCharacter: vi.fn(async () => ({ id: "character-1", userId: "user-1", metadata: {} })),
  getUserCharacters: vi.fn(async () => []),
}));

const registryMocks = vi.hoisted(() => ({
  installPlugin: vi.fn(),
  enablePluginForAgent: vi.fn(),
}));

const workflowMocks = vi.hoisted(() => ({
  createWorkflowFromPluginImport: vi.fn(),
  syncSharedFoldersToSubAgents: vi.fn(),
}));

const workspaceMocks = vi.hoisted(() => ({
  getUserWorkspacePath: vi.fn(() => "/mock-workspace"),
}));

const fsPromisesMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  copyFile: vi.fn(async () => undefined),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
}));

const syncServiceMocks = vi.hoisted(() => ({
  getSyncFolders: vi.fn(async () => []),
  addSyncFolder: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/plugins/import-parser", () => parserMocks);
vi.mock("@/lib/characters/queries", () => characterMocks);
vi.mock("@/lib/plugins/registry", () => registryMocks);
vi.mock("@/lib/agents/workflows", () => workflowMocks);
vi.mock("@/lib/workspace/setup", () => workspaceMocks);
vi.mock("fs/promises", () => fsPromisesMocks);
vi.mock("fs", () => fsMocks);
vi.mock("@/lib/vectordb/sync-service", () => syncServiceMocks);

import { POST } from "@/app/api/plugins/import/route";

describe("POST /api/plugins/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    parserMocks.parsePluginPackage.mockResolvedValue({
      manifest: {
        name: "demo-plugin",
        version: "1.0.0",
        description: "Demo plugin",
      },
      components: {
        skills: [
          {
            name: "Helper Skill",
            namespacedName: "demo-plugin/helper-skill",
            description: "Helper",
            relativePath: "skills/helper.md",
          },
        ],
        agents: [],
        hooks: null,
        mcpServers: null,
        lspServers: null,
      },
      files: [
        {
          relativePath: "skills/helper.md",
          content: Buffer.from("# helper"),
          mimeType: "text/markdown",
          size: 8,
          isExecutable: false,
        },
        {
          relativePath: "docs/reference.md",
          content: Buffer.from("reference"),
          mimeType: "text/markdown",
          size: 9,
          isExecutable: false,
        },
      ],
      warnings: [],
      isLegacySkillFormat: false,
    });

    registryMocks.installPlugin.mockResolvedValue({
      id: "plugin-1",
      name: "demo-plugin",
      version: "1.0.0",
      scope: "user",
      status: "active",
      cachePath: "/plugin-cache",
    });
  });

  it("copies auxiliary files but never auto-registers plugin workspace as a sync folder", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "demo.zip", { type: "application/zip" }));
    formData.append("characterId", "character-1");

    const response = await POST(new Request("http://localhost/api/plugins/import", {
      method: "POST",
      body: formData,
    }) as any);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.auxiliaryFiles).toEqual({
      count: 1,
      path: path.join("/mock-workspace", "plugins", "demo-plugin"),
      workspaceRegistered: false,
    });

    expect(fsPromisesMocks.copyFile).toHaveBeenCalledWith(
      path.join("/plugin-cache", "docs", "reference.md"),
      path.join("/mock-workspace", "plugins", "demo-plugin", "docs", "reference.md"),
    );
    expect(syncServiceMocks.getSyncFolders).not.toHaveBeenCalled();
    expect(syncServiceMocks.addSyncFolder).not.toHaveBeenCalled();
  });

  it("does not materialize auxiliary files when no character is selected", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "demo.zip", { type: "application/zip" }));

    const response = await POST(new Request("http://localhost/api/plugins/import", {
      method: "POST",
      body: formData,
    }) as any);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.auxiliaryFiles).toEqual({
      count: 0,
      path: null,
      workspaceRegistered: false,
    });

    expect(fsPromisesMocks.copyFile).not.toHaveBeenCalled();
    expect(syncServiceMocks.getSyncFolders).not.toHaveBeenCalled();
    expect(syncServiceMocks.addSyncFolder).not.toHaveBeenCalled();
  });
});
