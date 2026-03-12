import { describe, expect, it } from "vitest";
import {
  appendLogs,
  flushQueuedLogs,
  formatLogLine,
  hydrateLogs,
} from "@/components/dev/dev-logs-viewer";

describe("DevLogsViewer helpers", () => {
  it("keeps only the most recent 1000 log entries", () => {
    const first = Array.from({ length: 800 }, (_, index) => ({
      timestamp: `2026-03-12T10:00:${String(index).padStart(2, "0")}.000Z`,
      level: "info",
      message: `first-${index}`,
    }));
    const second = Array.from({ length: 400 }, (_, index) => ({
      timestamp: `2026-03-12T11:00:${String(index).padStart(2, "0")}.000Z`,
      level: index % 2 === 0 ? "warning" : "info",
      message: `second-${index}`,
    }));

    const combined = appendLogs(first, second);

    expect(combined).toHaveLength(1000);
    expect(combined[0]?.message).toBe("first-200");
    expect(combined.at(-1)?.message).toBe("second-399");
  });

  it("hydrates with queued live entries instead of overwriting them", () => {
    const buffer = [
      { timestamp: "2026-03-12T14:00:00.000Z", level: "info", message: "before-open" },
      { timestamp: "2026-03-12T14:00:01.000Z", level: "info", message: "during-open-1" },
    ];
    const queued = [
      { timestamp: "2026-03-12T14:00:02.000Z", level: "warning", message: "during-open-2" },
      { timestamp: "2026-03-12T14:00:03.000Z", level: "error", message: "during-open-3" },
    ];

    expect(hydrateLogs(buffer, queued).map((entry) => entry.message)).toEqual([
      "before-open",
      "during-open-1",
      "during-open-2",
      "during-open-3",
    ]);
  });

  it("flushes queued paused entries into the current visible list", () => {
    const current = [
      { timestamp: "2026-03-12T14:00:00.000Z", level: "info", message: "visible" },
    ];
    const queued = [
      { timestamp: "2026-03-12T14:00:01.000Z", level: "warning", message: "queued-1" },
      { timestamp: "2026-03-12T14:00:02.000Z", level: "error", message: "queued-2" },
    ];

    expect(flushQueuedLogs(current, queued).map((entry) => entry.message)).toEqual([
      "visible",
      "queued-1",
      "queued-2",
    ]);
  });

  it("formats a log line with timestamp, level, and message", () => {
    const line = formatLogLine({
      timestamp: "2026-03-12T14:00:00.000Z",
      level: "error",
      message: "Renderer crashed",
    });

    expect(line).toContain("[error] Renderer crashed");
  });
});
