import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("interactive-tool-bridge", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    const bridge = await import("@/lib/interactive-tool-bridge");
    bridge.cleanupStaleEntries(0);
  });

  afterEach(async () => {
    const bridge = await import("@/lib/interactive-tool-bridge");
    bridge.cleanupStaleEntries(0);
  });

  it("shares the same pending promise for duplicate registrations", async () => {
    const bridge = await import("@/lib/interactive-tool-bridge");

    const pendingA = bridge.registerInteractiveWait("sess-1", "tool-1", { prompt: "approve?" });
    const pendingB = bridge.registerInteractiveWait("sess-1", "tool-1", { prompt: "approve?" });

    expect(pendingB).toBe(pendingA);

    expect(bridge.resolveInteractiveWait("sess-1", "tool-1", { action: "Approve & Continue" })).toBe(true);
    await expect(pendingA).resolves.toEqual({
      kind: "submitted",
      answers: { action: "Approve & Continue" },
    });
  });

  it("returns interrupted result when aborted before the user answers", async () => {
    const bridge = await import("@/lib/interactive-tool-bridge");
    const controller = new AbortController();

    const pending = bridge.registerInteractiveWait(
      "sess-2",
      "tool-2",
      { prompt: "approve?" },
      { abortSignal: controller.signal },
    );

    controller.abort();

    await expect(pending).resolves.toEqual({
      kind: "interrupted",
      reason: "aborted",
    });
    expect(bridge.resolveInteractiveWait("sess-2", "tool-2", { action: "Approve & Continue" })).toBe(false);
  });

  it("marks stale waits as interrupted instead of synthesizing empty answers", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-08T12:00:00.000Z");
    vi.setSystemTime(now);

    const bridge = await import("@/lib/interactive-tool-bridge");
    const pending = bridge.registerInteractiveWait("sess-3", "tool-3", { prompt: "approve?" });

    vi.setSystemTime(new Date(now.getTime() + 10 * 60 * 1000 + 1));
    bridge.cleanupStaleEntries(10 * 60 * 1000);

    await expect(pending).resolves.toEqual({
      kind: "interrupted",
      reason: "stale",
    });
  });
});
