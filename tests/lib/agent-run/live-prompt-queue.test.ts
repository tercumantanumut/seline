import { describe, expect, it } from "vitest";

import {
  appendLivePromptQueueEntry,
  buildLivePromptInjectionMessage,
  getLivePromptQueueEntries,
  getUnseenLivePromptEntries,
  hasLivePromptStopIntent,
  hasStopIntent,
  sanitizeLivePromptContent,
} from "@/lib/agent-run/live-prompt-queue";

describe("live prompt queue", () => {
  it("sanitizes non-string and trims text", () => {
    expect(sanitizeLivePromptContent(undefined)).toBe("");
    expect(sanitizeLivePromptContent("   hello world   ")).toBe("hello world");
  });

  it("stores entries and returns unseen entries for target run only", () => {
    const metadata = appendLivePromptQueueEntry({}, {
      id: "p1",
      runId: "run-a",
      content: "first",
      createdAt: "2026-02-22T00:00:00.000Z",
      source: "composer-midrun",
    });

    const metadataWithSecond = appendLivePromptQueueEntry(metadata, {
      id: "p2",
      runId: "run-b",
      content: "second",
      createdAt: "2026-02-22T00:00:10.000Z",
      source: "composer-midrun",
    });

    const seen = new Set<string>();
    const runAEntries = getUnseenLivePromptEntries(metadataWithSecond, "run-a", seen);
    expect(runAEntries).toHaveLength(1);
    expect(runAEntries[0]?.id).toBe("p1");

    const runASecondPass = getUnseenLivePromptEntries(metadataWithSecond, "run-a", seen);
    expect(runASecondPass).toHaveLength(0);

    const runBEntries = getUnseenLivePromptEntries(metadataWithSecond, "run-b", new Set<string>());
    expect(runBEntries).toHaveLength(1);
    expect(runBEntries[0]?.id).toBe("p2");
  });

  it("detects stop intent and marks injection message as critical", () => {
    expect(hasStopIntent("please STOP now")).toBe(true);
    expect(hasStopIntent("continue please")).toBe(false);

    const stopEntries = [
      {
        id: "s1",
        runId: "run-a",
        content: "stop the run now",
        createdAt: "2026-02-22T00:00:20.000Z",
        source: "chat",
      },
    ];

    expect(hasLivePromptStopIntent(stopEntries)).toBe(true);
    const stopMessage = buildLivePromptInjectionMessage(stopEntries);
    expect(stopMessage).toContain("CRITICAL: A stop/cancel instruction is present");
  });

  it("sorts entries by createdAt and builds injection message", () => {
    const metadata = {
      livePromptQueue: [
        {
          id: "p2",
          runId: "run-a",
          content: "second",
          createdAt: "2026-02-22T00:00:10.000Z",
          source: "chat",
        },
        {
          id: "p1",
          runId: "run-a",
          content: "first",
          createdAt: "2026-02-22T00:00:00.000Z",
          source: "composer-midrun",
        },
      ],
    };

    const entries = getLivePromptQueueEntries(metadata);
    expect(entries.map((entry) => entry.id)).toEqual(["p1", "p2"]);

    const message = buildLivePromptInjectionMessage(entries);
    expect(message).toContain("Live user instructions were submitted while this run was already in progress.");
    expect(message).toContain("1. (source=composer-midrun, at 2026-02-22T00:00:00.000Z) first");
    expect(message).toContain("2. (source=chat, at 2026-02-22T00:00:10.000Z) second");
  });
});
