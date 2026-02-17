import { isVectorDBEnabled } from "./client";

export type SyncMode = "auto" | "manual" | "scheduled" | "triggered";
export type ReindexPolicy = "smart" | "always" | "never";
export type ChunkPreset = "balanced" | "small" | "large" | "custom";
export type SyncExecutionTrigger = "manual" | "scheduled" | "triggered" | "auto";

export interface FolderSyncRuntimeSettings {
  indexingMode?: "files-only" | "full" | "auto" | null;
  syncMode?: SyncMode | null;
  syncCadenceMinutes?: number | null;
  maxFileSizeBytes?: number | null;
  chunkPreset?: ChunkPreset | null;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  reindexPolicy?: ReindexPolicy | null;
}

export interface ResolvedFolderSyncBehavior {
  syncMode: SyncMode;
  syncCadenceMinutes: number;
  shouldCreateEmbeddings: boolean;
  allowsWatcherEvents: boolean;
  allowsScheduledRuns: boolean;
  allowsAutomaticAddSync: boolean;
  maxFileSizeBytes: number;
  chunkPreset: ChunkPreset;
  chunkSizeOverride: number | null;
  chunkOverlapOverride: number | null;
  reindexPolicy: ReindexPolicy;
}

export const DEFAULT_SYNC_MODE: SyncMode = "auto";
export const DEFAULT_SYNC_CADENCE_MINUTES = 60;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_CHUNK_PRESET: ChunkPreset = "balanced";
export const DEFAULT_REINDEX_POLICY: ReindexPolicy = "smart";

const MIN_SYNC_CADENCE_MINUTES = 5;

export function normalizeSyncMode(value: unknown): SyncMode {
  if (value === "manual" || value === "scheduled" || value === "triggered" || value === "auto") {
    return value;
  }
  return DEFAULT_SYNC_MODE;
}

export function normalizeReindexPolicy(value: unknown): ReindexPolicy {
  if (value === "always" || value === "never" || value === "smart") {
    return value;
  }
  return DEFAULT_REINDEX_POLICY;
}

export function normalizeChunkPreset(value: unknown): ChunkPreset {
  if (value === "small" || value === "large" || value === "custom" || value === "balanced") {
    return value;
  }
  return DEFAULT_CHUNK_PRESET;
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized <= 0) return null;
  return normalized;
}

export function resolveFolderSyncBehavior(
  settings: FolderSyncRuntimeSettings,
  vectorEnabled: boolean = isVectorDBEnabled()
): ResolvedFolderSyncBehavior {
  const syncMode = normalizeSyncMode(settings.syncMode);
  const indexingMode = settings.indexingMode ?? "auto";

  const shouldCreateEmbeddings =
    indexingMode === "full" ||
    (indexingMode === "auto" && vectorEnabled);

  const requestedCadence = normalizePositiveInt(settings.syncCadenceMinutes);
  const syncCadenceMinutes = Math.max(
    requestedCadence ?? DEFAULT_SYNC_CADENCE_MINUTES,
    MIN_SYNC_CADENCE_MINUTES
  );

  const maxFileSizeBytes = normalizePositiveInt(settings.maxFileSizeBytes) ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  const chunkPreset = normalizeChunkPreset(settings.chunkPreset);
  const chunkSizeOverride = normalizePositiveInt(settings.chunkSizeOverride);
  const chunkOverlapOverride = normalizePositiveInt(settings.chunkOverlapOverride);

  const reindexPolicy = normalizeReindexPolicy(settings.reindexPolicy);

  return {
    syncMode,
    syncCadenceMinutes,
    shouldCreateEmbeddings,
    allowsWatcherEvents: syncMode === "auto" || syncMode === "triggered",
    allowsScheduledRuns: syncMode === "auto" || syncMode === "scheduled",
    allowsAutomaticAddSync: syncMode === "auto",
    maxFileSizeBytes,
    chunkPreset,
    chunkSizeOverride,
    chunkOverlapOverride,
    reindexPolicy,
  };
}

export function shouldRunForTrigger(
  behavior: ResolvedFolderSyncBehavior,
  trigger: SyncExecutionTrigger
): boolean {
  if (trigger === "manual") return true;
  if (trigger === "auto") return behavior.allowsAutomaticAddSync;
  if (trigger === "triggered") return behavior.allowsWatcherEvents;
  if (trigger === "scheduled") return behavior.allowsScheduledRuns;
  return false;
}

export function resolveChunkingOverrides(behavior: ResolvedFolderSyncBehavior): {
  chunkSize: number;
  chunkOverlap: number;
  useOverrides: boolean;
} {
  if (behavior.chunkPreset === "small") {
    return { chunkSize: 900, chunkOverlap: 180, useOverrides: true };
  }
  if (behavior.chunkPreset === "large") {
    return { chunkSize: 2200, chunkOverlap: 300, useOverrides: true };
  }
  if (behavior.chunkPreset === "custom") {
    if (behavior.chunkSizeOverride && behavior.chunkOverlapOverride) {
      return {
        chunkSize: behavior.chunkSizeOverride,
        chunkOverlap: Math.min(behavior.chunkOverlapOverride, Math.max(1, behavior.chunkSizeOverride - 1)),
        useOverrides: true,
      };
    }
  }

  // balanced uses global defaults from current vector-search config
  return { chunkSize: 0, chunkOverlap: 0, useOverrides: false };
}
