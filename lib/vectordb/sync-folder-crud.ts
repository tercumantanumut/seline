/**
 * Sync Folder CRUD
 *
 * Database create/read/update/delete operations for sync folder records.
 * These functions manage folder metadata in the SQLite database without
 * touching in-memory sync state or the vector database.
 */

import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders } from "@/lib/db/sqlite-character-schema";
import { eq, and, sql } from "drizzle-orm";
import { normalizeFolderPath, validateSyncFolderPath } from "./path-validation";
import {
  normalizeChunkPreset,
  normalizeReindexPolicy,
} from "./sync-mode-resolver";
import { notifyFolderChange } from "./folder-events";
import { normalizeExtensions } from "./sync-helpers";
import type { SyncFolderConfig } from "./sync-types";

/**
 * Add a folder to sync for an agent
 */
export async function addSyncFolder(config: SyncFolderConfig): Promise<string> {
  const {
    userId,
    characterId,
    folderPath,
    displayName,
    recursive = true,
    includeExtensions = ["md", "txt", "pdf", "html"],
    excludePatterns = ["node_modules", ".*", ".git", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "*.lock"],
    indexingMode = "auto",
    syncMode = "auto",
    syncCadenceMinutes = 60,
    fileTypeFilters = [],
    maxFileSizeBytes = 10 * 1024 * 1024,
    chunkPreset = "balanced",
    chunkSizeOverride,
    chunkOverlapOverride,
    reindexPolicy = "smart",
  } = config;

  const { normalizedPath, error } = await validateSyncFolderPath(folderPath);
  if (error) {
    throw new Error(error);
  }

  const existingFolders = await getSyncFolders(characterId);
  const existingPaths = new Set(existingFolders.map((folder) => normalizeFolderPath(folder.folderPath)));
  if (existingPaths.has(normalizedPath)) {
    throw new Error("This folder is already synced.");
  }

  // Normalize extensions to ensure consistent format (without dots)
  const normalizedExtensions = normalizeExtensions(includeExtensions);
  const normalizedFileTypeFilters = normalizeExtensions(fileTypeFilters);

  // Check if this is the first folder for this character
  const isPrimary = existingFolders.length === 0;

  const [folder] = await db
    .insert(agentSyncFolders)
    .values({
      userId,
      characterId,
      folderPath: normalizedPath,
      displayName: displayName || normalizedPath.split(/[/\\]/).pop(),
      isPrimary,
      recursive,
      // Note: Drizzle handles JSON serialization automatically for mode: "json" columns
      // Do NOT use JSON.stringify here
      includeExtensions: normalizedExtensions,
      excludePatterns,
      indexingMode,
      syncMode,
      syncCadenceMinutes: Math.max(5, Math.floor(syncCadenceMinutes)),
      fileTypeFilters: normalizedFileTypeFilters,
      maxFileSizeBytes: Math.max(1024, Math.floor(maxFileSizeBytes)),
      chunkPreset: normalizeChunkPreset(chunkPreset),
      chunkSizeOverride: typeof chunkSizeOverride === "number" ? Math.max(100, Math.floor(chunkSizeOverride)) : null,
      chunkOverlapOverride: typeof chunkOverlapOverride === "number" ? Math.max(0, Math.floor(chunkOverlapOverride)) : null,
      reindexPolicy: normalizeReindexPolicy(reindexPolicy),
      skipReasons: {},
      lastRunMetadata: {},
      status: "pending",
    })
    .returning();

  console.log(`[SyncService] Added sync folder: ${folderPath} for agent ${characterId} (primary: ${isPrimary})`);

  notifyFolderChange(characterId, {
    type: "added",
    folderId: folder.id,
  });

  return folder.id;
}

/**
 * Set the status of a sync folder directly.
 * Useful for workspace sync folders that skip the normal sync pipeline.
 */
export async function setSyncFolderStatus(
  folderId: string,
  status: "pending" | "syncing" | "synced" | "error" | "paused"
): Promise<void> {
  await db
    .update(agentSyncFolders)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(agentSyncFolders.id, folderId));
}

/**
 * Get all sync folders for all agents
 */
export async function getAllSyncFolders() {
  return db
    .select()
    .from(agentSyncFolders)
    .orderBy(sql`is_primary DESC, created_at ASC`);
}

/**
 * Get all sync folders for an agent, primary first
 */
export async function getSyncFolders(characterId: string) {
  return db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.characterId, characterId))
    .orderBy(sql`is_primary DESC, created_at ASC`);
}

/**
 * Get primary synced folder for a character
 */
export async function getPrimarySyncFolder(characterId: string) {
  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(
      and(
        eq(agentSyncFolders.characterId, characterId),
        eq(agentSyncFolders.isPrimary, true)
      )
    )
    .limit(1);

  return folder || null;
}

/**
 * Set a folder as primary (unsets others for the same character)
 */
export async function setPrimaryFolder(folderId: string, characterId: string) {
  await db.transaction(async (tx) => {
    // Unset all primary flags for this character
    await tx
      .update(agentSyncFolders)
      .set({ isPrimary: false })
      .where(eq(agentSyncFolders.characterId, characterId));

    // Set the specified folder as primary
    await tx
      .update(agentSyncFolders)
      .set({ isPrimary: true })
      .where(eq(agentSyncFolders.id, folderId));
  });

  console.log(`[SyncService] Set folder ${folderId} as primary for character ${characterId}`);

  notifyFolderChange(characterId, {
    type: "primary_changed",
    folderId,
  });
}
