/**
 * Observability Cleanup Job
 * 
 * Background job to clean up stale agent runs that were never completed.
 * Runs periodically to mark orphaned "running" runs as failed.
 */

import { hasPendingInteractiveWait } from "@/lib/interactive-tool-bridge";
import { findStaleRuns, markRunAsTimedOut } from "./queries";

// Default cleanup interval: 15 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Stale threshold: 30 minutes
const STALE_THRESHOLD_MINUTES = 30;

let cleanupIntervalId: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Run cleanup and log results
 */
async function runCleanup(): Promise<void> {
  if (isRunning) {
    console.log("[ObservabilityCleanup] Cleanup already running, skipping");
    return;
  }

  isRunning = true;
  console.log("[ObservabilityCleanup] Starting stale run cleanup...");

  try {
    const staleRuns = await findStaleRuns(STALE_THRESHOLD_MINUTES);
    const runIds: string[] = [];

    for (const run of staleRuns) {
      if (hasPendingInteractiveWait(run.sessionId)) {
        continue;
      }
      await markRunAsTimedOut(run.id, "background_cleanup");
      runIds.push(run.id);
    }

    if (runIds.length > 0) {
      console.log(
        `[ObservabilityCleanup] Cleaned ${runIds.length} stale runs:`,
        runIds,
      );
    } else {
      console.log("[ObservabilityCleanup] No stale runs found");
    }
  } catch (error) {
    console.error("[ObservabilityCleanup] Error during cleanup:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the cleanup job scheduler
 */
export function startCleanupJob(intervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS): void {
  if (cleanupIntervalId) {
    console.log("[ObservabilityCleanup] Cleanup job already running");
    return;
  }

  console.log(
    `[ObservabilityCleanup] Starting cleanup job (interval: ${intervalMs / 60000}m, threshold: ${STALE_THRESHOLD_MINUTES}m)`
  );

  // Run immediately on start
  runCleanup().catch(console.error);

  // Schedule periodic cleanup
  cleanupIntervalId = setInterval(runCleanup, intervalMs);
}

/**
 * Stop the cleanup job scheduler
 */
export function stopCleanupJob(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log("[ObservabilityCleanup] Cleanup job stopped");
  }
}

