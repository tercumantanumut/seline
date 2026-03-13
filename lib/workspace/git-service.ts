import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { spawnWithFileCapture, isEBADFError } from "@/lib/spawn-utils";
import type {
  GitDiffFile,
  GitDiffHunk,
  GitDiffLine,
  GitDiffResult,
  GitFileStatus,
  GitStatusResult,
} from "@/lib/workspace/types";

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

export type GitDiffType = "unstaged" | "staged" | "branch";
export type GitStageAction = "stage" | "unstage" | "stage-all" | "unstage-all";

interface DiffFilter {
  type?: string;
  filePath?: string;
  base?: string;
  head?: string;
}

interface ApplyPatchOptions {
  reverse?: boolean;
  cached?: boolean;
}

export interface GitCommitResult {
  commit: string;
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
}

export interface GitAheadBehindResult {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  comparisonRef?: string;
}

export function isValidWorktreePath(pathStr: string): boolean {
  if (typeof pathStr !== "string" || pathStr.length === 0) return false;
  // Accept Unix absolute paths (/...) and Windows absolute paths (C:\... or C:/...)
  const isAbsolute = pathStr.startsWith("/") || /^[A-Za-z]:[/\\]/.test(pathStr);
  if (!isAbsolute) return false;
  // Reject shell metacharacters. Backslashes are allowed since they are
  // normal path separators on Windows and paths are passed to execFile (no shell).
  return !/[;&|`$(){}!#"'<>\n\r]/.test(pathStr);
}

export function isSafeRepoRelativePath(filePath: string): boolean {
  return (
    typeof filePath === "string" &&
    filePath.length > 0 &&
    !filePath.startsWith("/") &&
    !filePath.includes("\0") &&
    !filePath.includes("\n") &&
    !filePath.includes("\r")
  );
}

export function isSafeRefName(refName: string): boolean {
  return typeof refName === "string" && refName.length > 0 && /^[a-zA-Z0-9._\-/]+$/.test(refName);
}

function assertSafeRepoRelativePath(filePath: string): void {
  if (!isSafeRepoRelativePath(filePath)) {
    throw new Error("Invalid repository-relative file path");
  }
}

function assertSafeRefName(refName: string): void {
  if (!isSafeRefName(refName)) {
    throw new Error("Invalid git reference");
  }
}

function normalizeDiffType(type?: string): GitDiffType {
  if (type === "staged" || type === "branch") return type;
  return "unstaged";
}

function normalizeStageAction(action?: string): GitStageAction {
  if (action === "unstage" || action === "stage-all" || action === "unstage-all") {
    return action;
  }
  return "stage";
}

function mapStatusCode(code: string): GitFileStatus["status"] {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code.startsWith("R")) return "renamed";
  if (code.startsWith("C")) return "copied";
  return "modified";
}

function parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const result = new Map<string, { additions: number; deletions: number }>();
  if (!output.trim()) return result;

  for (const line of output.trim().split("\n")) {
    const [a, d, ...pathParts] = line.split("\t");
    if (pathParts.length === 0) continue;
    const path = pathParts[pathParts.length - 1] ?? "";
    if (!path) continue;
    result.set(path, {
      additions: a === "-" ? 0 : Number(a || 0),
      deletions: d === "-" ? 0 : Number(d || 0),
    });
  }

  return result;
}

function toGitStatusResult(
  status: StatusResult,
  unstagedNumstat: Map<string, { additions: number; deletions: number }>,
  stagedNumstat: Map<string, { additions: number; deletions: number }>
): GitStatusResult {
  const stagedMap = new Map<string, GitFileStatus>();
  const unstagedMap = new Map<string, GitFileStatus>();

  for (const file of status.files) {
    const path = file.path;
    const oldPath = file.from || undefined;
    const stagedStatusCode = (file.index || "").trim();
    const unstagedStatusCode = (file.working_dir || "").trim();

    if (stagedStatusCode && stagedStatusCode !== "?") {
      const stat = stagedNumstat.get(path);
      stagedMap.set(path, {
        path,
        oldPath,
        status: mapStatusCode(stagedStatusCode),
        additions: stat?.additions || 0,
        deletions: stat?.deletions || 0,
      });
    }

    if (unstagedStatusCode && unstagedStatusCode !== "?") {
      const stat = unstagedNumstat.get(path);
      unstagedMap.set(path, {
        path,
        oldPath,
        status: mapStatusCode(unstagedStatusCode),
        additions: stat?.additions || 0,
        deletions: stat?.deletions || 0,
      });
    }

    if (unstagedStatusCode === "?") {
      unstagedMap.set(path, {
        path,
        oldPath,
        status: "added",
        additions: 0,
        deletions: 0,
      });
    }
  }

  const staged = Array.from(stagedMap.values());
  const unstaged = Array.from(unstagedMap.values());
  const stats = [...staged, ...unstaged].reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { additions: 0, deletions: 0, filesChanged: staged.length + unstaged.length }
  );

  return { staged, unstaged, stats };
}

function parseUnifiedDiff(rawDiff: string): GitDiffResult {
  if (!rawDiff.trim()) {
    return {
      files: [],
      stats: { additions: 0, deletions: 0, filesChanged: 0 },
    };
  }

  const lines = rawDiff.split("\n");
  const files: GitDiffFile[] = [];
  let currentFile: GitDiffFile | null = null;
  let currentHunk: GitDiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  const pushCurrentHunk = () => {
    if (currentFile && currentHunk) {
      currentFile.hunks.push(currentHunk);
      currentHunk = null;
    }
  };

  const pushCurrentFile = () => {
    pushCurrentHunk();
    if (currentFile) {
      files.push(currentFile);
      currentFile = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushCurrentFile();
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        path: match?.[2] || "",
        status: "modified",
        additions: 0,
        deletions: 0,
        isBinary: false,
        hunks: [],
      };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("new file mode ")) {
      currentFile.status = "added";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      currentFile.status = "deleted";
      continue;
    }

    if (line.startsWith("rename from ")) {
      currentFile.status = "renamed";
      currentFile.oldPath = line.slice("rename from ".length).trim();
      continue;
    }

    if (line.startsWith("rename to ")) {
      currentFile.path = line.slice("rename to ".length).trim();
      continue;
    }

    if (line.startsWith("Binary files ")) {
      currentFile.isBinary = true;
      continue;
    }

    if (line.startsWith("@@ ")) {
      pushCurrentHunk();
      const match = line.match(HUNK_HEADER_RE);
      const oldStart = Number(match?.[1] || 0);
      const oldLines = Number(match?.[2] || 1);
      const newStart = Number(match?.[3] || 0);
      const newLines = Number(match?.[4] || 1);

      oldLineNumber = oldStart;
      newLineNumber = newStart;

      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
        patch: "",
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1), newLineNumber });
      currentFile.additions += 1;
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      currentHunk.lines.push({ type: "delete", content: line.slice(1), oldLineNumber });
      currentFile.deletions += 1;
      oldLineNumber += 1;
      continue;
    }

    currentHunk.lines.push({
      type: "normal",
      content: line.startsWith(" ") ? line.slice(1) : line,
      oldLineNumber,
      newLineNumber,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  pushCurrentFile();

  for (const file of files) {
    for (const hunk of file.hunks) {
      hunk.patch = buildHunkPatch(file, hunk);
    }
  }

  const stats = files.reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { additions: 0, deletions: 0, filesChanged: files.length }
  );

  return { files, stats };
}

function buildHunkPatch(file: GitDiffFile, hunk: GitDiffHunk): string {
  const oldPath = file.oldPath || file.path;
  const diffHeader = `diff --git a/${oldPath} b/${file.path}`;
  const fromLine = file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`;
  const toLine = file.status === "deleted" ? "+++ /dev/null" : `+++ b/${file.path}`;
  const patchBody = hunk.lines
    .map((line: GitDiffLine) => {
      if (line.type === "add") return `+${line.content}`;
      if (line.type === "delete") return `-${line.content}`;
      return ` ${line.content}`;
    })
    .join("\n");

  return `${diffHeader}\n${fromLine}\n${toLine}\n${hunk.header}\n${patchBody}\n`;
}

export class GitService {
  private readonly git: SimpleGit;

  constructor(private readonly repoPath: string) {
    if (!isValidWorktreePath(repoPath)) {
      throw new Error("Invalid repository path");
    }

    this.git = simpleGit({
      baseDir: repoPath,
      binary: "git",
      maxConcurrentProcesses: 1,
      trimmed: false,
      timeout: {
        block: GIT_TIMEOUT_MS,
      },
    });
  }

  private async runGitRaw(args: string[]): Promise<string> {
    try {
      return await this.git.raw(args);
    } catch (error) {
      if (isEBADFError(error) && process.platform === "darwin") {
        const fb = await spawnWithFileCapture(
          "git",
          args,
          this.repoPath,
          process.env as NodeJS.ProcessEnv,
          GIT_TIMEOUT_MS,
          GIT_MAX_OUTPUT_BYTES,
        );
        if (fb.timedOut) {
          throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS}ms`);
        }
        if ((fb.exitCode ?? 1) !== 0) {
          const detail = fb.stderr.trim() || fb.stdout.trim() || `exit code ${fb.exitCode ?? 1}`;
          throw new Error(`Git command failed: ${detail}`);
        }
        return fb.stdout;
      }
      throw error;
    }
  }

  private async runGitRawWithInput(args: string[], input: string): Promise<string> {
    const fb = await spawnWithFileCapture(
      "git",
      args,
      this.repoPath,
      process.env as NodeJS.ProcessEnv,
      GIT_TIMEOUT_MS,
      GIT_MAX_OUTPUT_BYTES,
      input,
    );

    if (fb.timedOut) {
      throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS}ms`);
    }

    if ((fb.exitCode ?? 1) !== 0) {
      const detail = fb.stderr.trim() || fb.stdout.trim() || `exit code ${fb.exitCode ?? 1}`;
      throw new Error(`Git command failed: ${detail}`);
    }

    return fb.stdout;
  }

  private async applyPatch(patch: string, options: ApplyPatchOptions = {}): Promise<void> {
    const args = ["apply"];
    if (options.cached) args.push("--cached");
    if (options.reverse) args.push("--reverse");
    args.push("--whitespace=nowarn", "-");
    await this.runGitRawWithInput(args, patch);
  }

  async getStatus(): Promise<GitStatusResult> {
    const [status, unstagedNumstatOutput, stagedNumstatOutput] = await Promise.all([
      this.git.status(),
      this.runGitRaw(["diff", "--numstat"]),
      this.runGitRaw(["diff", "--cached", "--numstat"]),
    ]);

    return toGitStatusResult(
      status,
      parseNumstat(unstagedNumstatOutput),
      parseNumstat(stagedNumstatOutput),
    );
  }

  async getDiff(filter: DiffFilter): Promise<GitDiffResult> {
    const type = normalizeDiffType(filter.type);
    const args: string[] = ["diff", "--unified=3"];

    if (type === "staged") {
      args.splice(1, 0, "--cached");
    } else if (type === "branch") {
      if (!filter.base) {
        throw new Error("Base branch is required for branch diff");
      }
      const head = filter.head || "HEAD";
      assertSafeRefName(filter.base);
      assertSafeRefName(head);
      args[1] = `${filter.base}...${head}`;
    }

    if (filter.filePath) {
      assertSafeRepoRelativePath(filter.filePath);
      args.push("--", filter.filePath);
    }

    const raw = await this.runGitRaw(args);
    return parseUnifiedDiff(raw);
  }

  async stage(action: string, filePath?: string, hunkPatch?: string): Promise<void> {
    const normalized = normalizeStageAction(action);

    if (normalized === "stage-all") {
      await this.git.add(["-A"]);
      return;
    }

    if (normalized === "unstage-all") {
      await this.runGitRaw(["restore", "--staged", "."]);
      return;
    }

    if (hunkPatch && hunkPatch.trim()) {
      await this.applyPatch(hunkPatch, {
        cached: true,
        reverse: normalized === "unstage",
      });
      return;
    }

    if (!filePath) {
      throw new Error("filePath is required");
    }
    assertSafeRepoRelativePath(filePath);

    if (normalized === "stage") {
      await this.git.add(["--", filePath]);
      return;
    }

    await this.runGitRaw(["restore", "--staged", "--", filePath]);
  }

  async revert(filePath: string, hunkPatch?: string): Promise<void> {
    assertSafeRepoRelativePath(filePath);

    if (hunkPatch && hunkPatch.trim()) {
      await this.applyPatch(hunkPatch, { reverse: true });
      return;
    }

    await this.runGitRaw(["restore", "--worktree", "--", filePath]);
  }

  async commit(message: string): Promise<GitCommitResult> {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      throw new Error("Commit message is required");
    }

    const result = await this.git.commit(normalizedMessage);
    return {
      commit: result.commit,
      summary: {
        changes: result.summary.changes,
        insertions: result.summary.insertions,
        deletions: result.summary.deletions,
      },
    };
  }

  async push(remote = "origin", branch?: string): Promise<string> {
    const normalizedRemote = remote.trim();
    if (!isSafeRefName(normalizedRemote)) {
      throw new Error("Invalid git remote");
    }

    const targetBranch = (branch?.trim() || await this.runGitRaw(["branch", "--show-current"])).trim();
    assertSafeRefName(targetBranch);
    return this.runGitRaw(["push", "-u", normalizedRemote, targetBranch]);
  }

  async getAheadBehind(baseBranch?: string): Promise<GitAheadBehindResult> {
    let comparisonRef: string | undefined;

    try {
      comparisonRef = (await this.runGitRaw(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
    } catch {
      comparisonRef = undefined;
    }

    if (!comparisonRef && baseBranch) {
      assertSafeRefName(baseBranch);
      for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
        try {
          await this.runGitRaw(["rev-parse", "--verify", candidate]);
          comparisonRef = candidate;
          break;
        } catch {
          // Try the next fallback ref.
        }
      }
    }

    if (!comparisonRef) {
      return { ahead: 0, behind: 0, hasUpstream: false };
    }

    const counts = (await this.runGitRaw(["rev-list", "--left-right", "--count", `${comparisonRef}...HEAD`])).trim();
    const [behindRaw = "0", aheadRaw = "0"] = counts.split(/\s+/);

    return {
      ahead: Number(aheadRaw) || 0,
      behind: Number(behindRaw) || 0,
      hasUpstream: comparisonRef.includes("/"),
      comparisonRef,
    };
  }

  async getCommitLog(baseBranch: string, maxCount = 20): Promise<string> {
    assertSafeRefName(baseBranch);
    const normalizedCount = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 20;
    return this.runGitRaw([
      "log",
      `${baseBranch}..HEAD`,
      "--oneline",
      "--no-decorate",
      `--max-count=${normalizedCount}`,
    ]);
  }
}
