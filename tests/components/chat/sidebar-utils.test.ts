import { describe, it, expect, vi, afterEach } from "vitest";
import { getDateBucket, parseAsUTC } from "@/components/chat/chat-sidebar/sidebar-utils";

describe("parseAsUTC", () => {
  it("should parse ISO string with Z suffix as-is", () => {
    const d = parseAsUTC("2026-03-08T23:52:00.000Z");
    expect(d.toISOString()).toBe("2026-03-08T23:52:00.000Z");
  });

  it("should append Z to a plain datetime string", () => {
    const d = parseAsUTC("2026-03-08 23:52:00");
    expect(d.toISOString()).toBe("2026-03-08T23:52:00.000Z");
  });

  it("should preserve strings with timezone offset", () => {
    const d = parseAsUTC("2026-03-08T23:52:00+03:00");
    expect(d.toISOString()).toBe("2026-03-08T20:52:00.000Z");
  });
});

describe("getDateBucket", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return 'today' for a date from earlier today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 14, 0, 0)); // Mar 9 14:00

    const date = new Date(2026, 2, 9, 1, 27, 0); // Mar 9 01:27
    expect(getDateBucket(date)).toBe("today");
  });

  it("should return 'week' for yesterday even if less than 24h ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 1, 37, 0)); // Mar 9 01:37

    // Yesterday at 23:52 — only ~1h45m ago, but should be 'week' not 'today'
    const date = new Date(2026, 2, 8, 23, 52, 0); // Mar 8 23:52
    expect(getDateBucket(date)).toBe("week");
  });

  it("should return 'today' for a date from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 1, 37, 0));

    const date = new Date(2026, 2, 9, 1, 37, 0);
    expect(getDateBucket(date)).toBe("today");
  });

  it("should return 'week' for 6 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 12, 0, 0));

    const date = new Date(2026, 2, 3, 12, 0, 0); // 6 days ago
    expect(getDateBucket(date)).toBe("week");
  });

  it("should return 'older' for 7+ days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 12, 0, 0));

    const date = new Date(2026, 2, 2, 12, 0, 0); // 7 days ago
    expect(getDateBucket(date)).toBe("older");
  });

  it("should return 'today' for future dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 12, 0, 0));

    const date = new Date(2026, 2, 10, 12, 0, 0); // tomorrow
    expect(getDateBucket(date)).toBe("today");
  });
});
