import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import * as fs from "fs";
import { promisify } from "util";
import {
  getSession,
  updateSession,
  getOrCreateLocalUser,
} from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getWorkspaceInfo } from "@/lib/workspace/types";
import { isEBADFError, spawnWithFileCapture } from "@/lib/spawn-utils";
import type {
  WorkspaceInfo,
  WorkspaceStatus,
  WorkspaceAction,
} from "@/lib/workspace/types";

const execFileAsync = promisify(execFile);

// Validate that a path is safe for use in shell commands
function isValidWorktreePath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !/[;&|`$(){}!#"'\\<>\n\r]/.test(path)
  );
}

// Validate that a branch name is safe for use in shell commands
function isValidBranchName(name: string): boolean {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length < 256 &&
    /^[a-zA-Z0-9._\-/]+$/.test(name)
  );
}

const WORKSPACE_TYPES = new Set<WorkspaceInfo["type"]>(["worktree", "local", "clone"]);
const WORKSPACE_STATUSES = new Set<WorkspaceInfo["status"]>([
  "active",
  "changes-ready",
  "pr-open",
  "merged",
  "cleanup-pending",
]);
const WORKSPACE_PR_STATUSES = new Set<NonNullable<WorkspaceInfo["prStatus"]>>([
  "draft",
  "open",
  "merged",
  "closed",
]);

function sanitizeWorkspacePatch(payload: unknown): Partial<WorkspaceInfo> {
  if (!payload || typeof payload !== "object") return {};

  const body = payload as Record<string, unknown>;
  const safePayload: Partial<WorkspaceInfo> = {};

  if (typeof body.type === "string" && WORKSPACE_TYPES.has(body.type as WorkspaceInfo["type"])) {
    safePayload.type = body.type as WorkspaceInfo["type"];
  }
  if (typeof body.branch === "string" && isValidBranchName(body.branch)) {
    safePayload.branch = body.branch;
  }
  if (typeof body.baseBranch === "string" && isValidBranchName(body.baseBranch)) {
    safePayload.baseBranch = body.baseBranch;
  }
  if (typeof body.worktreePath === "string") {
    safePayload.worktreePath = body.worktreePath;
  }
  if (typeof body.repoUrl === "string") {
    safePayload.repoUrl = body.repoUrl;
  }
  if (typeof body.prUrl === "string") {
    safePayload.prUrl = body.prUrl;
  }
  if (typeof body.prNumber === "number" && Number.isFinite(body.prNumber)) {
    safePayload.prNumber = body.prNumber;
  }
  if (
    typeof body.prStatus === "string" &&
    WORKSPACE_PR_STATUSES.has(body.prStatus as NonNullable<WorkspaceInfo["prStatus"]>)
  ) {
    safePayload.prStatus = body.prStatus as NonNullable<WorkspaceInfo["prStatus"]>;
  }
  if (
    typeof body.status === "string" &&
    WORKSPACE_STATUSES.has(body.status as WorkspaceInfo["status"])
  ) {
    safePayload.status = body.status as WorkspaceInfo["status"];
  }
  if (typeof body.changedFiles === "number" && Number.isFinite(body.changedFiles)) {
    safePayload.changedFiles = body.changedFiles;
  }
  if (typeof body.lastSyncedAt === "string") {
    safePayload.lastSyncedAt = body.lastSyncedAt;
  }
  if (typeof body.syncFolderId === "string") {
    safePayload.syncFolderId = body.syncFolderId;
  }

  return safePayload;
}

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

// Default git options for child process git commands
function gitExecOptions(cwd: string) {
  return {
    cwd,
    encoding: "utf-8" as const,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_OUTPUT_BYTES,
  };
}

async function runGitCommand(cwd: string, args: string[], input?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      ...gitExecOptions(cwd),
      input,
    });
    return stdout;
  } catch (error) {
    if (isEBADFError(error) && process.platform === "darwin") {
      console.warn("[workspace route] git execFile EBADF - retrying with file-capture fallback");
      const fb = await spawnWithFileCapture(
        "git",
        args,
        cwd,
        process.env as NodeJS.ProcessEnv,
        GIT_TIMEOUT_MS,
        GIT_MAX_OUTPUT_BYTES,
        input,
      );
      const exitCode = fb.exitCode ?? 1;
      if (fb.timedOut) {
        throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS}ms`);
      }
      if (exitCode !== 0) {
        const detail = fb.stderr.trim() || fb.stdout.trim() || `exit code ${exitCode}`;
        throw new Error(`Git command failed: ${detail}`);
      }
      return fb.stdout;
    }
    throw error;
  }
}

