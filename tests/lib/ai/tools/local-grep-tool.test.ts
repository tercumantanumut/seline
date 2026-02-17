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

vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: vi.fn(async () => []),
}));

import { createLocalGrepTool } from "@/lib/ai/ripgrep/tool";

describe("localGrep tool contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.state.settings.localGrepEnabled = true;
    ripgrepMock.isRipgrepAvailable.mockReturnValue(true);
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
