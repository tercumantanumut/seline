/**
 * Folder Sync Service
 *
 * Manages synchronization of local folders to the vector database.
 * Handles file discovery, indexing, and incremental updates.
 *
 * Supports parallel processing for faster indexing of large file sets.
 */

import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders, agentSyncFiles, characters } from "@/lib/db/sqlite-character-schema";
import { eq, and, sql, or } from "drizzle-orm";
import { removeFileFromVectorDB, removeFolderFromVectorDB } from "./indexing";
import { DEFAULT_IGNORE_PATTERNS, createIgnoreMatcher } from "./ignore-patterns";
import { deleteAgentTable, listAgentTables } from "./collections";
import { startWatching, isWatching, stopWatching } from "./file-watcher";
import { getEmbeddingModelId } from "@/lib/ai/providers";

import { normalizeFolderPath, validateSyncFolderPath } from "./path-validation";
import {
  type ChunkPreset,
  type ReindexPolicy,
  type SyncExecutionTrigger,
  type SyncMode,
  normalizeChunkPreset,
  normalizeReindexPolicy,
  resolveChunkingOverrides,
  resolveFolderSyncBehavior,
  shouldRunForTrigger,
} from "./sync-mode-resolver";
import { onFolderChange, notifyFolderChange, type FolderChangeEvent } from "./folder-events";
export { onFolderChange, notifyFolderChange };
export type { FolderChangeEvent };

// Re-export types so existing imports from this path continue to work
export type { ParallelConfig, SyncFolderConfig, SyncFolderUpdateConfig, SyncResult } from "./sync-types";

import {
  type ParallelConfig,
  type SyncFolderConfig,
  type SyncFolderUpdateConfig,
  type SyncResult,
  type SyncTracking,
} from "./sync-types";

import {
  resolveParallelConfig,
  normalizeExtensions,
  warnIfLargeLocalEmbeddingSync,
  discoverFiles,
  parseJsonArray,
  parseJsonObject,
  shouldSmartReindex,
  decodeAgentTableName,
} from "./sync-helpers";

import { processFileInBatch, type FileProcessorContext } from "./sync-file-processor";

// Re-export CRUD functions so existing imports from this path continue to work
export {
  addSyncFolder,
  setSyncFolderStatus,
  getAllSyncFolders,
  getSyncFolders,
  getPrimarySyncFolder,
  setPrimaryFolder,
} from "./sync-folder-crud";
import { getSyncFolders, setPrimaryFolder } from "./sync-folder-crud";

// Re-export scheduler functions so existing imports from this path continue to work
export {
  isSyncing,
  isSyncingPath,
  cancelSyncByPath,
  cancelSyncById,
  recoverStuckSyncingFolders,
  forceCleanupStuckFolders,
  getSyncedFoldersNeedingWatch,
  getStaleFolders,
  restartAllWatchers,
} from "./sync-scheduler";
import {
  syncingFolders,
  syncingPaths,
  isSyncing,
  isSyncingPath,
  cancelSyncByPath,
} from "./sync-scheduler";

/**
 * Remove a sync folder and its indexed content.
 * Cancels any running sync first to prevent orphaned processes.
 */
export async function removeSyncFolder(folderId: string): Promise<void> {
  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.id, folderId));

  if (!folder) {
    console.warn(`[SyncService] Tried to remove missing sync folder: ${folderId}`);
    return;
  }

  await db
    .update(agentSyncFolders)
    .set({ status: "paused", lastError: "Removing folder...", updatedAt: new Date().toISOString() })
    .where(eq(agentSyncFolders.id, folderId));

  if (isSyncingPath(folder.folderPath)) {
    console.log(`[SyncService] Cancelling running sync for folder: ${folder.folderPath}`);
    await cancelSyncByPath(folder.folderPath);
  }

  if (isWatching(folderId)) {
    stopWatching(folderId);
  }

  const wasPrimary = folder.isPrimary;
  const characterId = folder.characterId;

  // Check remaining folders BEFORE deletion to decide cleanup strategy
  const allFolders = await getSyncFolders(characterId);
  const remainingFolders = allFolders.filter(f => f.id !== folderId);

  if (remainingFolders.length === 0) {
    // Last folder: drop the entire table instantly instead of per-file deletions
    await deleteAgentTable(characterId);
  } else {
    // Multiple folders: one bulk delete by folderId instead of per-file queries
    await removeFolderFromVectorDB({ characterId, folderId });
  }

  await db.delete(agentSyncFolders).where(eq(agentSyncFolders.id, folderId));
  console.log(`[SyncService] Removed sync folder: ${folderId}`);

  if (wasPrimary && remainingFolders.length > 0) {
    await setPrimaryFolder(remainingFolders[0].id, characterId);
    console.log(`[SyncService] Promoted folder ${remainingFolders[0].id} to primary`);
  }

  notifyFolderChange(characterId, { type: "removed", folderId, wasPrimary });
}

