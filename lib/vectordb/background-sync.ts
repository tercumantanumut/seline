/**
 * Background Sync Scheduler
 * 
 * Provides periodic background synchronization for vector search folders.
 * Runs in the background without blocking the UI.
 */

import { getSetting } from "@/lib/settings/settings-manager";
import { syncStaleFolders, restartAllWatchers, recoverStuckSyncingFolders, getAllSyncFolders } from "./sync-service";
import { isVectorDBEnabled } from "./client";
import { isDangerousPath } from "./dangerous-paths";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders } from "@/lib/db/sqlite-character-schema";
import { eq } from "drizzle-orm";

// Default sync interval: 1 hour
const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000;

// Minimum sync interval: 5 minutes
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Global state that persists across hot reloads (dev mode)
const globalForSync = globalThis as unknown as {
  vectorSyncIntervalId?: NodeJS.Timeout | null;
  vectorSyncInitialized?: boolean;
};

// Scheduler state
let syncIntervalId: NodeJS.Timeout | null = globalForSync.vectorSyncIntervalId ?? null;
let isInitialized = globalForSync.vectorSyncInitialized ?? false;

/**
 * Get the configured sync interval from settings
 */
function getSyncIntervalMs(): number {
  try {
    const intervalMinutes = getSetting("vectorSyncIntervalMinutes");
    if (typeof intervalMinutes === "number" && intervalMinutes > 0) {
      return Math.max(intervalMinutes * 60 * 1000, MIN_SYNC_INTERVAL_MS);
    }
  } catch {
    // Setting doesn't exist yet, use default
  }
  return DEFAULT_SYNC_INTERVAL_MS;
}

/**
 * Check if auto-sync is enabled
 */
function isAutoSyncEnabled(): boolean {
  try {
    const enabled = getSetting("vectorAutoSyncEnabled");
    return enabled !== false; // Default to true if not set
  } catch {
    return true; // Default to enabled
  }
}

/**
 * Run the background sync task
 */
async function runBackgroundSync(): Promise<void> {
  // Note: We allow syncing even when VectorDB is disabled, as folders can be in "files-only" mode
  // Each folder's indexing mode will be checked during sync

  if (!isAutoSyncEnabled()) {
    console.log("[BackgroundSync] Auto-sync disabled, skipping");
    return;
  }

  console.log("[BackgroundSync] Starting periodic background sync...");
  
  try {
    const results = await syncStaleFolders();
    const totalIndexed = results.reduce((sum, r) => sum + r.filesIndexed, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    
    if (results.length > 0) {
      console.log(`[BackgroundSync] Synced ${results.length} folders, indexed ${totalIndexed} files, ${totalErrors} errors`);
    } else {
      console.log("[BackgroundSync] No stale folders to sync");
    }
  } catch (error) {
    console.error("[BackgroundSync] Error during background sync:", error);
  }
}

/**
 * Start the background sync scheduler
 */
export function startBackgroundSync(): void {
  if (syncIntervalId) {
    console.log("[BackgroundSync] Scheduler already running");
    return;
  }

  const intervalMs = getSyncIntervalMs();
  console.log(`[BackgroundSync] Starting scheduler with interval: ${intervalMs / 60000} minutes`);

  // Run sync periodically
  syncIntervalId = setInterval(() => {
    runBackgroundSync().catch(err => {
      console.error("[BackgroundSync] Unhandled error in background sync:", err);
    });
  }, intervalMs);
  globalForSync.vectorSyncIntervalId = syncIntervalId;
}

/**
 * Stop the background sync scheduler
 */
export function stopBackgroundSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    globalForSync.vectorSyncIntervalId = null;
    console.log("[BackgroundSync] Scheduler stopped");
  }
}

/**
 * Initialize the vector sync system on app startup
 * - Restarts file watchers for all synced folders
 * - Syncs any stale folders
 * - Starts the background sync scheduler
 */
export async function initializeVectorSync(): Promise<void> {
  if (isInitialized) {
    console.log("[BackgroundSync] Already initialized");
    return;
  }

  // Note: We allow initialization even when VectorDB is disabled, as folders can be in "files-only" mode
  // Each folder's indexing mode will be checked during sync/watch

  console.log("[BackgroundSync] Initializing vector sync system...");
  isInitialized = true;
  globalForSync.vectorSyncInitialized = true;

  try {
    // 0. Clean up any existing watchers from previous hot reloads (dev mode)
    const { stopAllWatchers } = await import("./file-watcher");
    await stopAllWatchers();
    console.log("[BackgroundSync] Cleaned up existing watchers");

    // 1. Recover any folders stuck in "syncing" status from previous crashes
    await recoverStuckSyncingFolders();

    // 1b. Mark any folders with dangerous paths as errored so we never
    //     try to watch them (one-time cleanup for folders added before
    //     the path-validation guard was introduced).
    const allFolders = await getAllSyncFolders();
    for (const folder of allFolders) {
      const dangerError = isDangerousPath(folder.folderPath);
      if (dangerError && folder.status !== "error") {
        console.warn(
          `[BackgroundSync] Marking folder "${folder.folderPath}" as errored on startup: ${dangerError}`
        );
        await db
          .update(agentSyncFolders)
          .set({
            status: "error",
            lastError: dangerError,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(agentSyncFolders.id, folder.id));
      }
    }

    // 2. Restart file watchers for all synced folders
    await restartAllWatchers();

    // 3. Sync any stale or pending folders (async, don't block startup)
    syncStaleFolders().catch(err => {
      console.error("[BackgroundSync] Error syncing stale/pending folders on startup:", err);
    });

    // 4. Start the background sync scheduler
    if (isAutoSyncEnabled()) {
      startBackgroundSync();
    }

    console.log("[BackgroundSync] Vector sync system initialized");
  } catch (error) {
    console.error("[BackgroundSync] Error initializing vector sync:", error);
  }
}

/**
 * Check if the sync system is initialized
 */
export function isVectorSyncInitialized(): boolean {
  return isInitialized;
}

