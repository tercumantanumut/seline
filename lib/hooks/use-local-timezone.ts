"use client";

/**
 * Hook to detect and cache local timezone
 *
 * Key behaviors:
 * - Detects on mount using Intl API
 * - Caches in state to avoid repeated calls
 * - Returns null during SSR (no window)
 * - Provides formatted display string
 */

import { useState, useEffect, useMemo } from "react";
import { formatTimezoneDisplay } from "@/lib/utils/timezone";

// Re-export utilities from shared module for backward compatibility
export {
  formatTimezoneDisplay,
  parseTimezoneValue,
  resolveTimezone,
  isValidTimezone,
} from "@/lib/utils/timezone";

interface UseLocalTimezoneResult {
  /** Detected timezone IANA name, e.g., "Europe/Istanbul" */
  timezone: string | null;
  /** Whether timezone has been detected (false during SSR) */
  isDetected: boolean;
  /** Formatted display name, e.g., "Istanbul (GMT+3)" */
  displayName: string | null;
  /** Value to store when user selects local timezone, e.g., "local::Europe/Istanbul" */
  localValue: string | null;
}

export function useLocalTimezone(): UseLocalTimezoneResult {
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    // Only runs client-side
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(detected);
    } catch {
      // Fallback if Intl API is not available (very rare)
      setTimezone(null);
    }
  }, []);

  const displayName = useMemo(
    () => (timezone ? formatTimezoneDisplay(timezone) : null),
    [timezone]
  );

  const localValue = useMemo(
    () => (timezone ? `local::${timezone}` : null),
    [timezone]
  );

  return {
    timezone, // "Europe/Istanbul"
    isDetected: timezone !== null,
    displayName, // "Istanbul (GMT+3)"
    localValue, // "local::Europe/Istanbul"
  };
}

