/**
 * Active Tasks Store (deprecated)
 *
 * Backwards-compatible alias for unified tasks store.
 */

import type { UnifiedTask } from "@/lib/background-tasks/types";
import {
  useUnifiedTasksStore as useActiveTasksStore,
  useActiveTaskCount,
  useActiveTasks,
  useRecentlyCompletedTasks,
} from "./unified-tasks-store";

export type ActiveTask = UnifiedTask;

export { useActiveTasksStore, useActiveTaskCount, useActiveTasks, useRecentlyCompletedTasks };
