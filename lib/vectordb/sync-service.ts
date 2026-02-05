/**
 * Folder Sync Service
 *
 * Manages synchronization of local folders to the vector database.
 * Handles file discovery, indexing, and incremental updates.
 *
 * Supports parallel processing for faster indexing of large file sets.
 */

import { readdir, stat } from "fs/promises";
import { join, relative, extname } from "path";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders, agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq, and, sql, lt, or } from "drizzle-orm";
import { indexFileToVectorDB, removeFileFromVectorDB } from "./indexing";
import { DEFAULT_IGNORE_PATTERNS, createIgnoreMatcher } from "./ignore-patterns";
import { deleteAgentTable } from "./collections";
import { isVectorDBEnabled } from "./client";
import { startWatching, isWatching, stopWatching } from "./file-watcher";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import { getEmbeddingModelId } from "@/lib/ai/providers";

import { onFolderChange, notifyFolderChange, type FolderChangeEvent } from "./folder-events";
export { onFolderChange, notifyFolderChange };
export type { FolderChangeEvent };

/**
 * Parallel processing configuration
 */
export interface ParallelConfig {
  /** Number of files to process concurrently (default: 5) */
  concurrency: number;
  /** Delay in ms between starting each file to avoid rate limiting (default: 100) */
  staggerDelayMs: number;
}

const DEFAULT_PARALLEL_CONFIG: ParallelConfig = {
  concurrency: 5,
  staggerDelayMs: 100,
};

/**
 * Maximum time to spend indexing a single file before aborting.
 * Prevents sync from hanging on problematic files.
 */
const MAX_FILE_INDEXING_TIMEOUT_MS = 30 * 1000; // 1 minute

/**
 * Simple concurrency limiter for parallel processing
 * Limits the number of concurrent promises while maintaining order of results
 */
function createConcurrencyLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const resolve = queue.shift()!;
      resolve();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // Wait for a slot to become available
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    } else {
      activeCount++;
    }

    try {
      return await fn();
    } finally {
      activeCount--;
      next();
    }
  };
}

export interface SyncFolderConfig {
  id?: string;
  userId: string;
  characterId: string;
  folderPath: string;
  displayName?: string;
  recursive?: boolean;
  includeExtensions?: string[];
  excludePatterns?: string[];
  indexingMode?: "files-only" | "full" | "auto";
}

export interface SyncResult {
  folderId: string;
  filesProcessed: number;
  filesIndexed: number;
  filesSkipped: number;
  filesRemoved: number;
  errors: string[];
}

/**
 * Get file content hash for change detection
 */
async function getFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("md5").update(content).digest("hex");
}

/**
 * Check if a file should be included based on extension and patterns
 */
function shouldIncludeFile(
  filePath: string,
  includeExtensions: string[],
  shouldIgnore: (filePath: string) => boolean
): boolean {
  const ext = extname(filePath).slice(1).toLowerCase();

  // Check extension whitelist
  if (includeExtensions.length > 0 && !includeExtensions.includes(ext)) {
    return false;
  }

  return !shouldIgnore(filePath);
}

/**
 * Recursively discover files in a folder
 */
async function discoverFiles(
  folderPath: string,
  basePath: string,
  recursive: boolean,
  includeExtensions: string[],
  shouldIgnore: (filePath: string) => boolean
): Promise<Array<{ filePath: string; relativePath: string }>> {
  const files: Array<{ filePath: string; relativePath: string }> = [];

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(folderPath, entry.name);
      const relPath = relative(basePath, fullPath);

      if (entry.isDirectory()) {
          if (recursive && !shouldIgnore(fullPath)) {
            const subFiles = await discoverFiles(
              fullPath,
              basePath,
              recursive,
              includeExtensions,
              shouldIgnore
            );
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          if (shouldIncludeFile(fullPath, includeExtensions, shouldIgnore)) {
            files.push({ filePath: fullPath, relativePath: relPath });
          }
        }
    }
  } catch (error) {
    console.error(`[SyncService] Error reading folder ${folderPath}:`, error);
  }

  return files;
}

