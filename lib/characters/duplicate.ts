import { statSync } from "node:fs";

type MetadataLike = unknown;

export function buildDuplicateCharacterName(sourceName: string): string {
  const baseName = sourceName.replace(/ \(copy\)$/, "");
  return `${baseName} (copy)`;
}

export function buildDuplicateDisplayName(sourceDisplayName: string | null): string | null {
  if (!sourceDisplayName) return null;
  const baseDisplayName = sourceDisplayName.replace(/ \(copy\)$/, "");
  return `${baseDisplayName} (copy)`;
}

export function buildDuplicateMetadata(sourceMetadata: MetadataLike): Record<string, unknown> {
  const metadata = { ...((sourceMetadata as Record<string, unknown>) || {}) };
  delete metadata.workflowId;
  delete metadata.workflowRole;
  delete metadata.inheritedResources;
  delete metadata.isSystemAgent;
  delete metadata.systemAgentType;
  return metadata;
}

// ---------------------------------------------------------------------------
// Folder duplication helpers
// ---------------------------------------------------------------------------

/** Check whether a path points to an existing directory (not a file). */
export function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface SyncFolderLike {
  folderPath: string;
  inheritedFromWorkflowId: string | null;
  status: string | null;
}

/**
 * Filter source folders to only those that should be duplicated:
 * - Exclude inherited workflow folders (re-shared if agent joins a workflow)
 * - Exclude folders pointing to non-existent or non-directory paths (stale worktrees)
 */
export function filterDuplicableFolders<T extends SyncFolderLike>(
  folders: T[],
  pathCheck: (path: string) => boolean = isExistingDirectory,
): T[] {
  return folders.filter(
    (f) => !f.inheritedFromWorkflowId && pathCheck(f.folderPath),
  );
}

/**
 * Map a source folder's sync status to the appropriate status for a duplicate.
 * Active states (synced, syncing) → paused to avoid auto-triggering sync.
 * Other states are preserved as-is.
 */
type SyncFolderStatus = "pending" | "syncing" | "synced" | "error" | "paused";

export function mapDuplicateFolderStatus(sourceStatus: string | null): SyncFolderStatus {
  if (sourceStatus === "synced" || sourceStatus === "syncing") return "paused";
  if (sourceStatus === "error" || sourceStatus === "paused" || sourceStatus === "pending") return sourceStatus;
  return "pending";
}
