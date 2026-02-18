/**
 * Workspace Types
 *
 * Defines the shape of workspace metadata stored in sessions.metadata.workspaceInfo.
 * Used by the Developer Workspace feature to track git worktree state per session.
 */

/**
 * Workspace info stored in session metadata.
 * Populated by MCP tools, agent executeCommand calls, or the workspace API.
 *
 * Convention: sessions.metadata.workspaceInfo = WorkspaceInfo
 */
export interface WorkspaceInfo {
  /** How the workspace was created */
  type: "worktree" | "local" | "clone";

  /** Current branch name (e.g., "feature/auth-refactor") */
  branch?: string;

  /** Branch it was created from (e.g., "main") */
  baseBranch?: string;

  /** Absolute path to the worktree directory on disk */
  worktreePath?: string;

  /** Git remote URL (e.g., "https://github.com/user/repo") */
  repoUrl?: string;

  /** Pull request URL if one has been created */
  prUrl?: string;

  /** Pull request number */
  prNumber?: number;

  /** Pull request status */
  prStatus?: "draft" | "open" | "merged" | "closed";

  /** High-level workspace lifecycle status */
  status: "active" | "changes-ready" | "pr-open" | "merged" | "cleanup-pending";

  /** Count of modified/added/deleted files (updated periodically) */
  changedFiles?: number;

  /** ISO timestamp of last status refresh */
  lastSyncedAt?: string;
}

/**
 * Live workspace status returned by the workspace API endpoint.
 * Extends WorkspaceInfo with real-time git data.
 */
export interface WorkspaceStatus extends WorkspaceInfo {
  /** Output of `git diff --stat` — summary of changes */
  diffStat?: string;

  /** List of changed files with their status */
  changedFileList?: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
  }>;

  /** Whether the worktree directory exists on disk */
  worktreeExists?: boolean;
}

/**
 * Workspace summary for the dashboard (aggregated across sessions).
 */
export interface WorkspaceSummary {
  sessionId: string;
  agentId?: string;
  agentName?: string;
  agentAvatarUrl?: string;
  branch?: string;
  status: WorkspaceInfo["status"];
  changedFiles?: number;
  prUrl?: string;
  prNumber?: number;
  prStatus?: WorkspaceInfo["prStatus"];
  worktreePath?: string;
  createdAt?: string;
  lastSyncedAt?: string;
}

/**
 * Actions that can be performed via POST /api/sessions/[id]/workspace
 */
export type WorkspaceAction = "sync-to-local" | "cleanup" | "refresh-status";

/**
 * Helper to extract WorkspaceInfo from session metadata.
 */
export function getWorkspaceInfo(
  metadata: Record<string, unknown> | null | undefined
): WorkspaceInfo | null {
  if (!metadata) return null;
  const info = metadata.workspaceInfo;
  if (!info || typeof info !== "object") return null;
  // Minimal validation — must have status
  if (!("status" in (info as Record<string, unknown>))) return null;
  return info as WorkspaceInfo;
}
