import { beforeEach, describe, expect, it, vi } from "vitest";

const nextJsonMock = vi.hoisted(() => vi.fn((body: unknown, init?: ResponseInit) => ({ body, init })));

const dbMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSession: vi.fn(),
  getOrCreateLocalUser: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
}));

const syncFolderMocks = vi.hoisted(() => ({
  getSyncFolders: vi.fn(),
}));

const gitServiceMocks = vi.hoisted(() => ({
  GitService: vi.fn(),
}));

const spawnMocks = vi.hoisted(() => ({
  spawnWithFileCapture: vi.fn(),
  isEBADFError: vi.fn(() => false),
}));

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(async () => ({ text: "## Summary\n- Generated body" })),
}));

const resolverMocks = vi.hoisted(() => ({
  resolveSessionUtilityModel: vi.fn(() => ({ id: "utility-model" })),
  getSessionProviderTemperature: vi.fn(() => 0.2),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  realpathSync: vi.fn((value: string) => value),
}));

const childProcessMocks = vi.hoisted(() => {
  const execFileAsync = vi.fn();
  const execFile = vi.fn();
  (execFile as any)[Symbol.for("nodejs.util.promisify.custom")] = execFileAsync;
  return { execFile, execFileAsync };
});

vi.mock("next/server", () => ({
  NextResponse: { json: nextJsonMock },
}));
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/vectordb/sync-folder-crud", () => syncFolderMocks);
vi.mock("@/lib/workspace/git-service", () => gitServiceMocks);
vi.mock("@/lib/spawn-utils", () => spawnMocks);
vi.mock("ai", () => aiMocks);
vi.mock("@/lib/ai/session-model-resolver", () => resolverMocks);
vi.mock("fs", () => fsMocks);
vi.mock("child_process", () => ({ execFile: childProcessMocks.execFile }));

import { GET, POST } from "@/app/api/sessions/[id]/workspace/route";

