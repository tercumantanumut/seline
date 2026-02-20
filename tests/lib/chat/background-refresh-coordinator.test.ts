import { describe, expect, it } from "vitest";
import { BackgroundRefreshCoordinator } from "@/lib/chat/background-refresh-coordinator";

describe("BackgroundRefreshCoordinator", () => {
  it("coalesces burst progress updates into fewer incremental refreshes", async () => {
    const applied: Array<{ sessionId: string; mode: "incremental" | "full" }> = [];

    const coordinator = new BackgroundRefreshCoordinator({
      getActiveSessionId: () => "session-a",
      applyRefresh: async (sessionId, mode) => {
        applied.push({ sessionId, mode });
      },
      coalesceMs: 5,
      minIncrementalIntervalMs: 10,
    });

    const now = new Date().toISOString();
    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: now,
    });
    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: now,
    });
    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: now,
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(applied.length).toBe(1);
    expect(applied[0]).toEqual({ sessionId: "session-a", mode: "incremental" });

    coordinator.dispose();
  });

  it("drops stale progress events and ignores out-of-session requests", async () => {
    const applied: Array<{ sessionId: string; mode: "incremental" | "full" }> = [];

    const coordinator = new BackgroundRefreshCoordinator({
      getActiveSessionId: () => "session-a",
      applyRefresh: async (sessionId, mode) => {
        applied.push({ sessionId, mode });
      },
      coalesceMs: 5,
      minIncrementalIntervalMs: 5,
    });

    coordinator.enqueue({
      sessionId: "session-b",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });

    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: new Date("2026-01-01T00:00:02.000Z").toISOString(),
    });

    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: new Date("2026-01-01T00:00:01.000Z").toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(applied.length).toBe(1);
    expect(applied[0]).toEqual({ sessionId: "session-a", mode: "incremental" });

    coordinator.dispose();
  });

  it("promotes queued incremental updates to full refresh on completion", async () => {
    const applied: Array<{ sessionId: string; mode: "incremental" | "full" }> = [];

    const coordinator = new BackgroundRefreshCoordinator({
      getActiveSessionId: () => "session-a",
      applyRefresh: async (sessionId, mode) => {
        applied.push({ sessionId, mode });
      },
      coalesceMs: 8,
      minIncrementalIntervalMs: 8,
    });

    coordinator.enqueue({
      sessionId: "session-a",
      mode: "incremental",
      reason: "progress",
      runId: "run-1",
      eventTimestamp: new Date("2026-01-01T00:00:01.000Z").toISOString(),
    });
    coordinator.enqueue({
      sessionId: "session-a",
      mode: "full",
      reason: "completed",
      runId: "run-1",
      immediate: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(applied.length).toBe(1);
    expect(applied[0]).toEqual({ sessionId: "session-a", mode: "full" });

    coordinator.dispose();
  });

  it("hydrates immediately when returning to a session with an active run", async () => {
    const applied: Array<{ sessionId: string; mode: "incremental" | "full"; at: number }> = [];

    const coordinator = new BackgroundRefreshCoordinator({
      getActiveSessionId: () => "session-a",
      applyRefresh: async (sessionId, mode) => {
        applied.push({ sessionId, mode, at: Date.now() });
      },
      coalesceMs: 50,
      minIncrementalIntervalMs: 10,
    });

    const startedAt = Date.now();
    coordinator.enqueue({
      sessionId: "session-a",
      mode: "full",
      reason: "hydrate",
      runId: "run-2",
      immediate: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(applied.length).toBe(1);
    expect(applied[0]?.mode).toBe("full");
    expect(applied[0]?.at - startedAt).toBeLessThan(30);

    coordinator.dispose();
  });
});
