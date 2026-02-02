/**
 * Timestamp Utility Layer
 *
 * Provides consistent timestamp handling across all background task types.
 * Handles both legacy SQLite datetime format and ISO 8601 during migration.
 */

const LEGACY_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Get current timestamp in standardized ISO 8601 format.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Normalize any timestamp to ISO 8601 format.
 * Handles both legacy SQLite datetime and ISO 8601 inputs.
 */
export function normalizeTimestamp(
  timestamp: string | Date | null | undefined
): string | null {
  if (!timestamp) return null;

  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (timestamp.includes("T") && timestamp.endsWith("Z")) {
    return timestamp;
  }

  if (LEGACY_DATETIME_REGEX.test(timestamp)) {
    return `${timestamp.replace(" ", "T")}.000Z`;
  }

  try {
    return new Date(timestamp).toISOString();
  } catch {
    console.warn(`[Timestamp] Failed to normalize: ${timestamp}`);
    return null;
  }
}

/**
 * Parse timestamp to milliseconds for comparison.
 */
export function parseTimestampMs(timestamp: string | null | undefined): number {
  if (!timestamp) return 0;

  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return 0;

  return new Date(normalized).getTime();
}

/**
 * Check if a timestamp is stale (older than threshold).
 */
export function isStale(
  timestamp: string | null | undefined,
  thresholdMs: number
): boolean {
  const startedMs = parseTimestampMs(timestamp);
  if (startedMs === 0) return true;

  return Date.now() - startedMs > thresholdMs;
}

/**
 * Calculate duration in milliseconds between two timestamps.
 */
export function durationMs(
  startTimestamp: string | null | undefined,
  endTimestamp?: string | null
): number {
  const startMs = parseTimestampMs(startTimestamp);
  const endMs = endTimestamp ? parseTimestampMs(endTimestamp) : Date.now();

  if (startMs === 0) return 0;
  return Math.max(0, endMs - startMs);
}

/**
 * Format duration for display (e.g., "2m 30s").
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
