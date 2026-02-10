/**
 * Schedule task helpers
 *
 * Kept separate from the DB/tool implementation so we can unit test
 * timestamp parsing/validation deterministically.
 */

import { DateTime } from "luxon";

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
