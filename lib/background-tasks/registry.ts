/**
 * Unified Task Registry
 *
 * Central registry for all running background tasks.
 * Provides a single source of truth for the "view active tasks" feature.
 */

import { EventEmitter } from "events";
import type {
  UnifiedTask,
  TaskStatus,
  ListActiveTasksOptions,
  ActiveTasksResult,
  TaskEvent,
  TaskProgressEvent,
} from "./types";
import { nowISO, isStale } from "@/lib/utils/timestamp";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const globalForRegistry = globalThis as typeof globalThis & {
  taskRegistry?: TaskRegistry;
};

class TaskRegistry extends EventEmitter {
  private tasks: Map<string, UnifiedTask> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private cleanupStats = {
    totalCleaned: 0,
    lastCleanupAt: null as string | null,
    cleanupsByReason: {
      stale: 0,
      failed: 0,
      cancelled: 0,
    },
  };

  private constructor() {
    super();
    this.setMaxListeners(100);
    this.startCleanupInterval();
    console.log("[TaskRegistry] Instance created");
  }

  static getInstance(): TaskRegistry {
    if (!globalForRegistry.taskRegistry) {
      globalForRegistry.taskRegistry = new TaskRegistry();
    }
    return globalForRegistry.taskRegistry;
  }

  register(task: UnifiedTask): void {
    this.tasks.set(task.runId, task);

    const event: TaskEvent = {
      eventType: "task:started",
      task,
      timestamp: nowISO(),
    };

    this.emit("task:started", event);
    this.emit(`task:started:${task.userId}`, event);

    console.log(`[TaskRegistry] Registered ${task.type} task: ${task.runId}`);
  }

  updateStatus(
    runId: string,
    status: TaskStatus,
    updates?: Partial<UnifiedTask>
  ): UnifiedTask | undefined {
    const task = this.tasks.get(runId);
    if (!task) return undefined;

    const shouldComplete = status !== "running" && status !== "queued";
    const updated: UnifiedTask = {
      ...task,
      ...updates,
      status,
      ...(shouldComplete && { completedAt: nowISO() }),
    } as UnifiedTask;

    if (shouldComplete) {
      this.tasks.delete(runId);
      const event: TaskEvent = {
        eventType: "task:completed",
        task: updated,
        timestamp: nowISO(),
      };
      this.emit("task:completed", event);
      this.emit(`task:completed:${task.userId}`, event);
    } else {
      this.tasks.set(runId, updated);
    }

    console.log(`[TaskRegistry] Updated ${task.type} task ${runId}: ${status}`);
    return updated;
  }

  emitProgress(
    runId: string,
    progressText?: string,
    progressPercent?: number,
    details?: Omit<TaskProgressEvent, "eventType" | "timestamp" | "runId">
  ): void {
    const task = this.tasks.get(runId);
    const progressPreview = progressText?.slice(0, 50);

    console.log("[TaskRegistry] emitProgress called:", {
      runId,
      progressText: progressPreview,
      hasTask: !!task,
      currentTaskCount: this.tasks.size,
    });

    // Update lastActivityAt for stale detection
    if (task) {
      task.lastActivityAt = nowISO();
      this.tasks.set(runId, task);
    }

    if (!task) {
      if (!details?.userId || !details?.type) {
        console.warn("[TaskRegistry] Progress event dropped; task not in registry and missing details:", {
          runId,
          progressText: progressPreview,
          detailsProvided: !!details,
          availableTasks: Array.from(this.tasks.keys()),
        });
        return;
      }

      console.warn("[TaskRegistry] Task not in registry; emitting progress with provided details:", {
        runId,
        userId: details.userId,
        type: details.type,
      });

      const { userId, type, ...restDetails } = details;
      const event: TaskEvent = {
        eventType: "task:progress",
        runId,
        type,
        userId,
        progressText,
        progressPercent,
        ...restDetails,
        timestamp: nowISO(),
      };

      this.emit("task:progress", event);
      this.emit(`task:progress:${userId}`, event);
      return;
    }

    const { userId: _detailsUserId, type: _detailsType, ...restDetails } = details ?? {};
    const event: TaskEvent = {
      eventType: "task:progress",
      runId,
      type: task.type,
      userId: task.userId,
      characterId: task.characterId,
      sessionId: task.sessionId,
      progressText,
      progressPercent,
      ...restDetails,
      timestamp: nowISO(),
    };

    console.log("[TaskRegistry] Emitting task:progress:", {
      runId,
      userId: task.userId,
      type: task.type,
      progressText: progressPreview,
    });

    this.emit("task:progress", event);
    this.emit(`task:progress:${task.userId}`, event);
  }

  get(runId: string): UnifiedTask | undefined {
    return this.tasks.get(runId);
  }

  list(options: ListActiveTasksOptions = {}): ActiveTasksResult {
    let tasks = Array.from(this.tasks.values());

    if (options.userId) {
      tasks = tasks.filter((t) => t.userId === options.userId);
    }
    if (options.characterId) {
      tasks = tasks.filter((t) => t.characterId === options.characterId);
    }
    if (options.type) {
      tasks = tasks.filter((t) => t.type === options.type);
    }
    if (options.sessionId) {
      tasks = tasks.filter((t) => t.sessionId === options.sessionId);
    }

    tasks.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    const total = tasks.length;

    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    return { tasks, total };
  }

  count(options: Omit<ListActiveTasksOptions, "limit"> = {}): number {
    return this.list(options).total;
  }

  subscribeForUser(
    userId: string,
    handlers: {
      onStarted?: (event: TaskEvent) => void;
      onProgress?: (event: TaskEvent) => void;
      onCompleted?: (event: TaskEvent) => void;
    }
  ): () => void {
    if (handlers.onStarted) {
      this.on(`task:started:${userId}`, handlers.onStarted);
    }
    if (handlers.onProgress) {
      this.on(`task:progress:${userId}`, handlers.onProgress);
    }
    if (handlers.onCompleted) {
      this.on(`task:completed:${userId}`, handlers.onCompleted);
    }

    return () => {
      if (handlers.onStarted) {
        this.off(`task:started:${userId}`, handlers.onStarted);
      }
      if (handlers.onProgress) {
        this.off(`task:progress:${userId}`, handlers.onProgress);
      }
      if (handlers.onCompleted) {
        this.off(`task:completed:${userId}`, handlers.onCompleted);
      }
    };
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleTasks();
    }, 5 * 60 * 1000);
  }

  private cleanupStaleTasks(): void {
    const staleRunIds: string[] = [];

    for (const [runId, task] of this.tasks) {
      if (isStale(task.lastActivityAt ?? task.startedAt, STALE_THRESHOLD_MS)) {
        staleRunIds.push(runId);
      }
    }

    for (const runId of staleRunIds) {
      this.updateStatus(runId, "stale", {
        error: "Task marked stale by cleanup",
      });
      this.cleanupStats.totalCleaned += 1;
      this.cleanupStats.cleanupsByReason.stale += 1;
    }

    if (staleRunIds.length > 0) {
      this.cleanupStats.lastCleanupAt = nowISO();
      console.log(
        `[TaskRegistry] Cleaned up ${staleRunIds.length} stale tasks ` +
        `(total: ${this.cleanupStats.totalCleaned})`
      );
    }
  }

  getCleanupStats() {
    return { ...this.cleanupStats };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.removeAllListeners();
    this.tasks.clear();
  }
}

export const taskRegistry = TaskRegistry.getInstance();
export { TaskRegistry };
