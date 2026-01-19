/**
 * Timezone Utilities
 * 
 * Shared utilities for timezone parsing and resolution.
 * Can be used by both client and server code.
 */

/**
 * Format timezone for display
 * @example formatTimezoneDisplay("Europe/Istanbul") -> "Istanbul (GMT+3)"
 */
export function formatTimezoneDisplay(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset", // "GMT+3"
    });

    const parts = formatter.formatToParts(now);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;

    return `${city} (${offset})`; // "Istanbul (GMT+3)"
  } catch {
    // Fallback for invalid timezones
    return tz;
  }
}

/**
 * Parse a stored timezone value
 * @example parseTimezoneValue("local::Europe/Istanbul") -> { isLocal: true, timezone: "Europe/Istanbul" }
 * @example parseTimezoneValue("America/New_York") -> { isLocal: false, timezone: "America/New_York" }
 */
export function parseTimezoneValue(value: string): {
  isLocal: boolean;
  timezone: string;
} {
  if (value.startsWith("local::")) {
    return {
      isLocal: true,
      timezone: value.replace("local::", ""),
    };
  }
  return {
    isLocal: false,
    timezone: value,
  };
}

/**
 * Resolve timezone for server-side execution
 * Strips "local::" prefix to get concrete timezone
 * @example resolveTimezone("local::America/New_York") -> "America/New_York"
 * @example resolveTimezone("Europe/London") -> "Europe/London"
 */
export function resolveTimezone(storedValue: string): string {
  if (storedValue.startsWith("local::")) {
    return storedValue.replace("local::", "");
  }
  return storedValue;
}

/**
 * Check if a timezone string is valid
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

