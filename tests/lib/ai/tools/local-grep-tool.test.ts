import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMock = vi.hoisted(() => {
  const state = {
    settings: {
      localGrepEnabled: true,
      localGrepMaxResults: 50,
      localGrepContextLines: 2,
      localGrepRespectGitignore: true,
    },
  };

  return {
    state,
    loadSettings: vi.fn(() => state.settings),
  };
});

const ripgrepMock = vi.hoisted(() => ({
  isRipgrepAvailable: vi.fn(() => true),
  searchWithRipgrep: vi.fn(),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMock.loadSettings,
}));

vi.mock("@/lib/ai/ripgrep/ripgrep", () => ({
  isRipgrepAvailable: ripgrepMock.isRipgrepAvailable,
  searchWithRipgrep: ripgrepMock.searchWithRipgrep,
}));

const syncServiceMock = vi.hoisted(() => ({
  getSyncFolders: vi.fn(async () => []),
}));

const pathValidationMock = vi.hoisted(() => ({
  validateSyncFolderPath: vi.fn(async (folderPath: string) => ({ normalizedPath: folderPath, error: null })),
}));

vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: syncServiceMock.getSyncFolders,
}));

vi.mock("@/lib/vectordb/path-validation", () => ({
  validateSyncFolderPath: pathValidationMock.validateSyncFolderPath,
}));

import { createLocalGrepTool } from "@/lib/ai/ripgrep/tool";

describe("localGrep tool contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.state.settings.localGrepEnabled = true;
    ripgrepMock.isRipgrepAvailable.mockReturnValue(true);
    syncServiceMock.getSyncFolders.mockResolvedValue([]);
    pathValidationMock.validateSyncFolderPath.mockImplementation(async (folderPath: string) => ({
      normalizedPath: folderPath,
      error: null,
    }));
  });

  it("uses literal mode by default even when pattern has regex metacharacters", async () => {
    ripgrepMock.searchWithRipgrep.mockResolvedValue({
      matches: [],
      totalMatches: 0,
      wasTruncated: false,
    });

    const tool = createLocalGrepTool({ sessionId: "sess-1", characterId: null });
    const result = await tool.execute(
      {
        pattern: "updateCharacter(",
        paths: ["/repo"],
      },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({ status: "success", regex: false });
    expect(ripgrepMock.searchWithRipgrep).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: "updateCharacter(",
        regex: false,
      })
    );
  });

  it("uses regex mode only when explicitly requested", async () => {
    ripgrepMock.searchWithRipgrep.mockResolvedValue({
      matches: [],
      totalMatches: 0,
      wasTruncated: false,
    });

    const tool = createLocalGrepTool({ sessionId: "sess-1", characterId: null });
    const result = await tool.execute(
      {
        pattern: "updateCharacter(",
        regex: true,
        paths: ["/repo"],
      },
      { toolCallId: "tc-2", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({ status: "success", regex: true });
    expect(ripgrepMock.searchWithRipgrep).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: "updateCharacter(",
        regex: true,
      })
    );
  });

  it("skips stale synced folders and still searches valid paths", async () => {
    syncServiceMock.getSyncFolders.mockResolvedValue([
      { folderPath: "/missing-worktree" },
      { folderPath: "/repo" },
    ]);
    pathValidationMock.validateSyncFolderPath.mockImplementation(async (folderPath: string) => ({
      normalizedPath: folderPath,
      error: folderPath === "/missing-worktree" ? "Folder does not exist." : null,
    }));
    ripgrepMock.searchWithRipgrep.mockResolvedValue({
      matches: [],
      totalMatches: 0,
      wasTruncated: false,
    });

    const tool = createLocalGrepTool({ sessionId: "sess-1", characterId: "char-1" });
    const result = await tool.execute(
      {
        pattern: "localGrep",
      },
      { toolCallId: "tc-4", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({
      status: "success",
      searchedPaths: ["/repo"],
    });
    expect(result.message).toContain("Skipped 1 unavailable synced folder path");
    expect(ripgrepMock.searchWithRipgrep).toHaveBeenCalledWith(
      expect.objectContaining({ paths: ["/repo"] })
    );
  });

  it("returns no_paths with guidance when all synced folders are stale", async () => {
    syncServiceMock.getSyncFolders.mockResolvedValue([{ folderPath: "/missing-worktree" }]);
    pathValidationMock.validateSyncFolderPath.mockResolvedValue({
      normalizedPath: "/missing-worktree",
      error: "Folder does not exist.",
    });

    const tool = createLocalGrepTool({ sessionId: "sess-1", characterId: "char-1" });
    const result = await tool.execute(
      {
        pattern: "localGrep",
      },
      { toolCallId: "tc-5", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result.status).toBe("no_paths");
    expect(result.message).toContain("No valid synced folders are currently available");
  });

  it("adds a regex-specific hint when regex parse fails", async () => {
    ripgrepMock.searchWithRipgrep.mockRejectedValue(new Error("ripgrep error: regex parse error: unclosed group"));

    const tool = createLocalGrepTool({ sessionId: "sess-1", characterId: null });
    const result = await tool.execute(
      {
        pattern: "updateCharacter(",
        regex: true,
        paths: ["/repo"],
      },
      { toolCallId: "tc-3", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result.status).toBe("error");
    expect(result.error).toContain("regex parse error");
    expect(result.error).toContain("set regex: false");
    expect(result.error).toContain("escape metacharacters");
  });
});
