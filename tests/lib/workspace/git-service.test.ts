import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks – must be declared before any imports that use them
// ---------------------------------------------------------------------------

const simpleGitInstanceMock = vi.hoisted(() => ({
  status: vi.fn(),
  raw: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
}));

const simpleGitMock = vi.hoisted(() => vi.fn(() => simpleGitInstanceMock));

const spawnMock = vi.hoisted(() => ({
  spawnWithFileCapture: vi.fn(),
  isEBADFError: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: simpleGitMock,
}));

vi.mock("@/lib/spawn-utils", () => ({
  spawnWithFileCapture: spawnMock.spawnWithFileCapture,
  isEBADFError: spawnMock.isEBADFError,
}));

// ---------------------------------------------------------------------------
// Import after mocks are wired
// ---------------------------------------------------------------------------

import {
  GitService,
  isValidWorktreePath,
  isSafeRepoRelativePath,
  isSafeRefName,
} from "@/lib/workspace/git-service";

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("isValidWorktreePath", () => {
  it("accepts a simple absolute path", () => {
    expect(isValidWorktreePath("/Users/dev/repo")).toBe(true);
  });

  it("accepts paths with dashes, underscores, and dots", () => {
    expect(isValidWorktreePath("/home/user/my-project_v2.0")).toBe(true);
  });

  it("accepts deeply nested absolute paths", () => {
    expect(isValidWorktreePath("/a/b/c/d/e/f/g")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidWorktreePath("")).toBe(false);
  });

  it("rejects relative paths", () => {
    expect(isValidWorktreePath("relative/path")).toBe(false);
  });

  it("rejects path with semicolons (command injection)", () => {
    expect(isValidWorktreePath("/tmp/foo;rm -rf /")).toBe(false);
  });

  it("rejects path with ampersands", () => {
    expect(isValidWorktreePath("/tmp/foo&bar")).toBe(false);
  });

  it("rejects path with pipe character", () => {
    expect(isValidWorktreePath("/tmp/foo|bar")).toBe(false);
  });

  it("rejects path with backticks", () => {
    expect(isValidWorktreePath("/tmp/`whoami`")).toBe(false);
  });

  it("rejects path with dollar sign (variable expansion)", () => {
    expect(isValidWorktreePath("/tmp/$HOME")).toBe(false);
  });

  it("rejects path with parentheses", () => {
    expect(isValidWorktreePath("/tmp/foo(bar)")).toBe(false);
  });

  it("rejects path with curly braces", () => {
    expect(isValidWorktreePath("/tmp/{a,b}")).toBe(false);
  });

  it("rejects path with exclamation mark", () => {
    expect(isValidWorktreePath("/tmp/foo!bar")).toBe(false);
  });

  it("rejects path with hash", () => {
    expect(isValidWorktreePath("/tmp/foo#bar")).toBe(false);
  });

  it("rejects path with double quotes", () => {
    expect(isValidWorktreePath('/tmp/foo"bar')).toBe(false);
  });

  it("rejects path with single quotes", () => {
    expect(isValidWorktreePath("/tmp/foo'bar")).toBe(false);
  });

  it("allows backslash in paths (valid Windows path separator, safe with execFile)", () => {
    expect(isValidWorktreePath("C:\\Users\\dev\\repo")).toBe(true);
  });

  it("rejects path with angle brackets", () => {
    expect(isValidWorktreePath("/tmp/foo<bar>")).toBe(false);
  });

  it("rejects path with newlines", () => {
    expect(isValidWorktreePath("/tmp/foo\nbar")).toBe(false);
  });

  it("rejects path with carriage return", () => {
    expect(isValidWorktreePath("/tmp/foo\rbar")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidWorktreePath(undefined as unknown as string)).toBe(false);
    expect(isValidWorktreePath(null as unknown as string)).toBe(false);
    expect(isValidWorktreePath(42 as unknown as string)).toBe(false);
  });

  // Windows path support
  it("accepts Windows absolute paths with backslashes", () => {
    expect(isValidWorktreePath("C:\\Users\\dev\\repo")).toBe(true);
    expect(isValidWorktreePath("D:\\Projects\\my-app")).toBe(true);
  });

  it("accepts Windows absolute paths with forward slashes", () => {
    expect(isValidWorktreePath("C:/Users/dev/repo")).toBe(true);
  });

  it("accepts Windows paths with spaces", () => {
    expect(isValidWorktreePath("C:\\Users\\My User\\Documents\\repo")).toBe(true);
  });

  it("rejects Windows paths with shell metacharacters", () => {
    expect(isValidWorktreePath("C:\\Users\\foo;bar")).toBe(false);
    expect(isValidWorktreePath("C:\\Users\\foo&bar")).toBe(false);
    expect(isValidWorktreePath("C:\\Users\\foo|bar")).toBe(false);
  });

  it("rejects paths that look like drive letters but are not absolute", () => {
    expect(isValidWorktreePath("C:relative")).toBe(false);
  });
});

