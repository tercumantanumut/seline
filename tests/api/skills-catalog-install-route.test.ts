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

const catalogMocks = vi.hoisted(() => ({
  getCatalogSkillById: vi.fn(),
  getCatalogSkillsByCollection: vi.fn(),
}));

const bundledMocks = vi.hoisted(() => ({
  loadBundledSkillMarkdown: vi.fn(),
  loadBundledSkillFiles: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  fetchSkillFromGitHub: vi.fn(),
}));

const parserMocks = vi.hoisted(() => ({
  parseSingleSkillMd: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  assertCharacterOwnership: vi.fn(),
  importSkillPackage: vi.fn(),
  listSkillsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/skills/catalog", () => catalogMocks);
vi.mock("@/lib/skills/catalog/bundled-loader", () => bundledMocks);
vi.mock("@/lib/skills/catalog/github-fetch", () => githubMocks);
vi.mock("@/lib/skills/import-parser", () => parserMocks);
vi.mock("@/lib/skills/queries", () => queryMocks);

import { POST } from "@/app/api/skills/catalog/install/route";

describe("POST /api/skills/catalog/install", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    queryMocks.assertCharacterOwnership.mockResolvedValue(true);
    queryMocks.listSkillsForUser.mockResolvedValue([]);
    bundledMocks.loadBundledSkillMarkdown.mockResolvedValue("---\nname: Skill\ndescription: Desc\n---\nPrompt");
    bundledMocks.loadBundledSkillFiles.mockResolvedValue([]);
    parserMocks.parseSingleSkillMd.mockResolvedValue({
      name: "Skill",
      description: "Desc",
      promptTemplate: "Prompt",
      scripts: [],
      references: [],
      assets: [],
      files: [],
    });
    queryMocks.importSkillPackage.mockResolvedValue({
      id: "installed-skill",
      name: "Installed Skill",
    });
  });

  it("installs a single catalog skill", async () => {
    catalogMocks.getCatalogSkillById.mockReturnValue({
      id: "agency-agents-1",
      displayName: "Brand Guardian",
      shortDescription: "catalog skill",
      category: "design",
      icon: null,
      installSource: { type: "bundled", file: "agency-agents/brand-guardian.md" },
      tags: ["agency-agents"],
    });

    const response = await POST(
      new Request("http://localhost/api/skills/catalog/install", {
        method: "POST",
        body: JSON.stringify({ characterId: "agent-1", catalogSkillId: "agency-agents-1" }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installed: true,
      skillId: "installed-skill",
      name: "Installed Skill",
    });
    expect(queryMocks.importSkillPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "agent-1",
        catalogId: "agency-agents-1",
        categoryOverride: "design",
        nameOverride: "Brand Guardian",
      })
    );
  });

  it("bulk installs a collection and skips already installed skills", async () => {
    catalogMocks.getCatalogSkillsByCollection.mockReturnValue([
      {
        id: "agency-agents-1",
        displayName: "Brand Guardian",
        shortDescription: "catalog skill",
        category: "design",
        icon: null,
        installSource: { type: "bundled", file: "agency-agents/brand-guardian.md" },
        tags: ["agency-agents"],
      },
      {
        id: "agency-agents-2",
        displayName: "UX Architect",
        shortDescription: "catalog skill",
        category: "design",
        icon: null,
        installSource: { type: "bundled", file: "agency-agents/ux-architect.md" },
        tags: ["agency-agents"],
      },
    ]);
    queryMocks.listSkillsForUser.mockResolvedValue([
      {
        id: "existing-skill",
        catalogId: "agency-agents-1",
        status: "active",
      },
    ]);
    queryMocks.importSkillPackage.mockResolvedValueOnce({
      id: "installed-skill-2",
      name: "UX Architect",
    });

    const response = await POST(
      new Request("http://localhost/api/skills/catalog/install", {
        method: "POST",
        body: JSON.stringify({ characterId: "agent-1", collectionId: "agency-agents" }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installed: [
        {
          catalogSkillId: "agency-agents-2",
          skillId: "installed-skill-2",
          name: "UX Architect",
        },
      ],
      skipped: [
        {
          catalogSkillId: "agency-agents-1",
          existingSkillId: "existing-skill",
        },
      ],
      failed: [],
    });
  });
});
