/**
 * Schedule task helpers
 *
 * Kept separate from the DB/tool implementation so we can unit test
 * timestamp parsing/validation deterministically.
 */

import { DateTime } from "luxon";
import { isValidTimezone, normalizeTimezone } from "@/lib/utils/timezone";

const SIMPLE_DATETIME_WITH_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

function hasExplicitTimezone(value: string): boolean {
  // ISO with trailing Z or an explicit offset (+01:00 / -0500)
  return /[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value);
}

function normalizeToIsoLike(value: string): string {
  const trimmed = value.trim();

  // Common LLM output: "YYYY-MM-DD HH:mm" (space) -> ISO-like
  if (SIMPLE_DATETIME_WITH_SPACE.test(trimmed)) {
    return trimmed.replace(" ", "T");
  }

  return trimmed;
}

export type ParseScheduledAtResult =
  | { ok: true; scheduledAtIsoUtc: string; interpretation: "explicit" | "in_timezone" }
  | { ok: false; error: string };

/**
 * Parse scheduledAt into a canonical UTC ISO string.
 *
 * Rules:
 * - If scheduledAt includes an explicit offset or Z, respect it (timezone param is ignored for interpretation).
 * - If scheduledAt is naive (no offset/Z), interpret it in the provided timezone.
 * - Only supports ISO-ish inputs; localized formats like "10.02.2026 10:00" are rejected.
 */
export function parseScheduledAtToUtcIso(
  scheduledAt: string,
  timezone: string
): ParseScheduledAtResult {
  if (!scheduledAt || scheduledAt.trim() === "") {
    return { ok: false, error: "scheduledAt is required" };
  }

  const normalized = normalizeToIsoLike(scheduledAt);
  const explicitTz = hasExplicitTimezone(normalized);

  const dt = explicitTz
    ? DateTime.fromISO(normalized, { setZone: true })
    : DateTime.fromISO(normalized, { zone: timezone });

  if (!dt.isValid) {
    // Keep the message actionable; users/LLMs should send ISO 8601.
    const reason = dt.invalidReason ? ` (${dt.invalidReason})` : "";
    return {
      ok: false,
      error: `Invalid scheduledAt timestamp "${scheduledAt}". Use ISO 8601 like "2026-01-29T10:00:00Z"${reason}`,
    };
  }

  const utcIso = new Date(dt.toUTC().toMillis()).toISOString();
  return {
    ok: true,
    scheduledAtIsoUtc: utcIso,
    interpretation: explicitTz ? "explicit" : "in_timezone",
  };
}

export function isScheduledAtInFutureUtc(
  scheduledAtIsoUtc: string,
  nowMs: number = Date.now()
): boolean {
  const ms = Date.parse(scheduledAtIsoUtc);
  if (!Number.isFinite(ms)) return false;
  return ms > nowMs;
}

export type ResolveTimezoneResult =
  | {
      ok: true;
      timezone: string;
      source: "input" | "session";
      note?: string;
    }
  | {
      ok: false;
      error: string;
      reason: "timezone_missing" | "timezone_invalid";
      diagnostics: {
        inputTimezone?: string;
        sessionTimezone?: string | null;
      };
    };

function normalizeSessionTimezoneValue(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("local::")) {
    const concrete = trimmed.slice("local::".length).trim();
    return concrete || null;
  }
  return trimmed;
}

export function resolveScheduleTimezone(args: {
  inputTimezone?: string;
  sessionTimezone?: string | null;
}): ResolveTimezoneResult {
  const rawInputTimezone = args.inputTimezone?.trim();
  const sessionTimezone = normalizeSessionTimezoneValue(args.sessionTimezone);

  if (rawInputTimezone) {
    if (rawInputTimezone.startsWith("local::")) {
      if (sessionTimezone && isValidTimezone(sessionTimezone)) {
        return {
          ok: true,
          timezone: sessionTimezone,
          source: "session",
          note: `Resolved local timezone from session metadata as "${sessionTimezone}"`,
        };
      }

      const concrete = rawInputTimezone.slice("local::".length).trim();
      if (concrete && isValidTimezone(concrete)) {
        return {
          ok: true,
          timezone: concrete,
          source: "input",
        };
      }

      return {
        ok: false,
        error: "Timezone is required. Could not resolve local timezone from this session.",
        reason: "timezone_missing",
        diagnostics: {
          inputTimezone: rawInputTimezone,
          sessionTimezone,
        },
      };
    }

    const normalized = normalizeTimezone(rawInputTimezone);
    if (!isValidTimezone(normalized.timezone)) {
      return {
        ok: false,
        error:
          `Invalid timezone "${rawInputTimezone}". Use an IANA timezone like ` +
          `"Europe/Berlin" or "America/New_York".`,
        reason: "timezone_invalid",
        diagnostics: {
          inputTimezone: rawInputTimezone,
          sessionTimezone,
        },
      };
    }

    return {
      ok: true,
      timezone: normalized.timezone,
      source: "input",
      note: normalized.normalized ? normalized.warning : undefined,
    };
  }

  if (sessionTimezone && isValidTimezone(sessionTimezone)) {
    return {
      ok: true,
      timezone: sessionTimezone,
      source: "session",
      note: `No timezone was supplied; resolved from session metadata ("${sessionTimezone}").`,
    };
  }

  return {
    ok: false,
    error: "Timezone is required. Please provide an IANA timezone (for example: Europe/Berlin).",
    reason: "timezone_missing",
    diagnostics: {
      inputTimezone: rawInputTimezone,
      sessionTimezone,
    },
  };
}

export function isMinutePrecisionMatchUtc(aIsoUtc: string, bIsoUtc: string): boolean {
  const aMs = Date.parse(aIsoUtc);
  const bMs = Date.parse(bIsoUtc);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return Math.floor(aMs / 60_000) === Math.floor(bMs / 60_000);
}