describe("isSafeRepoRelativePath", () => {
  it("accepts a simple relative path", () => {
    expect(isSafeRepoRelativePath("src/index.ts")).toBe(true);
  });

  it("accepts a single filename", () => {
    expect(isSafeRepoRelativePath("README.md")).toBe(true);
  });

  it("accepts paths with dots and hyphens", () => {
    expect(isSafeRepoRelativePath("lib/my-module/file.test.ts")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isSafeRepoRelativePath("")).toBe(false);
  });

  it("rejects absolute paths (starts with /)", () => {
    expect(isSafeRepoRelativePath("/etc/passwd")).toBe(false);
  });

  it("rejects paths with null bytes", () => {
    expect(isSafeRepoRelativePath("src/\0evil.ts")).toBe(false);
  });

  it("rejects paths with newlines", () => {
    expect(isSafeRepoRelativePath("src/\nevil.ts")).toBe(false);
  });

  it("rejects paths with carriage returns", () => {
    expect(isSafeRepoRelativePath("src/\revil.ts")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isSafeRepoRelativePath(undefined as unknown as string)).toBe(false);
    expect(isSafeRepoRelativePath(null as unknown as string)).toBe(false);
  });
});

describe("isSafeRefName", () => {
  it("accepts simple branch names", () => {
    expect(isSafeRefName("main")).toBe(true);
    expect(isSafeRefName("develop")).toBe(true);
  });

  it("accepts branch names with slashes", () => {
    expect(isSafeRefName("feature/auth")).toBe(true);
    expect(isSafeRefName("bugfix/fix-login")).toBe(true);
  });

  it("accepts branch names with dots, hyphens, underscores", () => {
    expect(isSafeRefName("release-1.0.0")).toBe(true);
    expect(isSafeRefName("my_branch")).toBe(true);
    expect(isSafeRefName("v2.3.4")).toBe(true);
  });

  it("accepts refs like HEAD", () => {
    expect(isSafeRefName("HEAD")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isSafeRefName("")).toBe(false);
  });

  it("rejects names with spaces", () => {
    expect(isSafeRefName("my branch")).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(isSafeRefName("branch~1")).toBe(false);
    expect(isSafeRefName("branch^2")).toBe(false);
    expect(isSafeRefName("branch:ref")).toBe(false);
    expect(isSafeRefName("branch..main")).toBe(true); // dots are allowed
  });

  it("rejects names with shell injection characters", () => {
    expect(isSafeRefName("branch;rm -rf /")).toBe(false);
    expect(isSafeRefName("branch`whoami`")).toBe(false);
    expect(isSafeRefName("branch$(cmd)")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isSafeRefName(undefined as unknown as string)).toBe(false);
    expect(isSafeRefName(null as unknown as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GitService constructor
// ---------------------------------------------------------------------------

describe("GitService constructor", () => {
  it("accepts a valid absolute path", () => {
    expect(() => new GitService("/Users/dev/repo")).not.toThrow();
  });

  it("passes the path to simpleGit with expected options", () => {
    simpleGitMock.mockClear();
    new GitService("/Users/dev/repo");
    expect(simpleGitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseDir: "/Users/dev/repo",
        binary: "git",
        maxConcurrentProcesses: 1,
      }),
    );
  });

  it("throws on invalid path (relative)", () => {
    expect(() => new GitService("relative/path")).toThrow("Invalid repository path");
  });

  it("throws on empty path", () => {
    expect(() => new GitService("")).toThrow("Invalid repository path");
  });

  it("throws on path with shell metacharacters", () => {
    expect(() => new GitService("/tmp/foo;bar")).toThrow("Invalid repository path");
  });
});

// ---------------------------------------------------------------------------
// GitService.getStatus()
// ---------------------------------------------------------------------------

describe("GitService.getStatus()", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("returns properly structured result with staged and unstaged files", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [
        { path: "src/app.ts", index: "M", working_dir: " ", from: "" },
        { path: "src/utils.ts", index: " ", working_dir: "M", from: "" },
        { path: "new-file.ts", index: " ", working_dir: "?", from: "" },
      ],
    });

    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("5\t2\tsrc/utils.ts\n") // unstaged numstat
      .mockResolvedValueOnce("10\t3\tsrc/app.ts\n"); // staged numstat

    const result = await service.getStatus();

    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toEqual({
      path: "src/app.ts",
      oldPath: undefined,
      status: "modified",
      additions: 10,
      deletions: 3,
    });

    expect(result.unstaged).toHaveLength(2);
    expect(result.unstaged[0]).toEqual({
      path: "src/utils.ts",
      oldPath: undefined,
      status: "modified",
      additions: 5,
      deletions: 2,
    });

    // Untracked file (?) should appear as "added" with 0 additions/deletions
    expect(result.unstaged[1]).toEqual({
      path: "new-file.ts",
      oldPath: undefined,
      status: "added",
      additions: 0,
      deletions: 0,
    });

    expect(result.stats.filesChanged).toBe(3);
    expect(result.stats.additions).toBe(15);
    expect(result.stats.deletions).toBe(5);
  });

  it("handles empty repo (no files)", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({ files: [] });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("") // unstaged numstat
      .mockResolvedValueOnce(""); // staged numstat

    const result = await service.getStatus();

    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.stats).toEqual({ additions: 0, deletions: 0, filesChanged: 0 });
  });

  it("maps added status code correctly", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [{ path: "new.ts", index: "A", working_dir: " ", from: "" }],
    });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("20\t0\tnew.ts\n");

    const result = await service.getStatus();
    expect(result.staged[0].status).toBe("added");
  });

  it("maps deleted status code correctly", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [{ path: "old.ts", index: "D", working_dir: " ", from: "" }],
    });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("0\t15\told.ts\n");

    const result = await service.getStatus();
    expect(result.staged[0].status).toBe("deleted");
  });

  it("maps renamed status code correctly", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [{ path: "new-name.ts", index: "R100", working_dir: " ", from: "old-name.ts" }],
    });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("0\t0\told-name.ts\tnew-name.ts\n");

    const result = await service.getStatus();
    expect(result.staged[0].status).toBe("renamed");
    expect(result.staged[0].oldPath).toBe("old-name.ts");
  });

  it("maps copied status code correctly", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [{ path: "copy.ts", index: "C100", working_dir: " ", from: "orig.ts" }],
    });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("0\t0\torig.ts\tcopy.ts\n");

    const result = await service.getStatus();
    expect(result.staged[0].status).toBe("copied");
  });

  it("handles binary files in numstat (dash for additions/deletions)", async () => {
    simpleGitInstanceMock.status.mockResolvedValue({
      files: [{ path: "image.png", index: " ", working_dir: "M", from: "" }],
    });
    simpleGitInstanceMock.raw
      .mockResolvedValueOnce("-\t-\timage.png\n")
      .mockResolvedValueOnce("");

    const result = await service.getStatus();
    expect(result.unstaged[0].additions).toBe(0);
    expect(result.unstaged[0].deletions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GitService.getDiff()
// ---------------------------------------------------------------------------

describe("GitService.getDiff()", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("parses a simple unified diff with one modified file", async () => {
    const rawDiff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,4 @@",
      " line1",
      "-line2",
      "+line2-modified",
      "+line2-extra",
      " line3",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/app.ts");
    expect(result.files[0].status).toBe("modified");
    expect(result.files[0].additions).toBe(2);
    expect(result.files[0].deletions).toBe(1);
    expect(result.files[0].isBinary).toBe(false);
    expect(result.files[0].hunks).toHaveLength(1);
    expect(result.files[0].hunks[0].oldStart).toBe(1);
    expect(result.files[0].hunks[0].oldLines).toBe(3);
    expect(result.files[0].hunks[0].newStart).toBe(1);
    expect(result.files[0].hunks[0].newLines).toBe(4);

    // Verify line types
    const lines = result.files[0].hunks[0].lines;
    expect(lines[0].type).toBe("normal");
    expect(lines[0].content).toBe("line1");
    expect(lines[1].type).toBe("delete");
    expect(lines[1].content).toBe("line2");
    expect(lines[2].type).toBe("add");
    expect(lines[2].content).toBe("line2-modified");
    expect(lines[3].type).toBe("add");
    expect(lines[3].content).toBe("line2-extra");
    expect(lines[4].type).toBe("normal");
    expect(lines[4].content).toBe("line3");

    // Stats
    expect(result.stats.additions).toBe(2);
    expect(result.stats.deletions).toBe(1);
    expect(result.stats.filesChanged).toBe(1);
  });

  it("returns empty result for empty diff", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    const result = await service.getDiff({});

    expect(result.files).toEqual([]);
    expect(result.stats).toEqual({ additions: 0, deletions: 0, filesChanged: 0 });
  });

  it("returns empty result for whitespace-only diff", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("   \n  \n  ");

    const result = await service.getDiff({});

    expect(result.files).toEqual([]);
    expect(result.stats).toEqual({ additions: 0, deletions: 0, filesChanged: 0 });
  });

  it("handles new file mode", async () => {
    const rawDiff = [
      "diff --git a/new-file.ts b/new-file.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new-file.ts",
      "@@ -0,0 +1,2 @@",
      "+const a = 1;",
      "+export default a;",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files[0].status).toBe("added");
    expect(result.files[0].additions).toBe(2);
    expect(result.files[0].deletions).toBe(0);
  });

  it("handles deleted file mode", async () => {
    const rawDiff = [
      "diff --git a/old-file.ts b/old-file.ts",
      "deleted file mode 100644",
      "--- a/old-file.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-const a = 1;",
      "-export default a;",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files[0].status).toBe("deleted");
    expect(result.files[0].additions).toBe(0);
    expect(result.files[0].deletions).toBe(2);
  });

  it("handles renamed files", async () => {
    const rawDiff = [
      "diff --git a/old-name.ts b/new-name.ts",
      "similarity index 90%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "--- a/old-name.ts",
      "+++ b/new-name.ts",
      "@@ -1,3 +1,3 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      " export { a, b };",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files[0].status).toBe("renamed");
    expect(result.files[0].path).toBe("new-name.ts");
    expect(result.files[0].oldPath).toBe("old-name.ts");
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(1);
  });

  it("handles binary files", async () => {
    const rawDiff = [
      "diff --git a/image.png b/image.png",
      "Binary files a/image.png and b/image.png differ",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files[0].isBinary).toBe(true);
    expect(result.files[0].hunks).toEqual([]);
  });

  it("handles multiple files in a single diff", async () => {
    const rawDiff = [
      "diff --git a/file1.ts b/file1.ts",
      "--- a/file1.ts",
      "+++ b/file1.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "diff --git a/file2.ts b/file2.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/file2.ts",
      "@@ -0,0 +1,1 @@",
      "+content",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("file1.ts");
    expect(result.files[1].path).toBe("file2.ts");
    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.additions).toBe(2);
    expect(result.stats.deletions).toBe(1);
  });

  it("handles multiple hunks in one file", async () => {
    const rawDiff = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1,3 +1,3 @@",
      " header",
      "-old-line-2",
      "+new-line-2",
      " footer",
      "@@ -20,3 +20,3 @@",
      " middle",
      "-old-line-21",
      "+new-line-21",
      " end",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    expect(result.files[0].hunks).toHaveLength(2);
    expect(result.files[0].hunks[0].oldStart).toBe(1);
    expect(result.files[0].hunks[1].oldStart).toBe(20);
  });

  it("generates hunk patch with correct format", async () => {
    const rawDiff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,3 @@",
      " unchanged",
      "-removed",
      "+added",
      " unchanged2",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    const patch = result.files[0].hunks[0].patch;
    expect(patch).toContain("diff --git a/src/app.ts b/src/app.ts");
    expect(patch).toContain("--- a/src/app.ts");
    expect(patch).toContain("+++ b/src/app.ts");
    expect(patch).toContain("@@ -1,3 +1,3 @@");
    expect(patch).toContain(" unchanged");
    expect(patch).toContain("-removed");
    expect(patch).toContain("+added");
  });

  it("generates patch with /dev/null for added files", async () => {
    const rawDiff = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,1 @@",
      "+hello",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    const patch = result.files[0].hunks[0].patch;
    expect(patch).toContain("--- /dev/null");
    expect(patch).toContain("+++ b/new.ts");
  });

  it("generates patch with /dev/null for deleted files", async () => {
    const rawDiff = [
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-bye",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});

    const patch = result.files[0].hunks[0].patch;
    expect(patch).toContain("--- a/gone.ts");
    expect(patch).toContain("+++ /dev/null");
  });

  it("tracks line numbers correctly for add/delete/normal lines", async () => {
    const rawDiff = [
      "diff --git a/f.ts b/f.ts",
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -5,4 +5,5 @@",
      " context",
      "-removed",
      "+added1",
      "+added2",
      " more-context",
    ].join("\n");

    simpleGitInstanceMock.raw.mockResolvedValue(rawDiff);

    const result = await service.getDiff({});
    const lines = result.files[0].hunks[0].lines;

    // normal: oldLineNumber=5, newLineNumber=5
    expect(lines[0]).toMatchObject({ type: "normal", oldLineNumber: 5, newLineNumber: 5 });
    // delete: oldLineNumber=6
    expect(lines[1]).toMatchObject({ type: "delete", oldLineNumber: 6 });
    // add: newLineNumber=6
    expect(lines[2]).toMatchObject({ type: "add", newLineNumber: 6 });
    // add: newLineNumber=7
    expect(lines[3]).toMatchObject({ type: "add", newLineNumber: 7 });
    // normal: oldLineNumber=7, newLineNumber=8
    expect(lines[4]).toMatchObject({ type: "normal", oldLineNumber: 7, newLineNumber: 8 });
  });

  // --- diff type / filter tests ---

  it("defaults type to 'unstaged'", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({});

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["diff", "--unified=3"]);
  });

  it("passes --cached for staged diff", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({ type: "staged" });

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["diff", "--cached", "--unified=3"]);
  });

  it("uses triple-dot syntax for branch diff", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({ type: "branch", base: "main" });

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["diff", "main...HEAD"]);
  });

  it("uses custom head for branch diff", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({ type: "branch", base: "main", head: "feature/test" });

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["diff", "main...feature/test"]);
  });

  it("throws when branch diff is missing base", async () => {
    await expect(service.getDiff({ type: "branch" })).rejects.toThrow(
      "Base branch is required for branch diff",
    );
  });

  it("throws when branch diff base ref is unsafe", async () => {
    await expect(
      service.getDiff({ type: "branch", base: "main;rm -rf /" }),
    ).rejects.toThrow("Invalid git reference");
  });

  it("throws when branch diff head ref is unsafe", async () => {
    await expect(
      service.getDiff({ type: "branch", base: "main", head: "branch`whoami`" }),
    ).rejects.toThrow("Invalid git reference");
  });

  it("appends -- filePath when filePath is provided", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({ filePath: "src/app.ts" });

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith([
      "diff",
      "--unified=3",
      "--",
      "src/app.ts",
    ]);
  });

  it("throws when filePath is absolute (not repo-relative)", async () => {
    await expect(service.getDiff({ filePath: "/etc/passwd" })).rejects.toThrow(
      "Invalid repository-relative file path",
    );
  });

  it("normalizes unknown type to 'unstaged'", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.getDiff({ type: "whatever" });

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["diff", "--unified=3"]);
  });
});

