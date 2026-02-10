/**
 * Timezone Utilities
 * 
 * Shared utilities for timezone parsing, normalization, and resolution.
 * Can be used by both client and server code.
 */

/**
 * Common timezone aliases that are NOT valid IANA zone names.
 * Maps abbreviations / offset strings to the best IANA equivalent.
 * 
 * NOTE: Some abbreviations are ambiguous (e.g., "CST" can be US Central
 * or China Standard). We pick the most common English-speaking mapping.
 * The agent prompt should encourage users to confirm their city.
 */
const TIMEZONE_ALIASES: Record<string, string> = {
  // Offset-style strings (GMT+N / UTC+N)
  "gmt+0": "Europe/London",
  "gmt+1": "Europe/Berlin",
  "gmt+2": "Europe/Helsinki",
  "gmt+3": "Europe/Istanbul",
  "gmt+4": "Asia/Dubai",
  "gmt+5": "Asia/Karachi",
  "gmt+5:30": "Asia/Kolkata",
  "gmt+6": "Asia/Dhaka",
  "gmt+7": "Asia/Bangkok",
  "gmt+8": "Asia/Shanghai",
  "gmt+9": "Asia/Tokyo",
  "gmt+10": "Australia/Sydney",
  "gmt+11": "Pacific/Noumea",
  "gmt+12": "Pacific/Auckland",
  "gmt-1": "Atlantic/Azores",
  "gmt-2": "Atlantic/South_Georgia",
  "gmt-3": "America/Sao_Paulo",
  "gmt-4": "America/Halifax",
  "gmt-5": "America/New_York",
  "gmt-6": "America/Chicago",
  "gmt-7": "America/Denver",
  "gmt-8": "America/Los_Angeles",
  "gmt-9": "America/Anchorage",
  "gmt-10": "Pacific/Honolulu",
  // Common abbreviations
  "cet": "Europe/Berlin",
  "cest": "Europe/Berlin",
  "eet": "Europe/Helsinki",
  "eest": "Europe/Helsinki",
  "wet": "Europe/Lisbon",
  "west": "Europe/Lisbon",
  "gmt": "Europe/London",
  "utc": "UTC",
  "est": "America/New_York",
  "edt": "America/New_York",
  "cst": "America/Chicago",
  "cdt": "America/Chicago",
  "mst": "America/Denver",
  "mdt": "America/Denver",
  "pst": "America/Los_Angeles",
  "pdt": "America/Los_Angeles",
  "ist": "Asia/Kolkata",
  "jst": "Asia/Tokyo",
  "kst": "Asia/Seoul",
  "aest": "Australia/Sydney",
  "aedt": "Australia/Sydney",
  "nzst": "Pacific/Auckland",
  "nzdt": "Pacific/Auckland",
  "hkt": "Asia/Hong_Kong",
  "sgt": "Asia/Singapore",
  "trt": "Europe/Istanbul",
  "msk": "Europe/Moscow",
};

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

/**
 * Normalize a user-provided timezone string to a valid IANA timezone.
 * 
 * Handles common formats that the `cron` library would reject:
 * - "GMT+1" / "UTC+1" → "Europe/Berlin"
 * - "CET" / "EST" / "PST" → IANA equivalent
 * - "Etc/GMT+1" → corrects sign reversal pitfall
 * - Already-valid IANA strings pass through unchanged
 * 
 * @returns { timezone: string; normalized: boolean; warning?: string }
 */
export function normalizeTimezone(input: string): {
  timezone: string;
  normalized: boolean;
  warning?: string;
} {
  if (!input || input.trim() === "") {
    return { timezone: "UTC", normalized: true, warning: "Empty timezone, defaulting to UTC" };
  }

  const trimmed = input.trim();

  // 1. If it's already a valid IANA timezone, use it directly
  if (isValidTimezone(trimmed)) {
    return { timezone: trimmed, normalized: false };
  }

  // 2. Normalize to lowercase for alias lookup
  const lower = trimmed.toLowerCase().replace(/\s+/g, "");

  // 3. Handle "UTC+N" / "UTC-N" by converting to "GMT+N" / "GMT-N" for alias lookup
  const utcNormalized = lower.replace(/^utc([+-])/, "gmt$1");

  // 4. Check alias map
  if (TIMEZONE_ALIASES[utcNormalized]) {
    return {
      timezone: TIMEZONE_ALIASES[utcNormalized],
      normalized: true,
      warning: `Converted "${input}" to IANA timezone "${TIMEZONE_ALIASES[utcNormalized]}"`,
    };
  }

  // 5. Handle "Etc/GMT+N" pitfall (sign is reversed in Etc/ zones)
  if (lower.startsWith("etc/gmt")) {
    // Extract the offset and reverse sign for alias lookup
    const match = lower.match(/^etc\/gmt([+-])(\d+)$/);
    if (match) {
      const reversedSign = match[1] === "+" ? "-" : "+";
      const aliasKey = `gmt${reversedSign}${match[2]}`;
      if (TIMEZONE_ALIASES[aliasKey]) {
        return {
          timezone: TIMEZONE_ALIASES[aliasKey],
          normalized: true,
          warning: `Converted "${input}" (Etc/ zones have reversed signs) to "${TIMEZONE_ALIASES[aliasKey]}"`,
        };
      }
    }
  }

  // 6. Try to extract a city name and find a matching IANA zone
  //    e.g., "Berlin" → "Europe/Berlin", "Tokyo" → "Asia/Tokyo"
  const cityMatch = tryMatchCity(trimmed);
  if (cityMatch) {
    return {
      timezone: cityMatch,
      normalized: true,
      warning: `Matched city "${input}" to IANA timezone "${cityMatch}"`,
    };
  }

  // 7. Couldn't normalize — return as-is with a warning
  return {
    timezone: trimmed,
    normalized: false,
    warning: `Could not normalize timezone "${input}". Please use an IANA timezone like "Europe/Berlin" or "America/New_York".`,
  };
}

/**
 * Try to match a bare city name to an IANA timezone.
 * Searches known IANA zones for a city suffix match.
 */
function tryMatchCity(input: string): string | null {
  const normalized = input.toLowerCase().replace(/\s+/g, "_");

  // Common IANA zones to search through (covers major cities)
  const COMMON_ZONES = [
    "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Rome",
    "Europe/Madrid", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna",
    "Europe/Zurich", "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen",
    "Europe/Helsinki", "Europe/Warsaw", "Europe/Prague", "Europe/Budapest",
    "Europe/Bucharest", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow",
    "Europe/Kiev", "Europe/Lisbon", "Europe/Dublin",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Toronto", "America/Vancouver", "America/Mexico_City",
    "America/Sao_Paulo", "America/Buenos_Aires", "America/Bogota",
    "America/Lima", "America/Santiago", "America/Anchorage",
    "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore",
    "Asia/Seoul", "Asia/Taipei", "Asia/Bangkok", "Asia/Jakarta",
    "Asia/Kolkata", "Asia/Mumbai", "Asia/Dubai", "Asia/Riyadh",
    "Asia/Karachi", "Asia/Dhaka", "Asia/Kuala_Lumpur",
    "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
    "Australia/Perth", "Australia/Adelaide",
    "Pacific/Auckland", "Pacific/Honolulu", "Pacific/Fiji",
    "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  ];

  for (const zone of COMMON_ZONES) {
    const city = zone.split("/").pop()?.toLowerCase() || "";
    if (city === normalized) {
      return zone;
    }
  }

  return null;
}

