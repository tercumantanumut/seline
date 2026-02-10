/**
 * Shared File System Path Utilities
 *
 * Security-critical path validation for all file tools.
 * Extracted from lib/ai/vector-search/tool.ts for reuse across
 * readFile, editFile, writeFile, and patchFile tools.
 */

import { isAbsolute, join, normalize, resolve, sep, basename, dirname } from "path";
import { mkdir } from "fs/promises";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq, like, and } from "drizzle-orm";

/**
 * Validate that a file path is within allowed synced folders.
 *
 * Handles both:
 * 1. Absolute paths - checks if within any allowed folder
 * 2. Relative paths - tries resolving relative to each allowed folder
 *
 * @returns The resolved absolute path if allowed, or null if rejected
 */
export function isPathAllowed(filePath: string, allowedFolderPaths: string[]): string | null {
  // Case 1: Path is already absolute
  if (isAbsolute(filePath)) {
    const normalizedPath = normalize(filePath);
    for (const allowedPath of allowedFolderPaths) {
      const resolvedAllowed = resolve(allowedPath);
      if (normalizedPath.startsWith(resolvedAllowed + sep) || normalizedPath === resolvedAllowed) {
        return normalizedPath;
      }
    }
    return null;
  }

  // Case 2: Relative path - try resolving relative to each allowed folder
  for (const allowedPath of allowedFolderPaths) {
    const resolvedAllowed = resolve(allowedPath);
    const candidatePath = normalize(join(resolvedAllowed, filePath));

    // Security: Ensure the resolved path is still within the allowed folder
    // (prevents path traversal attacks like "../../../etc/passwd")
    if (candidatePath.startsWith(resolvedAllowed + sep) || candidatePath === resolvedAllowed) {
      return candidatePath;
    }
  }

  return null;
}

/**
 * Get allowed synced folder paths for a character.
 */
export async function resolveSyncedFolderPaths(characterId: string): Promise<string[]> {
  const syncedFolders = await getSyncFolders(characterId);
  return syncedFolders.map((f) => f.folderPath);
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