// Parse `git status --porcelain` output into changed file list
function parseGitPorcelain(
  output: string
): Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }> {
  if (!output.trim()) return [];

  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.substring(0, 2).trim();
      const filePath = line.substring(3);
      let status: "added" | "modified" | "deleted" | "renamed" = "modified";
      if (statusCode === "A" || statusCode === "??") status = "added";
      else if (statusCode === "D") status = "deleted";
      else if (statusCode.startsWith("R")) status = "renamed";
      return { path: filePath, status };
    });
}

// Get live git status for a worktree path
// Includes both uncommitted changes AND committed changes ahead of baseBranch
async function getLiveGitStatus(worktreePath: string, baseBranch?: string): Promise<{
  changedFileList: WorkspaceStatus["changedFileList"];
  changedFiles: number;
  diffStat: string | undefined;
  worktreeExists: boolean;
}> {
  if (!isValidWorktreePath(worktreePath) || !fs.existsSync(worktreePath)) {
    return {
      changedFileList: [],
      changedFiles: 0,
      diffStat: undefined,
      worktreeExists: false,
    };
  }

  try {
    // First check uncommitted changes
    const porcelain = await runGitCommand(worktreePath, ["status", "--porcelain"]);
    let changedFileList = parseGitPorcelain(porcelain);

    let diffStat: string | undefined;

    if (changedFileList.length > 0) {
      // There are uncommitted changes — show those
      try {
        diffStat = (await runGitCommand(worktreePath, ["diff", "--stat"])).trim() || undefined;
      } catch {
        // diff --stat can fail if there are no commits yet
      }
    } else if (baseBranch && isValidBranchName(baseBranch)) {
      // No uncommitted changes — check committed changes ahead of baseBranch
      try {
        const branchDiff = (
          await runGitCommand(worktreePath, ["diff", "--name-status", `${baseBranch}...HEAD`])
        ).trim();

        if (branchDiff) {
          changedFileList = branchDiff.split("\n").filter(Boolean).map((line) => {
            const [statusCode, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t"); // handle filenames with tabs
            let status: "added" | "modified" | "deleted" | "renamed" = "modified";
            if (statusCode === "A") status = "added";
            else if (statusCode === "D") status = "deleted";
            else if (statusCode?.startsWith("R")) status = "renamed";
            return { path: filePath, status };
          });
        }

        diffStat = (
          await runGitCommand(worktreePath, ["diff", "--stat", `${baseBranch}...HEAD`])
        ).trim() || undefined;
      } catch {
        // baseBranch might not exist locally
      }
    }

    return {
      changedFileList,
      changedFiles: changedFileList.length,
      diffStat,
      worktreeExists: true,
    };
  } catch {
    return {
      changedFileList: [],
      changedFiles: 0,
      diffStat: undefined,
      worktreeExists: true, // path exists but git command failed
    };
  }
}

// Helper to validate session ownership
async function validateSessionOwnership(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    return { error: "Session not found", status: 404 };
  }
  if (session.userId !== userId) {
    return { error: "Forbidden", status: 403 };
  }
  return { session };
}

