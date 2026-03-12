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
  SYSTEM_SKILLS: [
    {
      id: "system-skill",
      displayName: "System Skill",
      shortDescription: "system",
      category: "dev-tools",
      icon: null,
      defaultPrompt: "",
      installSource: { type: "bundled" as const },
      tags: ["system"],
    },
  ],
  getAllCatalogSkills: vi.fn(),
  getCatalogCollections: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  listSkillsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/skills/catalog", () => catalogMocks);
vi.mock("@/lib/skills/queries", () => queryMocks);

import { GET } from "@/app/api/skills/catalog/route";

describe("GET /api/skills/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    catalogMocks.getAllCatalogSkills.mockReturnValue([
      catalogMocks.SYSTEM_SKILLS[0],
      {
        id: "agency-agents-1",
        displayName: "Brand Guardian",
        shortDescription: "catalog skill",
        category: "design",
        icon: null,
        defaultPrompt: "",
        installSource: { type: "bundled", file: "agency-agents/brand-guardian.md" },
        tags: ["agency-agents"],
        collectionId: "agency-agents",
        collectionLabel: "Agency Agents",
        collectionUrl: "https://github.com/msitarzewski/agency-agents/tree/main",
      },
    ]);
    catalogMocks.getCatalogCollections.mockReturnValue([
      {
        id: "agency-agents",
        label: "Agency Agents",
        url: "https://github.com/msitarzewski/agency-agents/tree/main",
        description: "Imported roster",
      },
    ]);
    queryMocks.listSkillsForUser.mockResolvedValue([
      {
        id: "installed-1",
        catalogId: "agency-agents-1",
        status: "active",
      },
    ]);
  });

  it("returns catalog entries with collections and install status", async () => {
    const request = {
      nextUrl: new URL("http://localhost/api/skills/catalog?characterId=agent-1"),
    } as any;
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(queryMocks.listSkillsForUser).toHaveBeenCalledWith("user-1", {
      all: true,
      limit: 1000,
      characterId: "agent-1",
    });
    expect(payload.collections).toEqual([
      {
        id: "agency-agents",
        label: "Agency Agents",
        url: "https://github.com/msitarzewski/agency-agents/tree/main",
        description: "Imported roster",
      },
    ]);
    expect(payload.catalog).toEqual([
      expect.objectContaining({
        id: "agency-agents-1",
        collectionId: "agency-agents",
        isInstalled: true,
        installedSkillId: "installed-1",
        isEnabled: true,
      }),
    ]);
    expect(payload.systemSkills).toEqual([
      expect.objectContaining({
        id: "system-skill",
        isInstalled: false,
        installedSkillId: null,
        isEnabled: null,
      }),
    ]);
  });
});
