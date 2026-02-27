/**
 * Sync File Processor
 *
 * Processes a single file during a folder sync operation:
 * checks size limits, detects changes, creates/removes embeddings, and
 * upserts the file record in the database.
 */

import { stat } from "fs/promises";
import { readFile } from "fs/promises";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq } from "drizzle-orm";
import { indexFileToVectorDB, removeFileFromVectorDB } from "./indexing";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import {
  MAX_FILE_INDEXING_TIMEOUT_MS,
  shouldApplyTextLineChecks,
  scanTextFileLimits,
  formatTimeout,
  parseJsonArray,
  incrementSkipReason,
  logProgress,
} from "./sync-helpers";
import type { ParallelConfig } from "./sync-types";

export interface FileProcessorContext {
  folderId: string;
  characterId: string;
  folderPath: string;
  syncAbortController: AbortController;
  skipReasons: Record<string, number>;
  config: ParallelConfig;
  existingFileMap: Map<string, {
    id: string;
    contentHash: string | null;
    vectorPointIds: unknown;
  }>;
  behavior: {
    maxFileSizeBytes: number;
    shouldCreateEmbeddings: boolean;
  };
  shouldForceReindex: boolean;
  totalFiles: number;
  startTime: number;
  chunkingOverrides: {
    useOverrides: boolean;
    chunkSize: number;
    chunkOverlap: number;
  };
  /** Mutable counters — callers must read back values after processing */
  counters: {
    processedCount: number;
    indexedCount: number;
    totalChunksIndexed: number;
  };
  /** Callback to persist progress to the database periodically */
  onProgress: () => Promise<void>;
}

export interface FileProcessResult {
  indexed: boolean;
  skipped: boolean;
  error?: string;
  chunkCount?: number;
}

/**
 * Process a single file during a folder sync batch.
 * Mutates `ctx.counters` for processedCount / indexedCount / totalChunksIndexed.
 */