/**
 * GET /api/sessions/[id]/workspace
 *
 * Returns workspace info for a session, enriched with live git status
 * if a worktree path is configured and exists on disk.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    const { session } = ownershipResult;
    const metadata = session.metadata as Record<string, unknown> | null;
    const workspaceInfo = getWorkspaceInfo(metadata);

    if (!workspaceInfo) {
      return NextResponse.json(
        { error: "No workspace info for this session" },
        { status: 404 }
      );
    }

    // Build workspace status with live git data
    const workspaceStatus: WorkspaceStatus = { ...workspaceInfo };

    if (workspaceInfo.worktreePath) {
      const liveStatus = await getLiveGitStatus(workspaceInfo.worktreePath, workspaceInfo.baseBranch);
      workspaceStatus.changedFileList = liveStatus.changedFileList;
      workspaceStatus.changedFiles = liveStatus.changedFiles;
      workspaceStatus.diffStat = liveStatus.diffStat;
      workspaceStatus.worktreeExists = liveStatus.worktreeExists;
    }

    return NextResponse.json({ workspace: workspaceStatus });
  } catch (error) {
    console.error("Failed to get workspace info:", error);
    return NextResponse.json(
      { error: "Failed to get workspace info" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions/[id]/workspace
 *
 * Updates workspace info in session metadata by merging the provided
 * partial WorkspaceInfo into the existing value.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    const { session } = ownershipResult;
    const safePayload = sanitizeWorkspacePatch(await req.json());

    const existingMetadata = (session.metadata as Record<string, unknown>) || {};
    const existingWorkspaceInfo = getWorkspaceInfo(existingMetadata) || {};

    const mergedWorkspaceInfo = {
      ...existingWorkspaceInfo,
      ...safePayload,
    };

    const mergedMetadata = {
      ...existingMetadata,
      workspaceInfo: mergedWorkspaceInfo,
    };

    const updated = await updateSession(id, { metadata: mergedMetadata });

    return NextResponse.json({
      workspace: mergedWorkspaceInfo,
      session: updated,
    });
  } catch (error) {
    console.error("Failed to update workspace info:", error);
    return NextResponse.json(
      { error: "Failed to update workspace info" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions/[id]/workspace
 *
 * Perform a workspace action:
 * - "refresh-status": Refresh live git status and persist to metadata
 * - "cleanup": Remove the git worktree and clear workspace info
 * - "sync-to-local": Generate a diff patch and apply it to the main repo
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    const { session } = ownershipResult;
    const metadata = (session.metadata as Record<string, unknown>) || {};
    const workspaceInfo = getWorkspaceInfo(metadata);

    if (!workspaceInfo) {
      return NextResponse.json(
        { error: "No workspace info for this session" },
        { status: 404 }
      );
    }

    const body = (await req.json()) as { action: WorkspaceAction };
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action field" },
        { status: 400 }
      );
    }

    switch (action) {
      case "refresh-status": {
        return await handleRefreshStatus(id, metadata, workspaceInfo);
      }
      case "cleanup": {
        return await handleCleanup(id, metadata, workspaceInfo);
      }
      case "sync-to-local": {
        return await handleSyncToLocal(id, metadata, workspaceInfo);
      }
      default: {
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error("Failed to perform workspace action:", error);
    return NextResponse.json(
      { error: "Failed to perform workspace action" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------------
// Action handlers
// ------------------------------------------------------------------

async function handleRefreshStatus(
  sessionId: string,
  metadata: Record<string, unknown>,
  workspaceInfo: WorkspaceInfo
) {
  if (!workspaceInfo.worktreePath) {
    return NextResponse.json(
      { error: "No worktree path configured" },
      { status: 400 }
    );
  }

  const liveStatus = await getLiveGitStatus(workspaceInfo.worktreePath, workspaceInfo.baseBranch);

  const updatedWorkspaceInfo: WorkspaceInfo = {
    ...workspaceInfo,
    changedFiles: liveStatus.changedFiles,
    lastSyncedAt: new Date().toISOString(),
  };

  const updatedMetadata = {
    ...metadata,
    workspaceInfo: updatedWorkspaceInfo,
  };

  await updateSession(sessionId, { metadata: updatedMetadata });

  const workspaceStatus: WorkspaceStatus = {
    ...updatedWorkspaceInfo,
    changedFileList: liveStatus.changedFileList,
    diffStat: liveStatus.diffStat,
    worktreeExists: liveStatus.worktreeExists,
  };

  return NextResponse.json({ workspace: workspaceStatus });
}

async function handleCleanup(
  sessionId: string,
  metadata: Record<string, unknown>,
  workspaceInfo: WorkspaceInfo
) {
  const { worktreePath } = workspaceInfo;

  if (worktreePath && isValidWorktreePath(worktreePath)) {
    if (fs.existsSync(worktreePath)) {
      try {
        // Find the main repo directory by resolving the git common dir
        const commonDir = (await runGitCommand(worktreePath, ["rev-parse", "--git-common-dir"])).trim();
        // The main repo is the parent of the .git directory
        const mainRepoDir = fs.realpathSync(
          commonDir.endsWith("/.git") || commonDir.endsWith("\\.git")
            ? commonDir.replace(/[/\\]\.git$/, "")
            : commonDir + "/.."
        );

        await runGitCommand(mainRepoDir, ["worktree", "remove", worktreePath, "--force"]);
      } catch (err) {
        console.error("Failed to remove git worktree:", err);
        // Continue anyway to clean up metadata
      }
    }
  }

  // Clear workspace info from metadata
  const { workspaceInfo: _removed, ...restMetadata } = metadata;
  await updateSession(sessionId, { metadata: restMetadata });

  return NextResponse.json({ success: true, message: "Workspace cleaned up" });
}

async function handleSyncToLocal(
  sessionId: string,
  metadata: Record<string, unknown>,
  workspaceInfo: WorkspaceInfo
) {
  const { worktreePath, baseBranch, branch } = workspaceInfo;

  if (!worktreePath || !isValidWorktreePath(worktreePath)) {
    return NextResponse.json(
      { error: "Invalid or missing worktree path" },
      { status: 400 }
    );
  }

  if (!fs.existsSync(worktreePath)) {
    return NextResponse.json(
      { error: "Worktree directory does not exist" },
      { status: 404 }
    );
  }

  if (!baseBranch || !branch) {
    return NextResponse.json(
      { error: "Both baseBranch and branch are required for sync-to-local" },
      { status: 400 }
    );
  }

  if (!isValidBranchName(baseBranch) || !isValidBranchName(branch)) {
    return NextResponse.json(
      { error: "Invalid branch name. Use only alphanumeric, dot, dash, underscore, and slash characters." },
      { status: 400 }
    );
  }

  try {
    // Find the main repository directory
    const commonDir = (await runGitCommand(worktreePath, ["rev-parse", "--git-common-dir"])).trim();
    const mainRepoDir = fs.realpathSync(
      commonDir.endsWith("/.git") || commonDir.endsWith("\\.git")
        ? commonDir.replace(/[/\\]\.git$/, "")
        : commonDir + "/.."
    );

    // Generate patch from the diff between base branch and feature branch
    let patch: string;
    try {
      patch = await runGitCommand(worktreePath, ["diff", `${baseBranch}...${branch}`]);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to generate diff patch",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }

    if (!patch.trim()) {
      return NextResponse.json({
        success: true,
        message: "No changes to sync",
        appliedFiles: 0,
      });
    }

    // Apply the patch to the main repo
    try {
      await runGitCommand(mainRepoDir, ["apply", "--check", "--3way", "-"], patch);
      await runGitCommand(mainRepoDir, ["apply", "--3way", "-"], patch);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to apply patch to main repository",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }

    // Count files from the patch itself — avoids counting pre-existing changes in mainRepoDir
    const appliedFiles = (patch.match(/^diff --git /gm) || []).length;

    return NextResponse.json({
      success: true,
      message: `Synced ${appliedFiles} file(s) to local repository`,
      appliedFiles,
    });
  } catch (error) {
    console.error("Failed to sync to local:", error);
    return NextResponse.json(
      {
        error: "Failed to sync changes to local repository",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