/**
 * Sync a folder — index new/changed files, remove deleted files.
 * Supports parallel processing for faster indexing of large file sets.
 */
export async function syncFolder(
  folderId: string,
  parallelConfig: Partial<ParallelConfig> = {},
  forceReindex: boolean = false,
  trigger: SyncExecutionTrigger = "manual"
): Promise<SyncResult> {
  const config = resolveParallelConfig(parallelConfig);

  const result: SyncResult = {
    folderId,
    filesProcessed: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesRemoved: 0,
    skippedReasons: {},
    errors: [],
  };

  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.id, folderId));

  if (!folder) {
    result.errors.push("Folder not found");
    return result;
  }

  const { normalizedPath, error: pathError } = await validateSyncFolderPath(folder.folderPath);
  if (pathError) {
    await db
      .update(agentSyncFolders)
      .set({ status: "paused", lastError: `Paused: ${pathError}`, updatedAt: new Date().toISOString() })
      .where(eq(agentSyncFolders.id, folderId));
    result.errors.push(pathError);
    return result;
  }

  let folderPath = normalizedPath;
  if (folderPath !== folder.folderPath) {
    await db
      .update(agentSyncFolders)
      .set({ folderPath, updatedAt: new Date().toISOString() })
      .where(eq(agentSyncFolders.id, folderId));
  }

  const behavior = resolveFolderSyncBehavior({
    indexingMode: folder.indexingMode,
    syncMode: folder.syncMode,
    syncCadenceMinutes: folder.syncCadenceMinutes,
    maxFileSizeBytes: folder.maxFileSizeBytes,
    chunkPreset: folder.chunkPreset,
    chunkSizeOverride: folder.chunkSizeOverride,
    chunkOverlapOverride: folder.chunkOverlapOverride,
    reindexPolicy: folder.reindexPolicy,
  });

  if (!shouldRunForTrigger(behavior, trigger)) {
    result.errors.push(`Sync mode ${behavior.syncMode} blocks ${trigger} runs`);
    return result;
  }

  const shouldCreateEmbeddings = behavior.shouldCreateEmbeddings;
  const existingRunMetadata = parseJsonObject(folder.lastRunMetadata);
  const previousSmartReindexAt =
    typeof existingRunMetadata.smartReindexAt === "string"
      ? existingRunMetadata.smartReindexAt
      : undefined;
  const smartReindexDue =
    behavior.reindexPolicy === "smart" && trigger === "scheduled"
      ? shouldSmartReindex(folder.lastRunMetadata)
      : false;
  const shouldForceReindex = forceReindex || behavior.reindexPolicy === "always" || smartReindexDue;

  console.log(
    `[SyncService] Syncing folder ${folder.displayName || folderPath} with indexing=${folder.indexingMode}, sync=${behavior.syncMode}, trigger=${trigger} (embeddings: ${shouldCreateEmbeddings})`
  );

  if (syncingFolders.has(folderId)) {
    console.log(`[SyncService] Folder ${folderId} is already being synced, skipping`);
    result.errors.push("Folder is already being synced");
    return result;
  }

  if (syncingPaths.has(folderPath)) {
    const existingSync = syncingPaths.get(folderPath)!;
    if (existingSync.folderId !== folderId) {
      console.log(
        `[SyncService] Path ${folderPath} is already being synced by folder ${existingSync.folderId}, cancelling old sync`
      );
      existingSync.abortController.abort();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const syncAbortController = new AbortController();
  syncingFolders.add(folderId);
  syncingPaths.set(folderPath, { folderId, abortController: syncAbortController });

  await db
    .update(agentSyncFolders)
    .set({ status: "syncing", lastError: null, fileCount: 0, chunkCount: 0, updatedAt: new Date().toISOString() })
    .where(eq(agentSyncFolders.id, folderId));

  try {
    const includeExtensions = normalizeExtensions(parseJsonArray(folder.includeExtensions));
    const fileTypeFilters = normalizeExtensions(parseJsonArray(folder.fileTypeFilters));
    const allowedExtensions = fileTypeFilters.length > 0 ? fileTypeFilters : includeExtensions;
    const excludePatterns = parseJsonArray(folder.excludePatterns);
    const mergedExcludePatterns = Array.from(new Set([...DEFAULT_IGNORE_PATTERNS, ...excludePatterns]));
    const shouldIgnore = createIgnoreMatcher(mergedExcludePatterns, folderPath);
    const chunkingOverrides = resolveChunkingOverrides(behavior);
    const skipReasons: Record<string, number> = {};

    console.log(`[SyncService] Discovering files in ${folderPath}`);
    console.log(`[SyncService] Include extensions: ${JSON.stringify(includeExtensions)}`);
    console.log(`[SyncService] Exclude patterns: ${JSON.stringify(mergedExcludePatterns)}`);
    console.log(`[SyncService] Parallel config: concurrency=${config.concurrency}, staggerDelayMs=${config.staggerDelayMs}`);
    if (shouldForceReindex) console.log(`[SyncService] Force reindex enabled for folder ${folderPath}`);

    const discoveredFiles = await discoverFiles(
      folderPath, folderPath, folder.recursive, allowedExtensions, shouldIgnore
    );
    warnIfLargeLocalEmbeddingSync(folderPath, discoveredFiles.length);
    console.log(`[SyncService] Discovered ${discoveredFiles.length} files to process`);

    const existingFiles = await db
      .select()
      .from(agentSyncFiles)
      .where(eq(agentSyncFiles.folderId, folderId));

    const existingFileMap = new Map(existingFiles.map(f => [f.filePath, f]));
    const discoveredPaths = new Set(discoveredFiles.map(f => f.filePath));

    for (const existing of existingFiles) {
      if (!discoveredPaths.has(existing.filePath)) {
        const pointIds = parseJsonArray(existing.vectorPointIds);
        if (pointIds.length > 0) {
          await removeFileFromVectorDB({ characterId: folder.characterId, pointIds });
        }
        await db.delete(agentSyncFiles).where(eq(agentSyncFiles.id, existing.id));
        result.filesRemoved++;
      }
    }

    // Mutable progress counters shared via context object
    const counters = { processedCount: 0, indexedCount: 0, totalChunksIndexed: 0 };
    const totalFiles = discoveredFiles.length;
    const startTime = Date.now();
    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL_MS = 500;

    const updateProgressInDb = async (force = false) => {
      const now = Date.now();
      if (force || now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
        lastProgressUpdate = now;
        await db
          .update(agentSyncFolders)
          .set({ fileCount: counters.indexedCount, chunkCount: counters.totalChunksIndexed, updatedAt: new Date().toISOString() })
          .where(eq(agentSyncFolders.id, folderId));
      }
    };

    const processorCtx: FileProcessorContext = {
      folderId,
      characterId: folder.characterId,
      folderPath,
      syncAbortController,
      skipReasons,
      config,
      existingFileMap,
      behavior: { maxFileSizeBytes: behavior.maxFileSizeBytes, shouldCreateEmbeddings },
      shouldForceReindex,
      totalFiles,
      startTime,
      chunkingOverrides,
      counters,
      onProgress: updateProgressInDb,
    };

    console.log(`[SyncService] Starting parallel indexing with ${config.concurrency} concurrent workers...`);

    const { createConcurrencyLimiter } = await import("./sync-helpers");
    const limitConcurrency = createConcurrencyLimiter(config.concurrency);

    const fileResults = await Promise.all(
      discoveredFiles.map((file, index) =>
        limitConcurrency(() => processFileInBatch(file, index, processorCtx))
      )
    );

    for (const fileResult of fileResults) {
      result.filesProcessed++;
      if (fileResult.indexed) result.filesIndexed++;
      else if (fileResult.skipped) result.filesSkipped++;
      if (fileResult.error) result.errors.push(fileResult.error);
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SyncService] Parallel indexing complete in ${elapsedSeconds}s`);

    const allFolderFiles = await db
      .select()
      .from(agentSyncFiles)
      .where(eq(agentSyncFiles.folderId, folderId));

    const totalChunkCount = allFolderFiles.reduce((sum, file) => sum + (file.chunkCount || 0), 0);
    const hasIndexedFiles = allFolderFiles.length > 0 || result.filesIndexed > 0;
    const syncStatus = !hasIndexedFiles && result.errors.length > 0 ? "error" : "synced";
    const errorSummary =
      result.errors.length > 0
        ? `${result.errors.length} file(s) failed: ${result.errors.join("; ")}`
        : null;
    const embeddingModelId = shouldCreateEmbeddings ? getEmbeddingModelId() : null;

    result.skippedReasons = skipReasons;

    await db
      .update(agentSyncFolders)
      .set({
        status: syncStatus,
        lastSyncedAt: new Date().toISOString(),
        lastError: errorSummary,
        fileCount: allFolderFiles.length,
        chunkCount: totalChunkCount,
        skippedCount: result.filesSkipped,
        skipReasons,
        lastRunTrigger: trigger,
        lastRunMetadata: {
          trigger,
          syncMode: behavior.syncMode,
          reindexPolicy: behavior.reindexPolicy,
          forceReindex: shouldForceReindex,
          smartReindexAt: smartReindexDue ? new Date().toISOString() : previousSmartReindexAt,
          filesProcessed: result.filesProcessed,
          filesIndexed: result.filesIndexed,
          filesSkipped: result.filesSkipped,
          filesRemoved: result.filesRemoved,
          skippedReasons: skipReasons,
          completedAt: new Date().toISOString(),
        },
        embeddingModel: embeddingModelId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSyncFolders.id, folderId));

    if (!behavior.allowsWatcherEvents && isWatching(folderId)) {
      await stopWatching(folderId);
    }

    if (syncStatus === "synced" && behavior.allowsWatcherEvents && !isWatching(folderId)) {
      const forcePolling =
        process.platform !== "darwin" && process.platform !== "win32" && discoveredFiles.length > 500;
      const watchConfig = {
        folderId,
        characterId: folder.characterId,
        folderPath,
        recursive: folder.recursive,
        includeExtensions: allowedExtensions,
        excludePatterns,
        forcePolling,
      };

      if (forcePolling) {
        console.log(
          `[SyncService] Large folder (${discoveredFiles.length} files), will start watcher in polling mode after brief delay`
        );
      }

      const watchDelay = forcePolling ? 5000 : 0;
      if (watchDelay > 0) {
        setTimeout(() => {
          startWatching(watchConfig).catch(err =>
            console.error(`[SyncService] Failed to start file watcher for ${folderPath}:`, err)
          );
        }, watchDelay);
      } else {
        startWatching(watchConfig).catch(err =>
          console.error(`[SyncService] Failed to start file watcher for ${folderPath}:`, err)
        );
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Sync failed";
    result.errors.push(errorMsg);
    await db
      .update(agentSyncFolders)
      .set({ status: "error", lastError: errorMsg, updatedAt: new Date().toISOString() })
      .where(eq(agentSyncFolders.id, folderId));
  } finally {
    syncingFolders.delete(folderId);
    syncingPaths.delete(folderPath);
  }

  console.log(`[SyncService] Sync complete for folder ${folderId}:`, result);
  return result;
}

/**
 * Update settings for a sync folder
 */
export async function updateSyncFolderSettings(config: SyncFolderUpdateConfig): Promise<void> {
  const {
    folderId,
    displayName,
    recursive,
    includeExtensions,
    excludePatterns,
    indexingMode,
    syncMode,
    syncCadenceMinutes,
    fileTypeFilters,
    maxFileSizeBytes,
    chunkPreset,
    chunkSizeOverride,
    chunkOverlapOverride,
    reindexPolicy,
  } = config;

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (displayName !== undefined) updates.displayName = displayName;
  if (recursive !== undefined) updates.recursive = recursive;
  if (includeExtensions !== undefined) updates.includeExtensions = normalizeExtensions(includeExtensions);
  if (excludePatterns !== undefined) updates.excludePatterns = excludePatterns;
  if (indexingMode !== undefined) updates.indexingMode = indexingMode;
  if (syncMode !== undefined) updates.syncMode = syncMode;
  if (syncCadenceMinutes !== undefined) updates.syncCadenceMinutes = Math.max(5, Math.floor(syncCadenceMinutes));
  if (fileTypeFilters !== undefined) updates.fileTypeFilters = normalizeExtensions(fileTypeFilters);
  if (maxFileSizeBytes !== undefined) updates.maxFileSizeBytes = Math.max(1024, Math.floor(maxFileSizeBytes));
  if (chunkPreset !== undefined) updates.chunkPreset = normalizeChunkPreset(chunkPreset);
  if (chunkSizeOverride !== undefined) {
    updates.chunkSizeOverride =
      typeof chunkSizeOverride === "number" ? Math.max(100, Math.floor(chunkSizeOverride)) : null;
  }
  if (chunkOverlapOverride !== undefined) {
    updates.chunkOverlapOverride =
      typeof chunkOverlapOverride === "number" ? Math.max(0, Math.floor(chunkOverlapOverride)) : null;
  }
  if (reindexPolicy !== undefined) updates.reindexPolicy = normalizeReindexPolicy(reindexPolicy);

  await db
    .update(agentSyncFolders)
    .set(updates)
    .where(eq(agentSyncFolders.id, folderId));

  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.id, folderId));

  if (!folder) return;

  const behavior = resolveFolderSyncBehavior({
    indexingMode: folder.indexingMode,
    syncMode: folder.syncMode,
    syncCadenceMinutes: folder.syncCadenceMinutes,
    maxFileSizeBytes: folder.maxFileSizeBytes,
    chunkPreset: folder.chunkPreset,
    chunkSizeOverride: folder.chunkSizeOverride,
    chunkOverlapOverride: folder.chunkOverlapOverride,
    reindexPolicy: folder.reindexPolicy,
  });

  if (!behavior.allowsWatcherEvents && isWatching(folderId)) {
    await stopWatching(folderId);
  }

  if (behavior.allowsWatcherEvents && folder.status === "synced" && !isWatching(folderId)) {
    const { normalizedPath, error } = await validateSyncFolderPath(folder.folderPath);
    if (error) {
      await db
        .update(agentSyncFolders)
        .set({ status: "error", lastError: error, updatedAt: new Date().toISOString() })
        .where(eq(agentSyncFolders.id, folder.id));
    } else {
      if (normalizedPath !== folder.folderPath) {
        await db
          .update(agentSyncFolders)
          .set({ folderPath: normalizedPath, updatedAt: new Date().toISOString() })
          .where(eq(agentSyncFolders.id, folder.id));
      }

      const folderIncludeExtensions = normalizeExtensions(parseJsonArray(folder.includeExtensions));
      const folderFileTypeFilters = normalizeExtensions(parseJsonArray(folder.fileTypeFilters));

      try {
        await startWatching({
          folderId: folder.id,
          characterId: folder.characterId,
          folderPath: normalizedPath,
          recursive: folder.recursive,
          includeExtensions: folderFileTypeFilters.length > 0 ? folderFileTypeFilters : folderIncludeExtensions,
          excludePatterns: parseJsonArray(folder.excludePatterns),
        });
      } catch (watchError) {
        await db
          .update(agentSyncFolders)
          .set({
            status: "error",
            lastError: watchError instanceof Error ? watchError.message : "Failed to start file watcher",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(agentSyncFolders.id, folder.id));
      }
    }
  }

  notifyFolderChange(folder.characterId, { type: "updated", folderId });
}

export async function syncAllFolders(
  characterId: string,
  parallelConfig: Partial<ParallelConfig> = {},
  forceReindex: boolean = false,
  trigger: SyncExecutionTrigger = "manual"
): Promise<SyncResult[]> {
  const folders = await getSyncFolders(characterId);
  const results: SyncResult[] = [];
  for (const folder of folders) {
    results.push(await syncFolder(folder.id, parallelConfig, forceReindex, trigger));
  }
  return results;
}

/**
 * Reindex all folders for an agent.
 * Drops the existing table to rebuild schema, then forces a full reindex.
 */
export async function reindexAllFolders(
  characterId: string,
  parallelConfig: Partial<ParallelConfig> = {}
): Promise<SyncResult[]> {
  console.log(`[SyncService] Reindexing all folders for agent ${characterId}`);
  await deleteAgentTable(characterId);
  return syncAllFolders(characterId, parallelConfig, true, "manual");
}

/**
 * Reindex all folders for every character that has synced folders.
 */
export async function reindexAllCharacters(
  parallelConfig: Partial<ParallelConfig> = {}
): Promise<Record<string, SyncResult[]>> {
  const rows = await db
    .select({ characterId: agentSyncFolders.characterId })
    .from(agentSyncFolders)
    .groupBy(agentSyncFolders.characterId);

  const results: Record<string, SyncResult[]> = {};
  for (const row of rows) {
    const characterId = row.characterId;
    if (!characterId) continue;
    results[characterId] = await reindexAllFolders(characterId, parallelConfig);
  }
  return results;
}

/**
 * Remove orphaned LanceDB tables that no longer have a matching character.
 */
export async function cleanupOrphanedVectorTables(): Promise<{ removed: string[]; kept: string[] }> {
  const tables = await listAgentTables();
  if (tables.length === 0) return { removed: [], kept: [] };

  const rows = await db.select({ id: characters.id }).from(characters);
  const validIds = new Set(rows.map(row => row.id));
  const removed: string[] = [];
  const kept: string[] = [];

  for (const table of tables) {
    const characterId = decodeAgentTableName(table);
    if (!characterId) { kept.push(table); continue; }
    if (!validIds.has(characterId)) {
      await deleteAgentTable(characterId);
      removed.push(table);
    } else {
      kept.push(table);
    }
  }

  if (removed.length > 0) {
    console.log(`[SyncService] Cleaned up ${removed.length} orphaned vector table(s): ${removed.join(", ")}`);
  }
  return { removed, kept };
}

// Global lock to prevent overlapping syncStaleFolders runs
let isSyncingStaleFolders = false;

/**
 * Sync pending folders (folders that were added but never synced).
 */
export async function syncPendingFolders(): Promise<SyncResult[]> {
  console.log("[SyncService] Checking for pending folders to sync...");

  const pendingFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.status, "pending"));

  console.log(`[SyncService] Found ${pendingFolders.length} pending folders to sync`);

  const results: SyncResult[] = [];
  for (const folder of pendingFolders) {
    if (!isSyncing(folder.id)) {
      results.push(await syncFolder(folder.id, {}, false, "auto"));
    }
  }
  return results;
}

/**
 * Sync stale folders (for app startup or periodic sync).
 * Includes pending folders that were never synced.
 */
export async function syncStaleFolders(maxAgeMs: number = 60 * 60 * 1000): Promise<SyncResult[]> {
  if (isSyncingStaleFolders) {
    console.log("[SyncService] syncStaleFolders already in progress, skipping");
    return [];
  }

  isSyncingStaleFolders = true;
  console.log("[SyncService] Checking for stale folders to sync...");

  try {
    const folders = await db
      .select()
      .from(agentSyncFolders)
      .where(
        or(
          eq(agentSyncFolders.status, "synced"),
          eq(agentSyncFolders.status, "error"),
          eq(agentSyncFolders.status, "pending")
        )
      );

    const staleFolders = folders.filter(f => {
      const behavior = resolveFolderSyncBehavior({
        indexingMode: f.indexingMode,
        syncMode: f.syncMode,
        syncCadenceMinutes: f.syncCadenceMinutes,
      });

      if (!shouldRunForTrigger(behavior, "scheduled")) return false;
      if (f.status === "pending") return true;
      if (!f.lastSyncedAt) return true;

      const cadenceMs = Math.max(behavior.syncCadenceMinutes * 60 * 1000, maxAgeMs);
      return f.lastSyncedAt < new Date(Date.now() - cadenceMs).toISOString();
    });

    console.log(`[SyncService] Found ${staleFolders.length} stale/pending folders to sync`);

    const results: SyncResult[] = [];
    for (const folder of staleFolders) {
      if (!isSyncing(folder.id)) {
        results.push(await syncFolder(folder.id, {}, false, "scheduled"));
      }
    }
    return results;
  } finally {
    isSyncingStaleFolders = false;
  }
}
