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

const queryMocks = vi.hoisted(() => ({
  getSkillById: vi.fn(),
  getSkillFiles: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  buildSkillExportArtifact: vi.fn(),
}));

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/skills/queries", () => queryMocks);
vi.mock("@/lib/skills/export", () => exportMocks);

import { GET } from "@/app/api/skills/[id]/export/route";

describe("GET /api/skills/[id]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    queryMocks.getSkillById.mockResolvedValue({
      id: "skill-1",
      userId: "user-1",
      characterId: "character-1",
      name: "Weekly Review",
      description: "desc",
      icon: null,
      promptTemplate: "prompt",
      inputParameters: [],
      toolHints: [],
      triggerExamples: [],
      category: "general",
      version: 1,
      copiedFromSkillId: null,
      copiedFromCharacterId: null,
      sourceType: "manual",
      sourceSessionId: null,
      runCount: 0,
      successCount: 0,
      lastRunAt: null,
      status: "active",
      createdAt: "2026-02-26T09:00:00.000Z",
      updatedAt: "2026-02-26T09:00:00.000Z",
    });
    queryMocks.getSkillFiles.mockResolvedValue([]);
    exportMocks.buildSkillExportArtifact.mockResolvedValue({
      fileName: "weekly-review.zip",
      mimeType: "application/zip",
      buffer: Buffer.from([1, 2, 3]),
      skippedFiles: [],
    });
  });

  it("returns zipped skill package with attachment headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/skills/skill-1/export") as any,
      { params: Promise.resolve({ id: "skill-1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="weekly-review.zip"');
    expect(response.headers.get("Content-Length")).toBe("3");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);

    expect(queryMocks.getSkillById).toHaveBeenCalledWith("skill-1", "user-1");
    expect(queryMocks.getSkillFiles).toHaveBeenCalledWith("skill-1", "user-1");
    expect(exportMocks.buildSkillExportArtifact).toHaveBeenCalled();
  });

  it("returns 404 when skill does not exist", async () => {
    queryMocks.getSkillById.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/skills/missing/export") as any,
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Skill not found" });
    expect(queryMocks.getSkillFiles).not.toHaveBeenCalled();
    expect(exportMocks.buildSkillExportArtifact).not.toHaveBeenCalled();
  });

  it("returns 401 when auth guard rejects request", async () => {
    authMocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await GET(
      new Request("http://localhost/api/skills/skill-1/export") as any,
      { params: Promise.resolve({ id: "skill-1" }) }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
