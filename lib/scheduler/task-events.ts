/**
 * Task Event Emitter
 *
 * Event emitter for scheduled task lifecycle events.
 * Used to broadcast task started/completed events for:
 * - Real-time UI updates via SSE
 * - Toast notifications
 * - Activity indicators
 */

import { EventEmitter } from "events";

export interface TaskEvent {
  type: "started" | "completed" | "progress";
  taskId: string;
  taskName: string;
  runId: string;
  userId: string;
  characterId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  sessionId?: string;      // The chat session created for this run
  assistantMessageId?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  resultSummary?: string;
  progressText?: string;
}

// Use globalThis to persist across Next.js hot reloads in development
// This ensures the same EventEmitter instance is shared between:
// - The scheduler service (which emits events)
// - The SSE endpoint (which listens for events)
const globalForTaskEvents = globalThis as unknown as {
  taskEventEmitter: TaskEventEmitter | undefined;
};

class TaskEventEmitter extends EventEmitter {
  private constructor() {
    super();
    // Increase max listeners to handle multiple SSE connections
    this.setMaxListeners(100);
    console.log("[TaskEvents] TaskEventEmitter instance created");
  }

  static getInstance(): TaskEventEmitter {
    if (!globalForTaskEvents.taskEventEmitter) {
      globalForTaskEvents.taskEventEmitter = new TaskEventEmitter();
    }
    return globalForTaskEvents.taskEventEmitter;
  }

  /**
   * Reset the instance (for testing)
   */
  static reset(): void {
    if (globalForTaskEvents.taskEventEmitter) {
      globalForTaskEvents.taskEventEmitter.removeAllListeners();
      globalForTaskEvents.taskEventEmitter = undefined;
    }
  }

  /**
   * Emit task started event
   */
  emitTaskStarted(event: {
    taskId: string;
    taskName: string;
    runId: string;
    userId: string;
    characterId: string;
    sessionId?: string;
    startedAt: string;
  }): void {
    const fullEvent: TaskEvent = {
      ...event,
      type: "started",
      status: "running",
    };
    
    // Emit global event
    this.emit("task:started", fullEvent);
    // Emit user-specific event
    this.emit(`task:started:${event.userId}`, fullEvent);
    
    console.log(`[TaskEvents] Task "${event.taskName}" started (run: ${event.runId})`);
  }

  /**
   * Emit task completed event
   */
  emitTaskCompleted(event: {
    taskId: string;
    taskName: string;
    runId: string;
    userId: string;
    characterId: string;
    sessionId?: string;
    status: "succeeded" | "failed" | "cancelled";
    startedAt: string;
    completedAt: string;
    durationMs?: number;
    error?: string;
    resultSummary?: string;
  }): void {
    const fullEvent: TaskEvent = {
      ...event,
      type: "completed",
    };
    
    // Emit global event
    this.emit("task:completed", fullEvent);
    // Emit user-specific event
    this.emit(`task:completed:${event.userId}`, fullEvent);
    
    console.log(`[TaskEvents] Task "${event.taskName}" ${event.status} (run: ${event.runId})`);
  }

  /**
   * Emit task progress event
   */
  emitTaskProgress(event: {
    taskId: string;
    taskName: string;
    runId: string;
    userId: string;
    characterId: string;
    sessionId?: string;
    assistantMessageId?: string;
    progressText: string;
    startedAt: string;
  }): void {
    const fullEvent: TaskEvent = {
      ...event,
      type: "progress",
      status: "running",
    };

    this.emit("task:progress", fullEvent);
    this.emit(`task:progress:${event.userId}`, fullEvent);

    console.log(`[TaskEvents] Task "${event.taskName}" progress update (run: ${event.runId})`);
  }

  /**
   * Subscribe to events for a specific user
   * Returns cleanup function
   */
  subscribeForUser(
    userId: string,
    handlers: {
      onStarted?: (event: TaskEvent) => void;
      onCompleted?: (event: TaskEvent) => void;
      onProgress?: (event: TaskEvent) => void;
    }
  ): () => void {
    if (handlers.onStarted) {
      this.on(`task:started:${userId}`, handlers.onStarted);
    }
    if (handlers.onCompleted) {
      this.on(`task:completed:${userId}`, handlers.onCompleted);
    }
    if (handlers.onProgress) {
      this.on(`task:progress:${userId}`, handlers.onProgress);
    }

    return () => {
      if (handlers.onStarted) {
        this.off(`task:started:${userId}`, handlers.onStarted);
      }
      if (handlers.onCompleted) {
        this.off(`task:completed:${userId}`, handlers.onCompleted);
      }
      if (handlers.onProgress) {
        this.off(`task:progress:${userId}`, handlers.onProgress);
      }
    };
  }
}

// Export singleton instance
export const taskEvents = TaskEventEmitter.getInstance();

// Export the class for testing
export { TaskEventEmitter };