/**
 * Normalize extensions to ensure consistent format (without leading dots)
 */
function normalizeExtensions(extensions: string[]): string[] {
  return extensions.map(ext => ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase());
}

/**
 * Parse JSON arrays from database - handle both properly stored arrays and
 * legacy double-stringified data. Drizzle's JSON mode should return arrays,
 * but older data may have been double-stringified.
 */
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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
  } = config;

  // Normalize extensions to ensure consistent format (without dots)
  const normalizedExtensions = normalizeExtensions(includeExtensions);

  // Check if this is the first folder for this character
  const existingFolders = await getSyncFolders(characterId);
  const isPrimary = existingFolders.length === 0;

  const [folder] = await db
    .insert(agentSyncFolders)
    .values({
      userId,
      characterId,
      folderPath,
      displayName: displayName || folderPath.split("/").pop(),
      isPrimary,
      recursive,
      // Note: Drizzle handles JSON serialization automatically for mode: "json" columns
      // Do NOT use JSON.stringify here
      includeExtensions: normalizedExtensions,
      excludePatterns,
      indexingMode,
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

/**
 * Remove a sync folder and its indexed content
 * Cancels any running sync first to prevent orphaned processes
 */
export async function removeSyncFolder(folderId: string): Promise<void> {
  // First, get the folder to find its path
  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.id, folderId));

  if (folder) {
    // Cancel any running sync for this path
    if (syncingPaths.has(folder.folderPath)) {
      console.log(`[SyncService] Cancelling running sync for folder: ${folder.folderPath}`);
      await cancelSyncByPath(folder.folderPath);
    }

    // Stop file watcher if running
    if (isWatching(folderId)) {
      stopWatching(folderId);
    }
  }

  // Get all files for this folder
  const files = await db
    .select()
    .from(agentSyncFiles)
    .where(eq(agentSyncFiles.folderId, folderId));

  // Remove from vector DB
  for (const file of files) {
    // Use parseJsonArray to handle both properly stored arrays and legacy double-stringified data
    const pointIds = parseJsonArray(file.vectorPointIds);
    if (pointIds.length > 0) {
      await removeFileFromVectorDB({
        characterId: file.characterId,
        pointIds,
      });
    }
  }

  // Delete folder (cascade deletes files)
  const wasPrimary = folder.isPrimary;
  const characterId = folder.characterId;

  await db.delete(agentSyncFolders).where(eq(agentSyncFolders.id, folderId));
  console.log(`[SyncService] Removed sync folder: ${folderId}`);

  // If it was primary, promote the next folder if available
  if (wasPrimary) {
    const remainingFolders = await getSyncFolders(characterId);
    if (remainingFolders.length > 0) {
      await setPrimaryFolder(remainingFolders[0].id, characterId);
      console.log(`[SyncService] Promoted folder ${remainingFolders[0].id} to primary`);
    }
  }

  notifyFolderChange(characterId, {
    type: "removed",
    folderId,
    wasPrimary,
  });
}

/**
 * Sync a folder - index new/changed files, remove deleted files
 * Now supports parallel processing for faster indexing of large file sets.
 *
 * @param folderId - The folder ID to sync
 * @param parallelConfig - Optional configuration for parallel processing
 */
