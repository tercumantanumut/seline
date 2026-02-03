import { describe, it, expect } from "vitest";
import { taskRegistry } from "@/lib/background-tasks/registry";
import type { TaskEvent } from "@/lib/background-tasks/types";

const waitForProgressEvents = (
  userId: string,
  expectedCount: number,
  onEvents: (events: TaskEvent[]) => void
) =>
  new Promise<void>((resolve, reject) => {
    const events: TaskEvent[] = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for progress events"));
    }, 2000);

    const cleanup = taskRegistry.subscribeForUser(userId, {
      onProgress: (event) => {
        events.push(event);
        if (events.length === expectedCount) {
          clearTimeout(timeout);
          cleanup();
          onEvents(events);
          resolve();
        }
      },
    });
  });

describe("TaskRegistry progress events", () => {
  it("emits progress even when task is not registered", async () => {
    const runId = `test-run-${Math.random().toString(16).slice(2)}`;
    const userId = "user-456";

    const waitForEvents = waitForProgressEvents(userId, 2, (events) => {
      expect(events[0].progressText).toBe("Before registration");
      expect(events[0].runId).toBe(runId);
      expect(events[1].progressText).toBe("After registration");
      expect(events[1].runId).toBe(runId);
    });

    taskRegistry.emitProgress(runId, "Before registration", undefined, {
      type: "scheduled",
      userId,
      taskId: "task-1",
      taskName: "Test Task",
    });

    taskRegistry.register({
      type: "scheduled",
      runId,
      taskId: "task-1",
      taskName: "Test Task",
      userId,
      status: "running",
      startedAt: new Date().toISOString(),
      prompt: "Test",
      priority: "normal",
      attemptNumber: 1,
    });

    taskRegistry.emitProgress(runId, "After registration");

    await waitForEvents;

    taskRegistry.updateStatus(runId, "succeeded");
  });
});
