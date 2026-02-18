import { describe, it, expect, vi } from "vitest";
import {
  parseScheduledAtToUtcIso,
  isScheduledAtInFutureUtc,
  isMinutePrecisionMatchUtc,
  resolveScheduleTimezone,
} from "@/lib/ai/tools/schedule-task-helpers";

describe("schedule-task-helpers", () => {
  it("parses explicit UTC Z timestamps and keeps instant", () => {
    const res = parseScheduledAtToUtcIso("2030-01-01T10:00:00Z", "Europe/Berlin");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scheduledAtIsoUtc).toBe("2030-01-01T10:00:00.000Z");
    expect(res.interpretation).toBe("explicit");
  });

  it("interprets naive timestamps in provided timezone", () => {
    // 10:00 in Berlin winter time should map to 09:00Z.
    const res = parseScheduledAtToUtcIso("2030-01-01T10:00:00", "Europe/Berlin");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scheduledAtIsoUtc).toBe("2030-01-01T09:00:00.000Z");
    expect(res.interpretation).toBe("in_timezone");
  });

  it("normalizes space-separated naive format (common LLM output)", () => {
    const res = parseScheduledAtToUtcIso("2030-01-01 10:00", "Europe/Berlin");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scheduledAtIsoUtc).toBe("2030-01-01T09:00:00.000Z");
  });

  it("rejects localized German-style timestamps instead of mis-parsing", () => {
    const res = parseScheduledAtToUtcIso("10.02.2030 10:00", "Europe/Berlin");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Invalid scheduledAt");
  });

  it("detects future vs past deterministically via injected now", () => {
    const nowMs = Date.parse("2030-01-01T09:00:00.000Z");
    expect(isScheduledAtInFutureUtc("2030-01-01T09:00:01.000Z", nowMs)).toBe(true);
    expect(isScheduledAtInFutureUtc("2030-01-01T09:00:00.000Z", nowMs)).toBe(false);
    expect(isScheduledAtInFutureUtc("2030-01-01T08:59:59.000Z", nowMs)).toBe(false);
  });

  it("guards against JS Date parsing locale traps by not using it for input", () => {
    // This test is here to document the original failure mode:
    // `new Date('10.02.2030 10:00')` is implementation/locale dependent.
    // We assert our parser rejects it.
    const spy = vi.spyOn(Date, "parse");
    const res = parseScheduledAtToUtcIso("10.02.2030 10:00", "Europe/Berlin");
    expect(res.ok).toBe(false);
    // Date.parse may still be used internally for future-check helper, but not for parsing input.
    // Ensure parseScheduledAtToUtcIso does not call Date.parse.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("resolves timezone from session metadata when input is missing", () => {
    const res = resolveScheduleTimezone({
      inputTimezone: undefined,
      sessionTimezone: "Europe/Berlin",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.timezone).toBe("Europe/Berlin");
    expect(res.source).toBe("session");
  });

  it("rejects timezone resolution when both input and session timezone are missing", () => {
    const res = resolveScheduleTimezone({
      inputTimezone: undefined,
      sessionTimezone: null,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("timezone_missing");
  });

  it("compares timestamps with minute precision for zero-drift checks", () => {
    expect(
      isMinutePrecisionMatchUtc("2030-01-01T09:00:59.000Z", "2030-01-01T09:00:00.000Z")
    ).toBe(true);
    expect(
      isMinutePrecisionMatchUtc("2030-01-01T09:01:00.000Z", "2030-01-01T09:00:59.999Z")
    ).toBe(false);
  });
});
