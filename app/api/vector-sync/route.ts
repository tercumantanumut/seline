import { NextRequest, NextResponse } from "next/server";
import {
  addSyncFolder,
  getSyncFolders,
  removeSyncFolder,
  syncFolder,
  syncAllFolders,
  reindexAllFolders,
  reindexAllCharacters,
  forceCleanupStuckFolders,
  setPrimaryFolder,
  cancelSyncById,
  updateSyncFolderSettings,
} from "@/lib/vectordb/sync-service";
import { getSetting, updateSetting } from "@/lib/settings/settings-manager";
import { DEFAULT_IGNORE_PATTERNS } from "@/lib/vectordb/ignore-patterns";

const VALID_SYNC_MODES = ["auto", "manual", "scheduled", "triggered"] as const;
const VALID_INDEXING_MODES = ["auto", "full", "files-only"] as const;
const VALID_CHUNK_PRESETS = ["balanced", "small", "large", "custom"] as const;
const VALID_REINDEX_POLICIES = ["smart", "always", "never"] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!isStringArray(value)) return undefined;
  return value.map((item) => item.trim()).filter(Boolean);
}

function isValidEnum<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (normalized <= 0) return undefined;
  return normalized;
}

/**
 * GET /api/vector-sync?characterId=xxx
 * Get all sync folders for an agent
 */
