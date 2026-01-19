/**
 * Active Tasks Store
 *
 * Zustand store for tracking currently running scheduled tasks.
 * Used by the header indicator and notification system.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { TaskEvent } from "@/lib/scheduler/task-events";

export interface ActiveTask {
  taskId: string;
  taskName: string;
  runId: string;
  characterId: string;
  sessionId?: string;
  startedAt: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
}

interface ActiveTasksState {
  // Currently running tasks - stored as array for stable reference
  activeTasks: ActiveTask[];
  // Lookup map for quick access by runId
  activeTasksMap: Map<string, ActiveTask>;

  // Recently completed tasks (for showing completion toasts)
  recentlyCompleted: TaskEvent[];

  // Actions
  addTask: (event: TaskEvent) => void;
  completeTask: (event: TaskEvent) => void;
  clearRecentlyCompleted: () => void;
  dismissRecentlyCompleted: (runId: string) => void;

  // Computed
  getActiveCount: () => number;
  getActiveTasks: () => ActiveTask[];
}

export const useActiveTasksStore = create<ActiveTasksState>((set, get) => ({
  activeTasks: [],
  activeTasksMap: new Map(),
  recentlyCompleted: [],

  addTask: (event: TaskEvent) => {
    set((state) => {
      const newTask: ActiveTask = {
        taskId: event.taskId,
        taskName: event.taskName,
        runId: event.runId,
        characterId: event.characterId,
        sessionId: event.sessionId,
        startedAt: event.startedAt,
        status: "running",
      };

      // Update map
      const newMap = new Map(state.activeTasksMap);
      newMap.set(event.runId, newTask);

      // Update array
      const newTasks = [...state.activeTasks.filter(t => t.runId !== event.runId), newTask];

      return {
        activeTasks: newTasks,
        activeTasksMap: newMap,
      };
    });
  },

  completeTask: (event: TaskEvent) => {
    set((state) => {
      // Update map
      const newMap = new Map(state.activeTasksMap);
      newMap.delete(event.runId);

      // Update array
      const newTasks = state.activeTasks.filter(t => t.runId !== event.runId);

      // Add to recently completed (keep last 5)
      const recentlyCompleted = [
        event,
        ...state.recentlyCompleted.filter(e => e.runId !== event.runId),
      ].slice(0, 5);

      return {
        activeTasks: newTasks,
        activeTasksMap: newMap,
        recentlyCompleted,
      };
    });
  },

  clearRecentlyCompleted: () => {
    set({ recentlyCompleted: [] });
  },

  dismissRecentlyCompleted: (runId: string) => {
    set((state) => ({
      recentlyCompleted: state.recentlyCompleted.filter(e => e.runId !== runId),
    }));
  },

  getActiveCount: () => {
    return get().activeTasks.length;
  },

  getActiveTasks: () => {
    return get().activeTasks;
  },
}));

// Selector hooks for common use cases
// Use primitive value for count to avoid reference issues
export const useActiveTaskCount = () => useActiveTasksStore((state) => state.activeTasks.length);

// Use useShallow for array to ensure stable reference comparison
export const useActiveTasks = () => useActiveTasksStore(
  useShallow((state) => state.activeTasks)
);

export const useRecentlyCompletedTasks = () => useActiveTasksStore(
  useShallow((state) => state.recentlyCompleted)
);
