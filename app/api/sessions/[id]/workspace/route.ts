import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import {
  getSession,
  updateSession,
  getOrCreateLocalUser,
} from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getWorkspaceInfo } from "@/lib/workspace/types";
import type {
  WorkspaceInfo,
  WorkspaceStatus,
  WorkspaceAction,
} from "@/lib/workspace/types";

// Validate that a path is safe for use in shell commands
function isValidWorktreePath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !/[;&|`$(){}!#]/.test(path)
  );
}

// Default execSync options for git commands
function gitExecOptions(cwd: string) {
  return { cwd, encoding: "utf-8" as const, timeout: 30000 };
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
function getLiveGitStatus(worktreePath: string): {
  changedFileList: WorkspaceStatus["changedFileList"];
  changedFiles: number;
  diffStat: string | undefined;
  worktreeExists: boolean;
} {
  if (!isValidWorktreePath(worktreePath) || !fs.existsSync(worktreePath)) {
    return {
      changedFileList: [],
      changedFiles: 0,
      diffStat: undefined,
      worktreeExists: false,
    };
  }

  try {
    const porcelain = execSync(
      "git status --porcelain",
      gitExecOptions(worktreePath)
    );
    const changedFileList = parseGitPorcelain(porcelain);

    let diffStat: string | undefined;
    try {
      diffStat = execSync(
        "git diff --stat",
        gitExecOptions(worktreePath)
      ).trim() || undefined;
    } catch {
      // diff --stat can fail if there are no commits yet
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
      const liveStatus = getLiveGitStatus(workspaceInfo.worktreePath);
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
    const body = (await req.json()) as Partial<WorkspaceInfo>;

    const existingMetadata = (session.metadata as Record<string, unknown>) || {};
    const existingWorkspaceInfo = getWorkspaceInfo(existingMetadata) || {};

    const mergedWorkspaceInfo = {
      ...existingWorkspaceInfo,
      ...body,
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

  const liveStatus = getLiveGitStatus(workspaceInfo.worktreePath);

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
        const commonDir = execSync(
          "git rev-parse --git-common-dir",
          gitExecOptions(worktreePath)
        ).trim();
        // The main repo is the parent of the .git directory
        const mainRepoDir = fs.realpathSync(
          commonDir.endsWith("/.git") || commonDir.endsWith("\\.git")
            ? commonDir.replace(/[/\\]\.git$/, "")
            : commonDir + "/.."
        );

        execSync(
          `git worktree remove "${worktreePath}" --force`,
          gitExecOptions(mainRepoDir)
        );
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

  try {
    // Find the main repository directory
    const commonDir = execSync(
      "git rev-parse --git-common-dir",
      gitExecOptions(worktreePath)
    ).trim();
    const mainRepoDir = fs.realpathSync(
      commonDir.endsWith("/.git") || commonDir.endsWith("\\.git")
        ? commonDir.replace(/[/\\]\.git$/, "")
        : commonDir + "/.."
    );

    // Generate patch from the diff between base branch and feature branch
    let patch: string;
    try {
      patch = execSync(
        `git diff ${baseBranch}...${branch}`,
        gitExecOptions(worktreePath)
      );
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
      execSync("git apply --check --3way -", {
        cwd: mainRepoDir,
        encoding: "utf-8",
        timeout: 30000,
        input: patch,
      });

      execSync("git apply --3way -", {
        cwd: mainRepoDir,
        encoding: "utf-8",
        timeout: 30000,
        input: patch,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to apply patch to main repository",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }

    // Count applied files
    const appliedPorcelain = execSync(
      "git status --porcelain",
      gitExecOptions(mainRepoDir)
    );
    const appliedFiles = appliedPorcelain
      .trim()
      .split("\n")
      .filter(Boolean).length;

    return NextResponse.json({
      success: true,
      message: `Synced ${appliedFiles} file(s) to local repository`,
      appliedFiles,
      mainRepoDir,
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