export async function GET(request: NextRequest) {
  try {
    // Note: We allow getting folders even when VectorDB is disabled,
    // as folders can be in "files-only" mode

    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get("characterId");

    const folders = characterId
      ? await getSyncFolders(characterId)
      : await (await import("@/lib/vectordb/sync-service")).getAllSyncFolders();

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("[VectorSync] Error getting folders:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get folders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vector-sync
 * Add a new sync folder or trigger sync
 */
export async function POST(request: NextRequest) {
  try {
    // Note: We allow sync operations even when VectorDB is disabled,
    // as folders can be in "files-only" mode

    const body = await request.json();
    const { action } = body;

    if (action === "add") {
      const {
        characterId,
        folderPath,
        displayName,
        recursive,
        includeExtensions,
        excludePatterns,
        indexingMode,
        autoSync,
        syncMode,
        syncCadenceMinutes,
        fileTypeFilters,
        maxFileSizeBytes,
        chunkPreset,
        chunkSizeOverride,
        chunkOverlapOverride,
        reindexPolicy,
        dryRun,
      } = body;

      if (!characterId || !folderPath) {
        return NextResponse.json(
          { error: "characterId and folderPath are required" },
          { status: 400 }
        );
      }

      if (indexingMode !== undefined && !isValidEnum(indexingMode, VALID_INDEXING_MODES)) {
        return NextResponse.json({ error: "Invalid indexingMode" }, { status: 400 });
      }
      if (syncMode !== undefined && !isValidEnum(syncMode, VALID_SYNC_MODES)) {
        return NextResponse.json({ error: "Invalid syncMode" }, { status: 400 });
      }
      if (chunkPreset !== undefined && !isValidEnum(chunkPreset, VALID_CHUNK_PRESETS)) {
        return NextResponse.json({ error: "Invalid chunkPreset" }, { status: 400 });
      }
      if (reindexPolicy !== undefined && !isValidEnum(reindexPolicy, VALID_REINDEX_POLICIES)) {
        return NextResponse.json({ error: "Invalid reindexPolicy" }, { status: 400 });
      }

      const normalizedCadence = normalizePositiveInt(syncCadenceMinutes);
      if (syncCadenceMinutes !== undefined && normalizedCadence === undefined) {
        return NextResponse.json({ error: "syncCadenceMinutes must be a positive number" }, { status: 400 });
      }
      const normalizedMaxFileSize = normalizePositiveInt(maxFileSizeBytes);
      if (maxFileSizeBytes !== undefined && normalizedMaxFileSize === undefined) {
        return NextResponse.json({ error: "maxFileSizeBytes must be a positive number" }, { status: 400 });
      }
      const normalizedChunkSize = normalizePositiveInt(chunkSizeOverride);
      if (chunkSizeOverride !== undefined && normalizedChunkSize === undefined) {
        return NextResponse.json({ error: "chunkSizeOverride must be a positive number" }, { status: 400 });
      }
      const normalizedChunkOverlap = normalizePositiveInt(chunkOverlapOverride);
      if (chunkOverlapOverride !== undefined && normalizedChunkOverlap === undefined) {
        return NextResponse.json({ error: "chunkOverlapOverride must be a positive number" }, { status: 400 });
      }
      if (chunkPreset === "custom" && (!normalizedChunkSize || normalizedChunkOverlap === undefined)) {
        return NextResponse.json({ error: "custom chunkPreset requires chunkSizeOverride and chunkOverlapOverride" }, { status: 400 });
      }

      const normalizedIncludeExtensions = normalizeOptionalStringArray(includeExtensions);
      if (includeExtensions !== undefined && !normalizedIncludeExtensions) {
        return NextResponse.json({ error: "includeExtensions must be an array of strings" }, { status: 400 });
      }
      const normalizedExcludePatterns = normalizeOptionalStringArray(excludePatterns);
      if (excludePatterns !== undefined && !normalizedExcludePatterns) {
        return NextResponse.json({ error: "excludePatterns must be an array of strings" }, { status: 400 });
      }
      const normalizedFileTypeFilters = normalizeOptionalStringArray(fileTypeFilters);
      if (fileTypeFilters !== undefined && !normalizedFileTypeFilters) {
        return NextResponse.json({ error: "fileTypeFilters must be an array of strings" }, { status: 400 });
      }

      const effectiveSyncMode = syncMode ?? "auto";

      if (dryRun === true) {
        return NextResponse.json({
          success: true,
          dryRun: true,
          validated: {
            characterId,
            folderPath,
            indexingMode: indexingMode ?? "auto",
            syncMode: effectiveSyncMode,
            syncCadenceMinutes: normalizedCadence ?? 60,
            maxFileSizeBytes: normalizedMaxFileSize ?? 10 * 1024 * 1024,
            chunkPreset: chunkPreset ?? "balanced",
            reindexPolicy: reindexPolicy ?? "smart",
          },
        });
      }

      const userId = getSetting("localUserId");
      const folderId = await addSyncFolder({
        userId,
        characterId,
        folderPath,
        displayName,
        recursive: recursive ?? true,
        includeExtensions: normalizedIncludeExtensions ?? [".txt", ".md", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css"],
        excludePatterns: normalizedExcludePatterns ?? DEFAULT_IGNORE_PATTERNS,
        indexingMode: indexingMode ?? "auto",
        syncMode: effectiveSyncMode,
        syncCadenceMinutes: normalizedCadence ?? 60,
        fileTypeFilters: normalizedFileTypeFilters ?? [],
        maxFileSizeBytes: normalizedMaxFileSize ?? 10 * 1024 * 1024,
        chunkPreset: chunkPreset ?? "balanced",
        chunkSizeOverride: normalizedChunkSize,
        chunkOverlapOverride: normalizedChunkOverlap,
        reindexPolicy: reindexPolicy ?? "smart",
      });

      // Auto-trigger sync only for auto mode unless explicitly disabled.
      const shouldStartAutoSync = autoSync !== false && effectiveSyncMode === "auto";
      if (shouldStartAutoSync) {
        syncFolder(folderId, {}, false, "auto").catch(err => {
          console.error(`[VectorSync] Background sync failed for folder ${folderId}:`, err);
        });
      }

      return NextResponse.json({ folderId, success: true, syncStarted: shouldStartAutoSync });
    }

    if (action === "sync") {
      const { folderId, characterId } = body;

      if (folderId) {
        const result = await syncFolder(folderId, {}, false, "manual");
        return NextResponse.json({ result, success: true });
      }

      if (characterId) {
        const results = await syncAllFolders(characterId, {}, false, "manual");
        return NextResponse.json({ results, success: true });
      }

      return NextResponse.json(
        { error: "folderId or characterId is required for sync" },
        { status: 400 }
      );
    }

    if (action === "reindex") {
      const { folderId, characterId } = body;

      if (characterId) {
        const results = await reindexAllFolders(characterId);
        return NextResponse.json({ results, success: true });
      }

      if (folderId) {
        const result = await syncFolder(folderId, {}, true, "manual");
        return NextResponse.json({ result, success: true });
      }

      return NextResponse.json(
        { error: "folderId or characterId is required for reindex" },
        { status: 400 }
      );
    }

    if (action === "reindex-all") {
      const results = await reindexAllCharacters();
      updateSetting("embeddingReindexRequired", false);
      return NextResponse.json({ results, success: true });
    }

    if (action === "cleanup") {
      // Force cleanup of all stuck syncing/pending folders
      const result = await forceCleanupStuckFolders();
      return NextResponse.json({
        success: true,
        syncingCleaned: result.syncingCleaned,
        pendingCleaned: result.pendingCleaned,
        message: `Cleaned ${result.syncingCleaned} syncing and ${result.pendingCleaned} pending folders`
      });
    }

    if (action === "cancel") {
      const { folderId } = body;
      if (!folderId) {
        return NextResponse.json(
          { error: "folderId is required for cancel" },
          { status: 400 }
        );
      }

      const cancelled = await cancelSyncById(folderId);
      return NextResponse.json({ success: true, cancelled });
    }

    if (action === "set-primary") {
      const { folderId, characterId } = body;
      if (!folderId || !characterId) {
        return NextResponse.json(
          { error: "folderId and characterId are required" },
          { status: 400 }
        );
      }

      await setPrimaryFolder(folderId, characterId);
      return NextResponse.json({ success: true });
    }

    if (action === "update") {
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
        dryRun,
      } = body;

      if (!folderId) {
        return NextResponse.json({ error: "folderId is required" }, { status: 400 });
      }

      if (indexingMode !== undefined && !isValidEnum(indexingMode, VALID_INDEXING_MODES)) {
        return NextResponse.json({ error: "Invalid indexingMode" }, { status: 400 });
      }
      if (syncMode !== undefined && !isValidEnum(syncMode, VALID_SYNC_MODES)) {
        return NextResponse.json({ error: "Invalid syncMode" }, { status: 400 });
      }
      if (chunkPreset !== undefined && !isValidEnum(chunkPreset, VALID_CHUNK_PRESETS)) {
        return NextResponse.json({ error: "Invalid chunkPreset" }, { status: 400 });
      }
      if (reindexPolicy !== undefined && !isValidEnum(reindexPolicy, VALID_REINDEX_POLICIES)) {
        return NextResponse.json({ error: "Invalid reindexPolicy" }, { status: 400 });
      }

      const normalizedIncludeExtensions = normalizeOptionalStringArray(includeExtensions);
      if (includeExtensions !== undefined && !normalizedIncludeExtensions) {
        return NextResponse.json({ error: "includeExtensions must be an array of strings" }, { status: 400 });
      }
      const normalizedExcludePatterns = normalizeOptionalStringArray(excludePatterns);
      if (excludePatterns !== undefined && !normalizedExcludePatterns) {
        return NextResponse.json({ error: "excludePatterns must be an array of strings" }, { status: 400 });
      }
      const normalizedFileTypeFilters = normalizeOptionalStringArray(fileTypeFilters);
      if (fileTypeFilters !== undefined && !normalizedFileTypeFilters) {
        return NextResponse.json({ error: "fileTypeFilters must be an array of strings" }, { status: 400 });
      }

      const normalizedCadence = normalizePositiveInt(syncCadenceMinutes);
      if (syncCadenceMinutes !== undefined && normalizedCadence === undefined) {
        return NextResponse.json({ error: "syncCadenceMinutes must be a positive number" }, { status: 400 });
      }
      const normalizedMaxFileSize = normalizePositiveInt(maxFileSizeBytes);
      if (maxFileSizeBytes !== undefined && normalizedMaxFileSize === undefined) {
        return NextResponse.json({ error: "maxFileSizeBytes must be a positive number" }, { status: 400 });
      }
      const normalizedChunkSize = normalizePositiveInt(chunkSizeOverride);
      if (chunkSizeOverride !== undefined && normalizedChunkSize === undefined) {
        return NextResponse.json({ error: "chunkSizeOverride must be a positive number" }, { status: 400 });
      }
      const normalizedChunkOverlap = normalizePositiveInt(chunkOverlapOverride);
      if (chunkOverlapOverride !== undefined && normalizedChunkOverlap === undefined) {
        return NextResponse.json({ error: "chunkOverlapOverride must be a positive number" }, { status: 400 });
      }
      if (chunkPreset === "custom" && (!normalizedChunkSize || normalizedChunkOverlap === undefined)) {
        return NextResponse.json({ error: "custom chunkPreset requires chunkSizeOverride and chunkOverlapOverride" }, { status: 400 });
      }

      if (dryRun === true) {
        return NextResponse.json({ success: true, dryRun: true });
      }

      await updateSyncFolderSettings({
        folderId,
        displayName,
        recursive,
        includeExtensions: normalizedIncludeExtensions,
        excludePatterns: normalizedExcludePatterns,
        indexingMode,
        syncMode,
        syncCadenceMinutes: normalizedCadence,
        fileTypeFilters: normalizedFileTypeFilters,
        maxFileSizeBytes: normalizedMaxFileSize,
        chunkPreset,
        chunkSizeOverride: chunkSizeOverride === null ? null : normalizedChunkSize,
        chunkOverlapOverride: chunkOverlapOverride === null ? null : normalizedChunkOverlap,
        reindexPolicy,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'add', 'sync', 'reindex', 'reindex-all', or 'cleanup'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[VectorSync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vector-sync?folderId=xxx
 * Remove a sync folder
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required" },
        { status: 400 }
      );
    }

    await removeSyncFolder(folderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[VectorSync] Error removing folder:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove folder" },
      { status: 500 }
    );
  }
}
