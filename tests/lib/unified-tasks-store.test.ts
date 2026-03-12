import { beforeEach, describe, expect, it } from "vitest";
import type { UnifiedTask } from "@/lib/background-tasks/types";
import { getVisibleActiveTasks } from "@/lib/stores/unified-tasks-store";

const baseTask = {
  status: "running",
  userId: "user-1",
  startedAt: "2026-03-12T12:00:00.000Z",
} as const;

function scheduledTask(overrides: Partial<UnifiedTask> = {}): UnifiedTask {
  return {
    runId: "run-scheduled",
    type: "scheduled",
    taskId: "task-1",
    taskName: "Scheduled task",
    prompt: "Prompt",
    priority: "normal",
    sessionId: "session-1",
    characterId: "character-1",
    ...baseTask,
    ...overrides,
  } as UnifiedTask;
}

function chatTask(overrides: Partial<UnifiedTask> = {}): UnifiedTask {
  return {
    runId: "run-chat",
    type: "chat",
    pipelineName: "chat",
    triggerType: "chat",
    sessionId: "session-1",
    characterId: "character-1",
    ...baseTask,
    ...overrides,
  } as UnifiedTask;
}

describe("getVisibleActiveTasks", () => {
  beforeEach(() => {
    // Stateless helper test: nothing to reset, but keeps shape aligned with other suites.
  });

  it("filters suppressed tasks before counting visible tasks", () => {
    const tasks = [
      scheduledTask(),
      chatTask({
        runId: "run-hidden",
        metadata: { suppressFromUI: true },
      }),
    ];

    expect(getVisibleActiveTasks(tasks)).toEqual([tasks[0]]);
  });

  it("filters tasks by session id for chat-scoped task surfaces", () => {
    const taskInSession = scheduledTask({ runId: "run-session-1", sessionId: "session-1" });
    const taskOutsideSession = scheduledTask({ runId: "run-session-2", sessionId: "session-2" });

    expect(getVisibleActiveTasks([taskInSession, taskOutsideSession], { sessionId: "session-1" })).toEqual([
      taskInSession,
    ]);
  });

  it("supports filtering by multiple task types", () => {
    const scheduled = scheduledTask({ runId: "run-scheduled-1" });
    const chat = chatTask({ runId: "run-chat-1", triggerType: "delegation" });
    const channel: UnifiedTask = {
      runId: "run-channel-1",
      type: "channel",
      channelType: "telegram",
      connectionId: "conn-1",
      peerId: "peer-1",
      sessionId: "session-1",
      characterId: "character-1",
      ...baseTask,
    };

    expect(getVisibleActiveTasks([scheduled, chat, channel], { type: ["scheduled", "chat"] })).toEqual([
      scheduled,
      chat,
    ]);
  });
});