export async function processFileInBatch(
  file: { filePath: string; relativePath: string },
  fileIndex: number,
  ctx: FileProcessorContext
): Promise<FileProcessResult> {
  const {
    folderId,
    characterId,
    syncAbortController,
    skipReasons,
    config,
    existingFileMap,
    behavior,
    shouldForceReindex,
    totalFiles,
    startTime,
    chunkingOverrides,
    counters,
    onProgress,
  } = ctx;

  // Check if sync was cancelled before starting
  if (syncAbortController.signal.aborted) {
    incrementSkipReason(skipReasons, "cancelled");
    return { indexed: false, skipped: true, error: "Sync cancelled" };
  }

  // Stagger start times to avoid overwhelming the API
  if (config.staggerDelayMs > 0 && fileIndex > 0) {
    await new Promise(resolve =>
      setTimeout(resolve, config.staggerDelayMs * (fileIndex % config.concurrency))
    );
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MAX_FILE_INDEXING_TIMEOUT_MS);

  try {
    const fileStat = await stat(file.filePath);
    const existing = existingFileMap.get(file.filePath);

    if (fileStat.size > behavior.maxFileSizeBytes) {
      clearTimeout(timeoutId);
      counters.processedCount++;
      incrementSkipReason(skipReasons, "max_file_size");
      logProgress(counters.processedCount, totalFiles, file.relativePath, "skipped", startTime);
      return {
        indexed: false,
        skipped: true,
        error: `${file.relativePath}: File exceeds max size (${fileStat.size} bytes, max ${behavior.maxFileSizeBytes})`,
      };
    }

    // Compute hash for change detection
    const rawContent = await readFile(file.filePath);
    const { createHash } = await import("crypto");
    const fileHash = createHash("md5").update(rawContent).digest("hex");

    // Skip if unchanged
    if (!shouldForceReindex && existing && existing.contentHash === fileHash) {
      clearTimeout(timeoutId);
      counters.processedCount++;
      incrementSkipReason(skipReasons, "unchanged");
      logProgress(counters.processedCount, totalFiles, file.relativePath, "skipped", startTime);
      return { indexed: false, skipped: true };
    }

    // Check file size by line heuristics only for text-like formats.
    // Binary formats (e.g. PDF) should bypass this and be handled by format-specific parsers.
    if (shouldApplyTextLineChecks(file.filePath)) {
      const { maxFileLines, maxLineLength } = getVectorSearchConfig();
      try {
        const content = await readFile(file.filePath, "utf-8");
        const scanResult = scanTextFileLimits(content, maxFileLines, maxLineLength);

        if (scanResult.lineCount > maxFileLines) {
          clearTimeout(timeoutId);
          counters.processedCount++;
          incrementSkipReason(skipReasons, "max_file_lines");
          console.warn(
            `[SyncService] Skipping large file (${scanResult.lineCount} lines, max ${maxFileLines}): ${file.relativePath}`
          );
          logProgress(counters.processedCount, totalFiles, file.relativePath, "skipped", startTime);
          return {
            indexed: false,
            skipped: true,
            error: `${file.relativePath}: File too large (${scanResult.lineCount} lines, max ${maxFileLines})`,
          };
        }

        if (typeof scanResult.tooLongLineLength === "number") {
          clearTimeout(timeoutId);
          counters.processedCount++;
          incrementSkipReason(skipReasons, "max_line_length");
          console.warn(
            `[SyncService] Skipping file with long line (${scanResult.tooLongLineLength} chars, max ${maxLineLength}): ${file.relativePath}`
          );
          logProgress(counters.processedCount, totalFiles, file.relativePath, "skipped", startTime);
          return {
            indexed: false,
            skipped: true,
            error: `${file.relativePath}: File contains too long line (${scanResult.tooLongLineLength} chars, max ${maxLineLength})`,
          };
        }
      } catch {
        // If text read fails unexpectedly, let indexing/parsers decide.
        console.log(`[SyncService] Could not read file as text, proceeding with indexing: ${file.relativePath}`);
      }
    }

    // Log start for debugging large files hanging
    console.log(`[SyncService] Processing file ${fileIndex + 1}/${totalFiles}: ${file.relativePath}`);

    let indexResult: { pointIds: string[]; chunkCount: number; error?: string };

    if (behavior.shouldCreateEmbeddings) {
      // FULL MODE: Create embeddings

      // Remove old vectors if updating
      if (existing) {
        const pointIds = parseJsonArray(existing.vectorPointIds);
        if (pointIds.length > 0) {
          await removeFileFromVectorDB({ characterId, pointIds });
        }
      }

      // Index the file (this calls the embedding API)
      // Pass signal to allow cancellation on timeout
      indexResult = await indexFileToVectorDB({
        characterId,
        folderId,
        filePath: file.filePath,
        relativePath: file.relativePath,
        signal: controller.signal,
        chunkingOverrides: chunkingOverrides.useOverrides
          ? {
              maxCharacters: chunkingOverrides.chunkSize,
              overlapCharacters: chunkingOverrides.chunkOverlap,
            }
          : undefined,
      });

      clearTimeout(timeoutId);

      if (indexResult.error) {
        counters.processedCount++;
        logProgress(counters.processedCount, totalFiles, file.relativePath, "error", startTime);
        return { indexed: false, skipped: false, error: `${file.relativePath}: ${indexResult.error}` };
      }
    } else {
      // FILES-ONLY MODE: Track file without creating embeddings
      clearTimeout(timeoutId);

      // Remove old vectors if they exist (user may have switched from full to files-only)
      if (existing) {
        const pointIds = parseJsonArray(existing.vectorPointIds);
        if (pointIds.length > 0) {
          await removeFileFromVectorDB({ characterId, pointIds });
        }
      }

      // No embeddings created, just track the file
      indexResult = { pointIds: [], chunkCount: 0 };
    }

    // Upsert file record
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
        characterId,
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

    counters.processedCount++;
    counters.indexedCount++;
    counters.totalChunksIndexed += indexResult.chunkCount || 0;
    logProgress(counters.processedCount, totalFiles, file.relativePath, "indexed", startTime);

    // Update progress in DB periodically
    await onProgress();

    return { indexed: true, skipped: false, chunkCount: indexResult.chunkCount || 0 };
  } catch (error) {
    clearTimeout(timeoutId);
    counters.processedCount++;

    // Folder was deleted mid-sync — not a real error, just skip gracefully
    const errObj = error as { code?: string };
    if (errObj.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      console.warn(`[SyncFileProcessor] Folder deleted mid-sync, skipping: ${file.relativePath}`);
      return { indexed: false, skipped: true };
    }

    let errorMsg = error instanceof Error ? error.message : "Unknown error";
    if (controller.signal.aborted) {
      errorMsg = `Timeout (${formatTimeout(MAX_FILE_INDEXING_TIMEOUT_MS)}) exceeded`;
    }

    logProgress(counters.processedCount, totalFiles, file.relativePath, "error", startTime);
    return { indexed: false, skipped: false, error: `${file.relativePath}: ${errorMsg}` };
  }
}