// ---------------------------------------------------------------------------
// GitService.stage()
// ---------------------------------------------------------------------------

describe("GitService.stage()", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("'stage' action calls git add with the file path", async () => {
    simpleGitInstanceMock.add.mockResolvedValue(undefined);

    await service.stage("stage", "src/app.ts");

    expect(simpleGitInstanceMock.add).toHaveBeenCalledWith(["--", "src/app.ts"]);
  });

  it("'unstage' action calls git restore --staged", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.stage("unstage", "src/app.ts");

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith([
      "restore",
      "--staged",
      "--",
      "src/app.ts",
    ]);
  });

  it("'stage-all' calls git add -A", async () => {
    simpleGitInstanceMock.add.mockResolvedValue(undefined);

    await service.stage("stage-all");

    expect(simpleGitInstanceMock.add).toHaveBeenCalledWith(["-A"]);
  });

  it("'unstage-all' calls git restore --staged .", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.stage("unstage-all");

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith(["restore", "--staged", "."]);
  });

  it("hunk staging applies patch with --cached via spawnWithFileCapture", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
    });

    const hunkPatch = "diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";

    await service.stage("stage", "src/app.ts", hunkPatch);

    // When hunkPatch is provided, it should apply the patch directly (not use git add)
    expect(simpleGitInstanceMock.add).not.toHaveBeenCalled();
    // runGitRawWithInput always uses spawnWithFileCapture
    expect(spawnMock.spawnWithFileCapture).toHaveBeenCalledWith(
      "git",
      ["apply", "--cached", "--whitespace=nowarn", "-"],
      "/repo",
      expect.any(Object),
      30_000,
      10 * 1024 * 1024,
      hunkPatch,
    );
  });

  it("hunk unstaging applies patch with --cached --reverse", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
    });

    const hunkPatch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";

    await service.stage("unstage", undefined, hunkPatch);

    expect(spawnMock.spawnWithFileCapture).toHaveBeenCalledWith(
      "git",
      ["apply", "--cached", "--reverse", "--whitespace=nowarn", "-"],
      "/repo",
      expect.any(Object),
      30_000,
      10 * 1024 * 1024,
      hunkPatch,
    );
  });

  it("throws when filePath is missing for 'stage' action without hunk patch", async () => {
    await expect(service.stage("stage")).rejects.toThrow("filePath is required");
  });

  it("throws when filePath is missing for 'unstage' action without hunk patch", async () => {
    await expect(service.stage("unstage")).rejects.toThrow("filePath is required");
  });

  it("throws when filePath is invalid (absolute path)", async () => {
    await expect(service.stage("stage", "/etc/passwd")).rejects.toThrow(
      "Invalid repository-relative file path",
    );
  });

  it("normalizes unknown action to 'stage'", async () => {
    simpleGitInstanceMock.add.mockResolvedValue(undefined);

    await service.stage("whatever", "file.ts");

    expect(simpleGitInstanceMock.add).toHaveBeenCalledWith(["--", "file.ts"]);
  });

  it("ignores empty/whitespace-only hunk patch and falls back to file-level staging", async () => {
    simpleGitInstanceMock.add.mockResolvedValue(undefined);

    await service.stage("stage", "file.ts", "   ");

    expect(simpleGitInstanceMock.add).toHaveBeenCalledWith(["--", "file.ts"]);
    expect(spawnMock.spawnWithFileCapture).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GitService.revert()
// ---------------------------------------------------------------------------

describe("GitService.revert()", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("file revert calls git restore --worktree", async () => {
    simpleGitInstanceMock.raw.mockResolvedValue("");

    await service.revert("src/app.ts");

    expect(simpleGitInstanceMock.raw).toHaveBeenCalledWith([
      "restore",
      "--worktree",
      "--",
      "src/app.ts",
    ]);
  });

  it("hunk revert applies reverse patch via spawnWithFileCapture", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
    });

    const hunkPatch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";

    await service.revert("src/app.ts", hunkPatch);

    // Should NOT call git restore since hunkPatch is provided
    // Instead should apply reverse patch
    expect(spawnMock.spawnWithFileCapture).toHaveBeenCalledWith(
      "git",
      ["apply", "--reverse", "--whitespace=nowarn", "-"],
      "/repo",
      expect.any(Object),
      30_000,
      10 * 1024 * 1024,
      hunkPatch,
    );
  });

  it("throws on invalid file path (absolute)", async () => {
    await expect(service.revert("/etc/passwd")).rejects.toThrow(
      "Invalid repository-relative file path",
    );
  });

  it("throws on file path with null bytes", async () => {
    await expect(service.revert("src/\0evil.ts")).rejects.toThrow(
      "Invalid repository-relative file path",
    );
  });

  it("throws on empty file path", async () => {
    await expect(service.revert("")).rejects.toThrow(
      "Invalid repository-relative file path",
    );
  });
});

