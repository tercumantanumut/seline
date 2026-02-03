/**
 * Unified Background Task Handler
 *
 * Thin wrapper over TaskRegistry for consistent registration and updates.
 */

import type { UnifiedTask, TaskStatus } from "./types";
import { taskRegistry } from "./registry";

export const taskHandler = {
  start(task: UnifiedTask): void {
    taskRegistry.register(task);
  },

  update(runId: string, status: TaskStatus, updates?: Partial<UnifiedTask>): void {
    taskRegistry.updateStatus(runId, status, updates);
  },

  progress(runId: string, progressText?: string, progressPercent?: number): void {
    taskRegistry.emitProgress(runId, progressText, progressPercent);
  },
};