describe("/api/sessions/[id]/workspace route", () => {
  const baseSession = {
    id: "session-1",
    userId: "db-user-1",
    characterId: "character-1",
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue("auth-user-1");
    dbMocks.getOrCreateLocalUser.mockResolvedValue({ id: "db-user-1" });
    dbMocks.getSession.mockResolvedValue(baseSession);
    dbMocks.updateSession.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
      ...baseSession,
      ...updates,
      metadata: updates.metadata,
    }));
    syncFolderMocks.getSyncFolders.mockResolvedValue([]);
    childProcessMocks.execFileAsync.mockReset();
    childProcessMocks.execFileAsync.mockImplementation(async (command: string, args: string[], options?: { cwd?: string }) => {
      const cwd = options?.cwd;
      if (command === "git" && args.join(" ") === "rev-parse --is-inside-work-tree" && cwd === "/repo/primary") {
        return { stdout: "true\n", stderr: "" };
      }
      if (command === "git" && args.join(" ") === "rev-parse --is-inside-work-tree" && cwd === "/repo/plain") {
        throw new Error("fatal: not a git repository");
      }
      if (command === "git" && args.join(" ") === "branch --show-current" && cwd === "/repo/primary") {
        return { stdout: "feature/local-mode\n", stderr: "" };
      }
      if (command === "git" && args.join(" ") === "remote get-url origin" && cwd === "/repo/primary") {
        return { stdout: "git@github.com:acme/repo.git\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")} @ ${cwd}`);
    });
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue("");
    fsMocks.readdirSync.mockReturnValue([]);
  });

  it("returns git-capable synced folders for detect=true when workspace metadata is missing", async () => {
    syncFolderMocks.getSyncFolders.mockResolvedValue([
      { id: "folder-1", folderPath: "/repo/primary", isPrimary: true },
      { id: "folder-2", folderPath: "/repo/plain", isPrimary: false },
    ]);
    childProcessMocks.execFileAsync.mockImplementation(async (command: string, args: string[], options?: { cwd?: string }) => {
      const cwd = options?.cwd;
      if (command === "git" && args.join(" ") === "rev-parse --is-inside-work-tree" && cwd === "/repo/primary") {
        return { stdout: "true\n", stderr: "" };
      }
      if (command === "git" && args.join(" ") === "branch --show-current" && cwd === "/repo/primary") {
        return { stdout: "feature/local-mode\n", stderr: "" };
      }
      if (command === "git" && args.join(" ") === "remote get-url origin" && cwd === "/repo/primary") {
        return { stdout: "git@github.com:acme/repo.git\n", stderr: "" };
      }
      if (command === "git" && args.join(" ") === "rev-parse --is-inside-work-tree" && cwd === "/repo/plain") {
        throw new Error("fatal: not a git repository");
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")} @ ${cwd}`);
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/session-1/workspace?detect=true") as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(nextJsonMock).toHaveBeenCalledWith({
      gitFolders: [
        {
          id: "folder-1",
          path: "/repo/primary",
          branch: "feature/local-mode",
          remoteUrl: "git@github.com:acme/repo.git",
          isPrimary: true,
        },
      ],
    });
    expect((response as { body: { gitFolders: unknown[] } }).body.gitFolders).toHaveLength(1);
  });

  it("enables git mode for a synced git repository before workspace metadata exists", async () => {
    syncFolderMocks.getSyncFolders.mockResolvedValue([
      { id: "folder-1", folderPath: "/repo/primary", isPrimary: true },
    ]);
    childProcessMocks.execFileAsync
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "feature/dev-git-mode\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "main\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "git@github.com:acme/repo.git\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "0\t0\n", stderr: "" });

    const response = await POST(
      {
        json: async () => ({ action: "enable-git", folderPath: "/repo/primary" }),
      } as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(dbMocks.updateSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          workspaceInfo: expect.objectContaining({
            type: "local",
            branch: "feature/dev-git-mode",
            baseBranch: "main",
            worktreePath: "/repo/primary",
            repoUrl: "git@github.com:acme/repo.git",
            syncFolderId: "folder-1",
            status: "active",
          }),
        }),
      })
    );
    expect((response as { body: { workspace: { type: string } } }).body.workspace.type).toBe("local");
  });

  it("cleans up local git mode without removing a worktree", async () => {
    dbMocks.getSession.mockResolvedValue({
      ...baseSession,
      metadata: {
        workspaceInfo: {
          type: "local",
          branch: "feature/dev-git-mode",
          baseBranch: "main",
          worktreePath: "/repo/primary",
          status: "active",
        },
      },
    });

    await POST(
      {
        json: async () => ({ action: "cleanup" }),
      } as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(childProcessMocks.execFileAsync).not.toHaveBeenCalled();
    expect(dbMocks.updateSession).toHaveBeenCalledWith("session-1", { metadata: {} });
  });

  it("returns auth recovery metadata when gh auth is missing", async () => {
    dbMocks.getSession.mockResolvedValue({
      ...baseSession,
      metadata: {
        workspaceInfo: {
          type: "local",
          branch: "feature/dev-git-mode",
          baseBranch: "main",
          worktreePath: "/repo/primary",
          status: "active",
        },
      },
    });

    childProcessMocks.execFileAsync
      .mockResolvedValueOnce({ stdout: "gh version 2.0.0\n", stderr: "" })
      .mockRejectedValueOnce(new Error("not logged in"));

    await POST(
      {
        json: async () => ({ action: "push-and-create-pr" }),
      } as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(nextJsonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "GH_AUTH_REQUIRED",
        authCommand: "gh auth login",
        authCheckCommand: "gh auth status",
        docsUrl: "https://cli.github.com/manual/gh_auth_login",
      }),
      { status: 401 }
    );
  });

  it("returns partial success when the branch is pushed but no PR can be created yet", async () => {
    const pushMock = vi.fn().mockResolvedValue(undefined);
    const getCommitLogMock = vi.fn().mockResolvedValue("");
    gitServiceMocks.GitService.mockImplementation(function GitServiceMock() {
      return {
        push: pushMock,
        getAheadBehind: vi.fn().mockResolvedValue({ ahead: 0, behind: 0, hasUpstream: true, comparisonRef: "origin/feature/dev-git-mode" }),
        getDiff: vi.fn().mockResolvedValue({ files: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } }),
        getStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } }),
        getCommitLog: getCommitLogMock,
      };
    });

    dbMocks.getSession.mockResolvedValue({
      ...baseSession,
      metadata: {
        workspaceInfo: {
          type: "local",
          branch: "feature/dev-git-mode",
          baseBranch: "main",
          worktreePath: "/repo/primary",
          status: "active",
        },
      },
    });

    childProcessMocks.execFileAsync
      .mockResolvedValueOnce({ stdout: "gh version 2.0.0\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "Logged in\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: JSON.stringify([]), stderr: "" });

    await POST(
      {
        json: async () => ({ action: "push-and-create-pr" }),
      } as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(pushMock).toHaveBeenCalledWith("origin", "feature/dev-git-mode");
    expect(nextJsonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "NO_COMMITS_FOR_PR",
        partialSuccess: true,
        pushed: true,
      }),
      { status: 400 }
    );
  });

  it("pushes and reuses an existing PR instead of creating a duplicate", async () => {
    const pushMock = vi.fn().mockResolvedValue(undefined);
    const getAheadBehindMock = vi.fn().mockResolvedValue({ ahead: 0, behind: 0, hasUpstream: true, comparisonRef: "origin/feature/dev-git-mode" });
    const getDiffMock = vi.fn().mockResolvedValue({ files: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } });
    const getStatusMock = vi.fn().mockResolvedValue({ staged: [], unstaged: [], stats: { additions: 0, deletions: 0, filesChanged: 0 } });
    const getCommitLogMock = vi.fn();
    gitServiceMocks.GitService.mockImplementation(function GitServiceMock() {
      return {
        push: pushMock,
        getAheadBehind: getAheadBehindMock,
        getDiff: getDiffMock,
        getStatus: getStatusMock,
        getCommitLog: getCommitLogMock,
      };
    });

    dbMocks.getSession.mockResolvedValue({
      ...baseSession,
      metadata: {
        workspaceInfo: {
          type: "local",
          branch: "feature/dev-git-mode",
          baseBranch: "main",
          worktreePath: "/repo/primary",
          status: "active",
        },
      },
    });

    childProcessMocks.execFileAsync
      .mockResolvedValueOnce({ stdout: "gh version 2.0.0\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "Logged in\n", stderr: "" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          { number: 17, url: "https://github.com/acme/repo/pull/17", isDraft: true, state: "OPEN" },
        ]),
        stderr: "",
      });

    const response = await POST(
      {
        json: async () => ({ action: "push-and-create-pr" }),
      } as never,
      { params: Promise.resolve({ id: "session-1" }) }
    );

    expect(pushMock).toHaveBeenCalledWith("origin", "feature/dev-git-mode");
    expect(aiMocks.generateText).not.toHaveBeenCalled();
    expect(dbMocks.updateSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          workspaceInfo: expect.objectContaining({
            prNumber: 17,
            prUrl: "https://github.com/acme/repo/pull/17",
            prStatus: "draft",
            status: "pr-open",
          }),
        }),
      })
    );
    expect((response as { body: { prNumber: number } }).body.prNumber).toBe(17);
  });
});
