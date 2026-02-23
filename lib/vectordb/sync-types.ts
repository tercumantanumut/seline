/**
 * Sync Service Types
 *
 * Shared interfaces, types, and constants for the folder sync service.
 */

import type { ChunkPreset, ReindexPolicy, SyncMode } from "./sync-mode-resolver";

/**
 * Parallel processing configuration
 */
export interface ParallelConfig {
  /** Number of files to process concurrently (default: 5) */
  concurrency: number;
  /** Delay in ms between starting each file to avoid rate limiting (default: 100) */
  staggerDelayMs: number;
}

export const DEFAULT_PARALLEL_CONFIG: ParallelConfig = {
  concurrency: 5,
  staggerDelayMs: 100,
};

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
  syncMode?: SyncMode;
  syncCadenceMinutes?: number;
  fileTypeFilters?: string[];
  maxFileSizeBytes?: number;
  chunkPreset?: ChunkPreset;
  chunkSizeOverride?: number;
  chunkOverlapOverride?: number;
  reindexPolicy?: ReindexPolicy;
}

export interface SyncFolderUpdateConfig {
  folderId: string;
  displayName?: string;
  recursive?: boolean;
  includeExtensions?: string[];
  excludePatterns?: string[];
  indexingMode?: "files-only" | "full" | "auto";
  syncMode?: SyncMode;
  syncCadenceMinutes?: number;
  fileTypeFilters?: string[];
  maxFileSizeBytes?: number;
  chunkPreset?: ChunkPreset;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  reindexPolicy?: ReindexPolicy;
}

export interface SyncResult {
  folderId: string;
  filesProcessed: number;
  filesIndexed: number;
  filesSkipped: number;
  filesRemoved: number;
  skippedReasons?: Record<string, number>;
  errors: string[];
}

// Track syncs by folder path to detect duplicates even with different IDs
// Maps folderPath -> { folderId, abortController }
export interface SyncTracking {
  folderId: string;
  abortController: AbortController;
}