// ---------------------------------------------------------------------------
// GitService.commit()
// ---------------------------------------------------------------------------

describe("GitService.commit()", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("returns commit hash and summary", async () => {
    simpleGitInstanceMock.commit.mockResolvedValue({
      commit: "abc1234",
      summary: {
        changes: 3,
        insertions: 10,
        deletions: 5,
      },
    });

    const result = await service.commit("feat: add new feature");

    expect(result).toEqual({
      commit: "abc1234",
      summary: {
        changes: 3,
        insertions: 10,
        deletions: 5,
      },
    });
    expect(simpleGitInstanceMock.commit).toHaveBeenCalledWith("feat: add new feature");
  });

  it("throws on empty message", async () => {
    await expect(service.commit("")).rejects.toThrow("Commit message is required");
  });

  it("throws on whitespace-only message", async () => {
    await expect(service.commit("   \n  \t  ")).rejects.toThrow("Commit message is required");
  });

  it("trims whitespace from the message before committing", async () => {
    simpleGitInstanceMock.commit.mockResolvedValue({
      commit: "def5678",
      summary: { changes: 1, insertions: 1, deletions: 0 },
    });

    await service.commit("  fix: trim whitespace  \n");

    expect(simpleGitInstanceMock.commit).toHaveBeenCalledWith("fix: trim whitespace");
  });

  it("propagates errors from git.commit", async () => {
    simpleGitInstanceMock.commit.mockRejectedValue(new Error("nothing to commit"));

    await expect(service.commit("some message")).rejects.toThrow("nothing to commit");
  });
});