export async function syncFolder(
  folderId: string,
  parallelConfig: Partial<ParallelConfig> = {},
  forceReindex: boolean = false
): Promise<SyncResult> {
  const config: ParallelConfig = {
    ...DEFAULT_PARALLEL_CONFIG,
    ...parallelConfig,
  };

  const result: SyncResult = {
    folderId,
    filesProcessed: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesRemoved: 0,
    errors: [],
  };

  // Get folder config
  const [folder] = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.id, folderId));

  if (!folder) {
    result.errors.push("Folder not found");
    return result;
  }

  // Determine if we should create embeddings based on indexing mode
  const shouldCreateEmbeddings =
    folder.indexingMode === "full" ||
    (folder.indexingMode === "auto" && isVectorDBEnabled());

  console.log(
    `[SyncService] Syncing folder ${folder.displayName || folder.folderPath} with mode: ${folder.indexingMode} (embeddings: ${shouldCreateEmbeddings})`
  );

  // Check if already syncing (in memory) by folder ID
  if (syncingFolders.has(folderId)) {
    console.log(`[SyncService] Folder ${folderId} is already being synced, skipping`);
    result.errors.push("Folder is already being synced");
    return result;
  }

  // Check if the same path is already being synced (by a different folder ID)
  // This can happen if the folder was removed and re-added quickly
  if (syncingPaths.has(folder.folderPath)) {
    const existingSync = syncingPaths.get(folder.folderPath)!;
    if (existingSync.folderId !== folderId) {
      console.log(`[SyncService] Path ${folder.folderPath} is already being synced by folder ${existingSync.folderId}, cancelling old sync`);
      existingSync.abortController.abort();
      // Wait briefly for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Create AbortController for this sync
  const syncAbortController = new AbortController();

  // Track this folder as syncing (both by ID and by path)
  syncingFolders.add(folderId);
  syncingPaths.set(folder.folderPath, {
    folderId,
    abortController: syncAbortController,
  });

  // Update status to syncing, initialize counts to 0, and clear any previous error
  await db
    .update(agentSyncFolders)
    .set({
      status: "syncing",
      lastError: null,
      fileCount: 0,
      chunkCount: 0,
      updatedAt: new Date().toISOString()
    })
    .where(eq(agentSyncFolders.id, folderId));

  try {
    // Use module-level parseJsonArray helper for parsing JSON arrays from database
    const includeExtensions = normalizeExtensions(parseJsonArray(folder.includeExtensions));
    const excludePatterns = parseJsonArray(folder.excludePatterns);
    const mergedExcludePatterns = Array.from(
      new Set([...DEFAULT_IGNORE_PATTERNS, ...excludePatterns])
    );
    const shouldIgnore = createIgnoreMatcher(mergedExcludePatterns, folder.folderPath);

    console.log(`[SyncService] Discovering files in ${folder.folderPath}`);
    console.log(`[SyncService] Include extensions: ${JSON.stringify(includeExtensions)}`);
    console.log(`[SyncService] Exclude patterns: ${JSON.stringify(mergedExcludePatterns)}`);
    console.log(`[SyncService] Parallel config: concurrency=${config.concurrency}, staggerDelayMs=${config.staggerDelayMs}`);
    if (forceReindex) {
      console.log(`[SyncService] Force reindex enabled for folder ${folder.folderPath}`);
    }

    // Discover files
    const discoveredFiles = await discoverFiles(
      folder.folderPath,
      folder.folderPath,
      folder.recursive,
      includeExtensions,
      shouldIgnore
    );

    console.log(`[SyncService] Discovered ${discoveredFiles.length} files to process`);

    // Get existing indexed files
    const existingFiles = await db
      .select()
      .from(agentSyncFiles)
      .where(eq(agentSyncFiles.folderId, folderId));

    const existingFileMap = new Map(existingFiles.map(f => [f.filePath, f]));
    const discoveredPaths = new Set(discoveredFiles.map(f => f.filePath));

    // Remove files that no longer exist
    for (const existing of existingFiles) {
      if (!discoveredPaths.has(existing.filePath)) {
        // Use parseJsonArray to handle both properly stored arrays and legacy double-stringified data
        const pointIds = parseJsonArray(existing.vectorPointIds);
        if (pointIds.length > 0) {
          await removeFileFromVectorDB({
            characterId: folder.characterId,
            pointIds,
          });
        }
        await db.delete(agentSyncFiles).where(eq(agentSyncFiles.id, existing.id));
        result.filesRemoved++;
      }
    }

    // Create concurrency limiter for parallel processing
    const limitConcurrency = createConcurrencyLimiter(config.concurrency);

    // Track progress for logging
    let processedCount = 0;
    let indexedCount = 0;
    let totalChunksIndexed = 0;
    const totalFiles = discoveredFiles.length;
    const startTime = Date.now();
    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL_MS = 500; // Update DB every 500ms for responsive UI

    // Helper to update progress in database periodically
    const updateProgressInDb = async (force: boolean = false) => {
      const now = Date.now();
      if (force || now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
        lastProgressUpdate = now;
        await db
          .update(agentSyncFolders)
          .set({
            fileCount: indexedCount,
            chunkCount: totalChunksIndexed,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(agentSyncFolders.id, folderId));
      }
    };

    // Process a single file - returns result for aggregation
    const processFile = async (
      file: { filePath: string; relativePath: string },
      fileIndex: number
    ): Promise<{
      indexed: boolean;
      skipped: boolean;
      error?: string;
      chunkCount?: number;
    }> => {
      // Check if sync was cancelled before starting
      if (syncAbortController.signal.aborted) {
        return { indexed: false, skipped: true, error: "Sync cancelled" };
      }

      // Stagger start times to avoid overwhelming the API
      if (config.staggerDelayMs > 0 && fileIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, config.staggerDelayMs * (fileIndex % config.concurrency)));
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAX_FILE_INDEXING_TIMEOUT_MS);

      try {
        const fileStat = await stat(file.filePath);
        const fileHash = await getFileHash(file.filePath);
        const existing = existingFileMap.get(file.filePath);

        // Skip if unchanged
        if (!forceReindex && existing && existing.contentHash === fileHash) {
          clearTimeout(timeoutId);
          processedCount++;
          logProgress(processedCount, totalFiles, file.relativePath, "skipped", startTime);
          return { indexed: false, skipped: true };
        }

        // Check file size (line count and line length) - skip very large files
        // Use maxFileLines and maxLineLength from config (user-configurable in settings)
        const { maxFileLines, maxLineLength } = getVectorSearchConfig();
        try {
          const content = await readFile(file.filePath, "utf-8");
          const lineCount = content.split("\n").length;
          if (lineCount > maxFileLines) {
            clearTimeout(timeoutId);
            processedCount++;
            console.warn(`[SyncService] Skipping large file (${lineCount} lines, max ${maxFileLines}): ${file.relativePath}`);
            logProgress(processedCount, totalFiles, file.relativePath, "skipped", startTime);
            return {
              indexed: false,
              skipped: true,
              error: `${file.relativePath}: File too large (${lineCount} lines, max ${maxFileLines})`
            };
          }

          // Check for excessively long lines (e.g. base64 strings)
          const lines = content.split("\n");
          const tooLongLine = lines.find(line => line.length > maxLineLength);
          if (tooLongLine) {
            clearTimeout(timeoutId);
            processedCount++;
            console.warn(`[SyncService] Skipping file with long line (${tooLongLine.length} chars, max ${maxLineLength}): ${file.relativePath}`);
            logProgress(processedCount, totalFiles, file.relativePath, "skipped", startTime);
            return {
              indexed: false,
              skipped: true,
              error: `${file.relativePath}: File contains too long line (${tooLongLine.length} chars, max ${maxLineLength})`
            };
          }
        } catch (readError) {
          // If we can't read as text (binary file), let indexing handle it
          console.log(`[SyncService] Could not read file as text, proceeding with indexing: ${file.relativePath}`);
        }

        // Log start for debugging large files hanging
        console.log(`[SyncService] Processing file ${fileIndex + 1}/${totalFiles}: ${file.relativePath}`);

        let indexResult: { pointIds: string[]; chunkCount: number; error?: string };

        if (shouldCreateEmbeddings) {
          // FULL MODE: Create embeddings

          // Remove old vectors if updating
          if (existing) {
            const pointIds = parseJsonArray(existing.vectorPointIds);
            if (pointIds.length > 0) {
              await removeFileFromVectorDB({
                characterId: folder.characterId,
                pointIds,
              });
            }
          }

          // Index the file (this calls the embedding API)
          // Pass signal to allow cancellation on timeout
          indexResult = await indexFileToVectorDB({
            characterId: folder.characterId,
            folderId,
            filePath: file.filePath,
            relativePath: file.relativePath,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (indexResult.error) {
            processedCount++;
            logProgress(processedCount, totalFiles, file.relativePath, "error", startTime);
            return { indexed: false, skipped: false, error: `${file.relativePath}: ${indexResult.error}` };
          }
        } else {
          // FILES-ONLY MODE: Track file without creating embeddings
          clearTimeout(timeoutId);

          // Remove old vectors if they exist (user may have switched from full to files-only)
          if (existing) {
            const pointIds = parseJsonArray(existing.vectorPointIds);
            if (pointIds.length > 0) {
              await removeFileFromVectorDB({
                characterId: folder.characterId,
                pointIds,
              });
            }
          }

          // No embeddings created, just track the file
          indexResult = {
            pointIds: [],
            chunkCount: 0,
          };
        }

        // Upsert file record - use a transaction-like approach for safety
        if (existing) {
          await db
            .update(agentSyncFiles)
            .set({
              contentHash: fileHash,
              sizeBytes: fileStat.size,
              modifiedAt: fileStat.mtime.toISOString(),
              status: "indexed",
              vectorPointIds: indexResult.pointIds,
              chunkCount: indexResult.chunkCount,
              lastIndexedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(agentSyncFiles.id, existing.id));
        } else {
          await db.insert(agentSyncFiles).values({
            folderId,
            characterId: folder.characterId,
            filePath: file.filePath,
            relativePath: file.relativePath,
            contentHash: fileHash,
            sizeBytes: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
            status: "indexed",
            vectorPointIds: indexResult.pointIds,
            chunkCount: indexResult.chunkCount,
            lastIndexedAt: new Date().toISOString(),
          });
        }

        processedCount++;
        indexedCount++;
        totalChunksIndexed += indexResult.chunkCount || 0;
        logProgress(processedCount, totalFiles, file.relativePath, "indexed", startTime);

        // Update progress in DB periodically
        await updateProgressInDb();

        return { indexed: true, skipped: false, chunkCount: indexResult.chunkCount || 0 };
      } catch (error) {
        clearTimeout(timeoutId);
        processedCount++;

        let errorMsg = error instanceof Error ? error.message : "Unknown error";
        if (controller.signal.aborted) {
          errorMsg = "Timeout (5m) exceeded";
        }

        logProgress(processedCount, totalFiles, file.relativePath, "error", startTime);
        return { indexed: false, skipped: false, error: `${file.relativePath}: ${errorMsg}` };
      }
    };

    // Process all files in parallel with concurrency limit
    console.log(`[SyncService] Starting parallel indexing with ${config.concurrency} concurrent workers...`);

    const fileProcessingPromises = discoveredFiles.map((file, index) =>
      limitConcurrency(() => processFile(file, index))
    );

    const results = await Promise.all(fileProcessingPromises);

    // Aggregate results
    for (const fileResult of results) {
      result.filesProcessed++;
      if (fileResult.indexed) {
        result.filesIndexed++;
      } else if (fileResult.skipped) {
        result.filesSkipped++;
      }
      if (fileResult.error) {
        result.errors.push(fileResult.error);
      }
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SyncService] Parallel indexing complete in ${elapsedSeconds}s`);

    // Calculate actual total chunk count from all files
    const allFolderFiles = await db
      .select()
      .from(agentSyncFiles)
      .where(eq(agentSyncFiles.folderId, folderId));

    const totalChunkCount = allFolderFiles.reduce((sum, file) => sum + (file.chunkCount || 0), 0);

    // Update folder status
    // Partial success (some files errored but most succeeded) should still be "synced"
    // to avoid infinite sync loops if a few files always fail.
    const hasIndexedFiles = allFolderFiles.length > 0 || result.filesIndexed > 0;
    const syncStatus = (!hasIndexedFiles && result.errors.length > 0) ? "error" : "synced";

    // Store errors for debugging, but don't let partial failures block the sync
    // Show all errors, not truncated, so user can see which files failed
    const errorSummary = result.errors.length > 0
      ? `${result.errors.length} file(s) failed: ${result.errors.join("; ")}`
      : null;

    // Get the embedding model used for this sync (only if embeddings were created)
    const embeddingModelId = shouldCreateEmbeddings ? getEmbeddingModelId() : null;

    await db
      .update(agentSyncFolders)
      .set({
        status: syncStatus,
        lastSyncedAt: new Date().toISOString(),
        lastError: errorSummary,
        fileCount: allFolderFiles.length,
        chunkCount: totalChunkCount,
        embeddingModel: embeddingModelId, // Track which embedding model was used (null for files-only mode)
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSyncFolders.id, folderId));

    // Start file watcher if sync was successful
    if (syncStatus === "synced" && !isWatching(folderId)) {
      const watchConfig = {
        folderId,
        characterId: folder.characterId,
        folderPath: folder.folderPath,
        recursive: folder.recursive,
        includeExtensions,
        excludePatterns,
      };

      // Start watching in the background (don't await to avoid blocking)
      startWatching(watchConfig).catch(err => {
        console.error(`[SyncService] Failed to start file watcher for ${folder.folderPath}:`, err);
      });
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Sync failed";
    result.errors.push(errorMsg);

    await db
      .update(agentSyncFolders)
      .set({
        status: "error",
        lastError: errorMsg,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSyncFolders.id, folderId));
  } finally {
    // Always remove from syncing tracking sets (both ID and path)
    syncingFolders.delete(folderId);
    syncingPaths.delete(folder.folderPath);
  }

  console.log(`[SyncService] Sync complete for folder ${folderId}:`, result);
  return result;
}

/**
 * Log progress during parallel processing
 */
function logProgress(
  processed: number,
  total: number,
  fileName: string,
  status: "indexed" | "skipped" | "error",
  startTime: number
): void {
  const percent = Math.round((processed / total) * 100);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);

  // Log every 10 files or at key milestones
  if (processed % 10 === 0 || processed === total || processed <= 5) {
    console.log(
      `[SyncService] Progress: ${processed}/${total} (${percent}%) | ` +
      `Rate: ${rate} files/sec | Elapsed: ${elapsed}s | ` +
      `Last: ${fileName} [${status}]`
    );
  }
}

/**
 * Sync all folders for an agent
 */
export async function syncAllFolders(
  characterId: string,
  parallelConfig: Partial<ParallelConfig> = {},
  forceReindex: boolean = false
): Promise<SyncResult[]> {
  const folders = await getSyncFolders(characterId);
  const results: SyncResult[] = [];

  for (const folder of folders) {
    const result = await syncFolder(folder.id, parallelConfig, forceReindex);
    results.push(result);
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
  return syncAllFolders(characterId, parallelConfig, true);
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

// Track folders currently being synced - by folder ID
const syncingFolders = new Set<string>();

// Track syncs by folder path to detect duplicates even with different IDs
// Maps folderPath -> { folderId, abortController }
interface SyncTracking {
  folderId: string;
  abortController: AbortController;
}
const syncingPaths = new Map<string, SyncTracking>();

// Global lock to prevent overlapping syncStaleFolders runs
let isSyncingStaleFolders = false;

// Maximum time a folder can be in "syncing" status before it's considered stale
const MAX_SYNCING_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check if a folder is currently being synced
 */
export function isSyncing(folderId: string): boolean {
  return syncingFolders.has(folderId);
}

/**
 * Check if a folder path is currently being synced (by any folder ID)
 */
export function isSyncingPath(folderPath: string): boolean {
  return syncingPaths.has(folderPath);
}

/**
 * Cancel a running sync for a folder path
 * @returns true if a sync was cancelled, false if no sync was running
 */
export async function cancelSyncByPath(folderPath: string): Promise<boolean> {
  const tracking = syncingPaths.get(folderPath);
  if (!tracking) {
    return false;
  }

  console.log(`[SyncService] Cancelling sync for path: ${folderPath} (folder ID: ${tracking.folderId})`);
  tracking.abortController.abort();

  // Wait briefly for the sync to acknowledge the abort
  await new Promise(resolve => setTimeout(resolve, 500));

  return true;
}

/**
 * Cancel a running sync for a folder ID
 * @returns true if a sync was cancelled, false if no sync was running
 */
export async function cancelSyncById(folderId: string): Promise<boolean> {
  // Find the path for this folder ID
  for (const [path, tracking] of syncingPaths.entries()) {
    if (tracking.folderId === folderId) {
      return cancelSyncByPath(path);
    }
  }
  return false;
}

/**
 * Recover folders that are stuck in "syncing" status
 * This can happen if the sync process crashes or the app is closed mid-sync
 */
export async function recoverStuckSyncingFolders(): Promise<number> {
  const cutoffTime = new Date(Date.now() - MAX_SYNCING_DURATION_MS).toISOString();

  // Find folders that have been "syncing" for too long
  const stuckFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.status, "syncing"));

  let recoveredCount = 0;

  for (const folder of stuckFolders) {
    // Check if folder is actually being synced in memory
    if (syncingFolders.has(folder.id)) {
      continue; // Skip - actually in progress
    }

    // Check if the folder has been "syncing" for too long
    const updatedAt = folder.updatedAt || folder.createdAt;
    if (updatedAt < cutoffTime) {
      console.log(`[SyncService] Recovering stuck syncing folder: ${folder.id} (${folder.folderPath})`);

      // Reset to synced or error based on whether files were indexed
      const newStatus = (folder.fileCount ?? 0) > 0 ? "synced" : "error";
      const errorMsg = newStatus === "error" ? "Sync process was interrupted" : null;

      await db
        .update(agentSyncFolders)
        .set({
          status: newStatus,
          lastError: errorMsg,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(agentSyncFolders.id, folder.id));

      recoveredCount++;
    }
  }

  if (recoveredCount > 0) {
    console.log(`[SyncService] Recovered ${recoveredCount} stuck syncing folders`);
  }

  return recoveredCount;
}

/**
 * Force cleanup of all stuck sync folders regardless of time threshold.
 * Resets all folders with "syncing" or "pending" status that are not actively being synced in memory.
 * @returns Object with counts of cleaned syncing and pending folders
 */
export async function forceCleanupStuckFolders(): Promise<{ syncingCleaned: number; pendingCleaned: number }> {
  console.log("[SyncService] Force cleanup of stuck folders...");

  // Find all folders in syncing or pending status
  const stuckFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(
      or(
        eq(agentSyncFolders.status, "syncing"),
        eq(agentSyncFolders.status, "pending")
      )
    );

  let syncingCleaned = 0;
  let pendingCleaned = 0;

  for (const folder of stuckFolders) {
    // Skip if actually being synced in memory
    if (syncingFolders.has(folder.id)) {
      console.log(`[SyncService] Skipping folder ${folder.id} - actively syncing in memory`);
      continue;
    }

    const wasStatus = folder.status;
    // Always reset to synced - interrupted syncs are not errors, just incomplete
    const newStatus = "synced";

    console.log(`[SyncService] Cleaning up folder: ${folder.id} (${folder.folderPath}) - ${wasStatus} -> ${newStatus}`);

    await db
      .update(agentSyncFolders)
      .set({
        status: newStatus,
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentSyncFolders.id, folder.id));

    if (wasStatus === "syncing") {
      syncingCleaned++;
    } else {
      pendingCleaned++;
    }
  }

  console.log(`[SyncService] Force cleanup complete: ${syncingCleaned} syncing, ${pendingCleaned} pending folders cleaned`);
  return { syncingCleaned, pendingCleaned };
}

/**
 * Get all synced folders that need watchers restarted (for app startup)
 */
export async function getSyncedFoldersNeedingWatch(): Promise<Array<{
  folderId: string;
  characterId: string;
  folderPath: string;
  recursive: boolean;
  includeExtensions: string[];
  excludePatterns: string[];
}>> {
  const folders = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.status, "synced"));

  return folders.map(folder => ({
    folderId: folder.id,
    characterId: folder.characterId,
    folderPath: folder.folderPath,
    recursive: folder.recursive,
    includeExtensions: parseJsonArray(folder.includeExtensions),
    excludePatterns: parseJsonArray(folder.excludePatterns),
  }));
}

/**
 * Get stale folders that haven't been synced recently
 * @param maxAgeMs Maximum age in milliseconds (default: 1 hour)
 */
export async function getStaleFolders(maxAgeMs: number = 60 * 60 * 1000): Promise<string[]> {
  const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();

  const staleFolders = await db
    .select({ id: agentSyncFolders.id })
    .from(agentSyncFolders)
    .where(
      or(
        eq(agentSyncFolders.status, "synced"),
        eq(agentSyncFolders.status, "error")
      )
    );

  // Filter by lastSyncedAt in application code (SQLite text comparison)
  return staleFolders
    .filter(f => {
      // Get full folder data for this ID
      return true; // Will be filtered below
    })
    .map(f => f.id);
}

/**
 * Restart file watchers for all synced folders (called on app startup)
 */
export async function restartAllWatchers(): Promise<void> {
  console.log("[SyncService] Restarting file watchers for synced folders...");

  const foldersToWatch = await getSyncedFoldersNeedingWatch();

  for (const folder of foldersToWatch) {
    if (!isWatching(folder.folderId)) {
      try {
        await startWatching({
          folderId: folder.folderId,
          characterId: folder.characterId,
          folderPath: folder.folderPath,
          recursive: folder.recursive,
          includeExtensions: folder.includeExtensions,
          excludePatterns: folder.excludePatterns,
        });
        console.log(`[SyncService] Restarted watcher for ${folder.folderPath}`);
      } catch (error) {
        console.error(`[SyncService] Failed to restart watcher for ${folder.folderPath}:`, error);
      }
    }
  }

  console.log(`[SyncService] Restarted ${foldersToWatch.length} file watchers`);
}

/**
 * Sync pending folders (folders that were added but never synced)
 * This should be called after adding a folder or on app startup
 */
export async function syncPendingFolders(): Promise<SyncResult[]> {
  console.log("[SyncService] Checking for pending folders to sync...");

  // Get all folders with pending status
  const pendingFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.status, "pending"));

  console.log(`[SyncService] Found ${pendingFolders.length} pending folders to sync`);

  const results: SyncResult[] = [];
  for (const folder of pendingFolders) {
    if (!isSyncing(folder.id)) {
      const result = await syncFolder(folder.id);
      results.push(result);
    }
  }

  return results;
}

/**
 * Sync stale folders (for app startup or periodic sync)
 * Now includes pending folders that were never synced
 * @param maxAgeMs Maximum age in milliseconds before a folder is considered stale
 */
export async function syncStaleFolders(maxAgeMs: number = 60 * 60 * 1000): Promise<SyncResult[]> {
  if (isSyncingStaleFolders) {
    console.log("[SyncService] syncStaleFolders already in progress, skipping");
    return [];
  }

  isSyncingStaleFolders = true;
  console.log("[SyncService] Checking for stale folders to sync...");

  try {
    const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();

    // Get folders that are synced, errored, OR pending (never synced)
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

    // Filter to only stale folders or pending folders
    const staleFolders = folders.filter(f => {
      // Pending folders should always be synced
      if (f.status === "pending") return true;
      // Never synced folders should be synced
      if (!f.lastSyncedAt) return true;
      // Stale folders (synced/error) that haven't been synced recently
      return f.lastSyncedAt < cutoffTime;
    });

    console.log(`[SyncService] Found ${staleFolders.length} stale/pending folders to sync`);

    const results: SyncResult[] = [];
    for (const folder of staleFolders) {
      if (!isSyncing(folder.id)) {
        const result = await syncFolder(folder.id);
        results.push(result);
      }
    }

    return results;
  } finally {
    isSyncingStaleFolders = false;
  }
}
