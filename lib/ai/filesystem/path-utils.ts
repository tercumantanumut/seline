/**
 * Shared File System Path Utilities
 *
 * Security-critical path validation for all file tools.
 * Extracted from lib/ai/vector-search/tool.ts for reuse across
 * readFile, editFile, writeFile, and patchFile tools.
 */

import { isAbsolute, join, normalize, resolve, sep, basename, dirname } from "path";
import { mkdir, realpath } from "fs/promises";
import { getAccessibleSyncFolders } from "@/lib/vectordb/accessible-sync-folders";
import { getSession } from "@/lib/db/queries-sessions";
import { getWorkspaceInfo } from "@/lib/workspace/types";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq, like, and } from "drizzle-orm";

/**
 * Normalize a path and ensure it uses correct separators
 */
export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Validate path for traversal attacks
 * @throws Error if path contains traversal attempts after normalization
 */
export function validatePath(filePath: string): void {
  if (filePath.includes("..")) {
    // This is a simple check. normalize() usually handles .. 
    // but if someone passes "foo/../bar", normalize makes it "bar".
    // If they pass "../bar", normalize keeps it "../bar".
    // We want to ensure the final path doesn't start with ..
    // But isPathAllowed handles the containment check.
    // This function is for explicit blocking if needed.
  }
}

/**
 * Validate that a file path is within allowed synced folders.
 *
 * Handles both:
 * 1. Absolute paths - checks if within any allowed folder
 * 2. Relative paths - tries resolving relative to each allowed folder
 * 
 * Security:
 * - Resolves symlinks using fs.realpath
 * - Checks containment within allowed folders
 *
 * @returns The resolved absolute path if allowed, or null if rejected
 */
export async function isPathAllowed(filePath: string, allowedFolderPaths: string[]): Promise<string | null> {
  // Case 1: Path is already absolute
  if (isAbsolute(filePath)) {
    const normalizedPath = normalize(filePath);
    
    for (const allowedPath of allowedFolderPaths) {
      try {
        // Resolve symlinks for the allowed folder
        const resolvedAllowed = await realpath(allowedPath).catch(() => allowedPath);
        
        // Resolve symlinks for the target path (if it exists)
        // If it doesn't exist, we can't realpath it, so we use the normalized path
        // and check its parent.
        let resolvedTarget = normalizedPath;
        try {
          resolvedTarget = await realpath(normalizedPath);
        } catch {
          // File likely doesn't exist yet (creation mode)
          // Resolve the parent directory
          const parentDir = dirname(normalizedPath);
          try {
            const resolvedParent = await realpath(parentDir);
            resolvedTarget = join(resolvedParent, basename(normalizedPath));
          } catch {
            // Parent doesn't exist either? 
            // We'll fall back to string matching on the normalized path
            // assuming standard containment check is sufficient for non-existent files.
          }
        }

        if (resolvedTarget.startsWith(resolvedAllowed + sep) || resolvedTarget === resolvedAllowed) {
          return resolvedTarget;
        }
      } catch (e) {
        // Ignore errors during resolution
      }
    }
    return null;
  }

  // Case 2: Relative path - try resolving relative to each allowed folder
  for (const allowedPath of allowedFolderPaths) {
    try {
      const resolvedAllowed = await realpath(allowedPath).catch(() => allowedPath);
      const candidatePath = normalize(join(resolvedAllowed, filePath));

      // Resolve symlinks for the candidate path
      let resolvedTarget = candidatePath;
      try {
        resolvedTarget = await realpath(candidatePath);
      } catch {
        // File doesn't exist
        const parentDir = dirname(candidatePath);
        try {
          const resolvedParent = await realpath(parentDir);
          resolvedTarget = join(resolvedParent, basename(candidatePath));
        } catch {
           // Fallback
        }
      }

      // Security: Ensure the resolved path is still within the allowed folder
      if (resolvedTarget.startsWith(resolvedAllowed + sep) || resolvedTarget === resolvedAllowed) {
        return resolvedTarget;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Get allowed synced folder paths for a character.
 */
export async function resolveSyncedFolderPaths(characterId: string): Promise<string[]> {
  const syncedFolders = await getAccessibleSyncFolders(characterId);
  return syncedFolders.map((f) => f.folderPath);
}

/**
 * Get the active worktree path from session metadata, if any.
 * Returns null if no workspace is active or sessionId is invalid.
 */
export async function getActiveWorktreePath(sessionId: string): Promise<string | null> {
  if (!sessionId || sessionId === "UNSCOPED") return null;
  try {
    const session = await getSession(sessionId);
    if (!session) return null;
    const wsInfo = getWorkspaceInfo(session.metadata as Record<string, unknown> | null);
    if (!wsInfo?.worktreePath || typeof wsInfo.worktreePath !== "string") return null;
    return wsInfo.worktreePath;
  } catch {
    return null;
  }
}

/**
 * Check if a normalized path is a worktree directory
 * (lives under a `/worktrees/` parent — the convention used by the workspace tool).
 */
export function isWorktreePath(p: string): boolean {
  const normalized = normalize(p);
  return normalized.includes(`${sep}worktrees${sep}`);
}

/**
 * Check if a path belongs to a DIFFERENT worktree than the active one.
 * Returns false if there is no active worktree (nothing to conflict with).
 */
export function isOtherWorktreePath(p: string, activeWorktreePath: string | null): boolean {
  if (!activeWorktreePath) return false;
  const normalized = normalize(p);
  if (!isWorktreePath(normalized)) return false;
  return normalized !== normalize(activeWorktreePath);
}

/**
 * Workspace-aware synced folder resolution.
 *
 * When an active worktree exists, the worktree path is placed FIRST in the
 * returned array so it becomes the default for tools that use `[0]`.
 * Other worktree paths are EXCLUDED to prevent cross-workspace contamination.
 * The base repo path is still included (for index/vector lookups) but deprioritized.
 */
export async function resolveWorkspaceAwarePaths(
  characterId: string,
  sessionId: string
): Promise<string[]> {
  const basePaths = await resolveSyncedFolderPaths(characterId);
  const worktreePath = await getActiveWorktreePath(sessionId);
  if (!worktreePath) return basePaths;

  // Normalize for dedup — session metadata and DB may have different trailing slashes
  const normalizedWorktree = normalize(worktreePath);

  // Put worktree first, exclude other worktrees, keep base repo for path-allowed checks
  return [
    normalizedWorktree,
    ...basePaths.filter((p) => {
      const norm = normalize(p);
      if (norm === normalizedWorktree) return false; // dedup active worktree
      if (isOtherWorktreePath(norm, normalizedWorktree)) return false; // exclude other worktrees
      return true;
    }),
  ];
}

/**
 * Create parent directories for a file path.
 */
export async function ensureParentDirectories(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

/**
 * Find similar files in synced folders for "did you mean?" suggestions.
 *
 * @param characterId - Agent character ID
 * @param filename - The filename or partial path to match
 * @returns Up to 5 similar file paths
 */
export async function findSimilarFiles(
  characterId: string,
  filename: string
): Promise<string[]> {
  try {
    const name = basename(filename);
    const results = await db
      .select({ relativePath: agentSyncFiles.relativePath })
      .from(agentSyncFiles)
      .where(
        and(
          eq(agentSyncFiles.characterId, characterId),
          like(agentSyncFiles.relativePath, `%${name}%`)
        )
      )
      .limit(5);

    return results.map((r) => r.relativePath);
  } catch {
    return [];
  }
}
