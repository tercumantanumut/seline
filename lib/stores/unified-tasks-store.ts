/**
 * Unified Tasks Store
 *
 * Zustand store for tracking all running background tasks.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { UnifiedTask, TaskType } from "@/lib/background-tasks/types";

interface UnifiedTasksState {
  tasks: UnifiedTask[];
  tasksMap: Map<string, UnifiedTask>;
  recentlyCompleted: UnifiedTask[];

  addTask: (task: UnifiedTask) => void;
  updateTask: (runId: string, updates: Partial<UnifiedTask>) => void;
  removeTask: (runId: string) => void;
  completeTask: (task: UnifiedTask) => void;

  getTasksByType: (type: TaskType) => UnifiedTask[];
  getTasksByUser: (userId: string) => UnifiedTask[];
  getTasksByCharacter: (characterId: string) => UnifiedTask[];
  getActiveCount: () => number;
}

export const useUnifiedTasksStore = create<UnifiedTasksState>((set, get) => ({
  tasks: [],
  tasksMap: new Map(),
  recentlyCompleted: [],

  addTask: (task) => {
    set((state) => {
      const newMap = new Map(state.tasksMap);
      newMap.set(task.runId, task);
      return {
        tasksMap: newMap,
        tasks: Array.from(newMap.values()),
      };
    });
  },

  updateTask: (runId, updates) => {
    set((state) => {
      const existing = state.tasksMap.get(runId);
      if (!existing) return state;

      const updated = { ...existing, ...updates } as UnifiedTask;
      const newMap = new Map(state.tasksMap);
      newMap.set(runId, updated);

      return {
        tasksMap: newMap,
        tasks: Array.from(newMap.values()),
      };
    });
  },

  removeTask: (runId) => {
    set((state) => {
      const newMap = new Map(state.tasksMap);
      newMap.delete(runId);
      return {
        tasksMap: newMap,
        tasks: Array.from(newMap.values()),
      };
    });
  },

  completeTask: (task) => {
    set((state) => {
      const newMap = new Map(state.tasksMap);
      newMap.delete(task.runId);
      return {
        tasksMap: newMap,
        tasks: Array.from(newMap.values()),
        recentlyCompleted: [task, ...state.recentlyCompleted].slice(0, 10),
      };
    });
  },

  getTasksByType: (type) => get().tasks.filter((t) => t.type === type),
  getTasksByUser: (userId) => get().tasks.filter((t) => t.userId === userId),
  getTasksByCharacter: (characterId) =>
    get().tasks.filter((t) => t.characterId === characterId),
  getActiveCount: () => get().tasks.length,
}));

export const useActiveTaskCount = () =>
  useUnifiedTasksStore((state) => state.tasks.length);

export const useActiveTasks = () =>
  useUnifiedTasksStore(useShallow((state) => state.tasks));

export const useActiveTasksByType = (type: TaskType) =>
  useUnifiedTasksStore(
    useShallow((state) => state.tasks.filter((t) => t.type === type))
  );

export const useRecentlyCompletedTasks = () =>
  useUnifiedTasksStore(useShallow((state) => state.recentlyCompleted));