// ---------------------------------------------------------------------------
// GitService EBADF fallback (runGitRaw)
// ---------------------------------------------------------------------------

describe("GitService EBADF fallback", () => {
  let service: GitService;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService("/repo");
  });

  it("falls back to spawnWithFileCapture on EBADF error (macOS)", async () => {
    // Simulate macOS
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const ebadfError = new Error("EBADF");
    (ebadfError as NodeJS.ErrnoException).code = "EBADF";

    simpleGitInstanceMock.raw.mockRejectedValue(ebadfError);
    spawnMock.isEBADFError.mockReturnValue(true);
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
    });

    // getDiff calls runGitRaw internally
    const result = await service.getDiff({});

    expect(spawnMock.spawnWithFileCapture).toHaveBeenCalledWith(
      "git",
      ["diff", "--unified=3"],
      "/repo",
      expect.any(Object),
      30_000,
      10 * 1024 * 1024,
    );
    expect(result.files).toEqual([]);

    // Restore
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("throws timeout error when spawnWithFileCapture times out", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const ebadfError = new Error("EBADF");
    simpleGitInstanceMock.raw.mockRejectedValue(ebadfError);
    spawnMock.isEBADFError.mockReturnValue(true);
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: "SIGTERM",
      timedOut: true,
    });

    await expect(service.getDiff({})).rejects.toThrow("Git command timed out");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("throws error with stderr detail when spawn fallback exits non-zero", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const ebadfError = new Error("EBADF");
    simpleGitInstanceMock.raw.mockRejectedValue(ebadfError);
    spawnMock.isEBADFError.mockReturnValue(true);
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "fatal: bad revision",
      exitCode: 128,
      signal: null,
      timedOut: false,
    });

    await expect(service.getDiff({})).rejects.toThrow("Git command failed: fatal: bad revision");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("re-throws non-EBADF errors without fallback", async () => {
    const genericError = new Error("some random git error");
    simpleGitInstanceMock.raw.mockRejectedValue(genericError);
    spawnMock.isEBADFError.mockReturnValue(false);

    await expect(service.getDiff({})).rejects.toThrow("some random git error");
    expect(spawnMock.spawnWithFileCapture).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GitService.runGitRawWithInput error handling
// ---------------------------------------------------------------------------

describe("GitService runGitRawWithInput error handling", () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.isEBADFError.mockReturnValue(false);
    service = new GitService("/repo");
  });

  it("throws timeout error when applyPatch times out", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: "SIGTERM",
      timedOut: true,
    });

    const patch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    await expect(service.revert("f.ts", patch)).rejects.toThrow("Git command timed out");
  });

  it("throws with stderr when applyPatch fails", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "error: patch does not apply",
      exitCode: 1,
      signal: null,
      timedOut: false,
    });

    const patch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    await expect(service.revert("f.ts", patch)).rejects.toThrow(
      "Git command failed: error: patch does not apply",
    );
  });

  it("uses stdout when stderr is empty on failure", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "some stdout info",
      stderr: "",
      exitCode: 1,
      signal: null,
      timedOut: false,
    });

    const patch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    await expect(service.revert("f.ts", patch)).rejects.toThrow(
      "Git command failed: some stdout info",
    );
  });

  it("uses exit code when both stdout and stderr are empty on failure", async () => {
    spawnMock.spawnWithFileCapture.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 128,
      signal: null,
      timedOut: false,
    });

    const patch = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    await expect(service.revert("f.ts", patch)).rejects.toThrow(
      "Git command failed: exit code 128",
    );
  });
});
