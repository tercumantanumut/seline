/**
 * Unified Tasks Store
 *
 * Zustand store for tracking all running background tasks.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  isTaskSuppressedFromUI,
  type UnifiedTask,
  type TaskType,
} from "@/lib/background-tasks/types";

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

export interface ActiveTaskScope {
  sessionId?: string;
  type?: TaskType | TaskType[];
}

export interface ActiveTaskSnapshot {
  tasks: UnifiedTask[];
  count: number;
}

const EMPTY_ACTIVE_TASK_SNAPSHOT: ActiveTaskSnapshot = {
  tasks: [],
  count: 0,
};

function matchesActiveTaskScope(task: UnifiedTask, scope?: ActiveTaskScope): boolean {
  if (!scope) {
    return true;
  }

  if (scope.sessionId && task.sessionId !== scope.sessionId) {
    return false;
  }

  if (!scope.type) {
    return true;
  }

  const allowedTypes = Array.isArray(scope.type) ? scope.type : [scope.type];
  return allowedTypes.includes(task.type);
}

export function getVisibleActiveTasks(tasks: UnifiedTask[], scope?: ActiveTaskScope): UnifiedTask[] {
  return tasks.filter((task) => !isTaskSuppressedFromUI(task) && matchesActiveTaskScope(task, scope));
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

export const useActiveTaskSnapshot = (scope?: ActiveTaskScope | null) =>
  useUnifiedTasksStore(
    useShallow((state) => {
      if (scope === null) {
        return EMPTY_ACTIVE_TASK_SNAPSHOT;
      }

      const tasks = getVisibleActiveTasks(state.tasks, scope ?? undefined);
      return {
        tasks,
        count: tasks.length,
      };
    })
  );

export const useActiveTaskCount = () =>
  useUnifiedTasksStore((state) => getVisibleActiveTasks(state.tasks).length);

export const useActiveTasks = () =>
  useUnifiedTasksStore(useShallow((state) => getVisibleActiveTasks(state.tasks)));

export const useActiveTasksByType = (type: TaskType) =>
  useUnifiedTasksStore(
    useShallow((state) => getVisibleActiveTasks(state.tasks, { type }))
  );

export const useRecentlyCompletedTasks = () =>
  useUnifiedTasksStore(useShallow((state) => state.recentlyCompleted));
