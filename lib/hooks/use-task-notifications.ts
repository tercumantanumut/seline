/**
 * Task Notifications Hook
 *
 * Subscribes to SSE task events and shows toast notifications.
 * Also updates the active tasks store for the header indicator.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useUnifiedTasksStore } from "@/lib/stores/unified-tasks-store";
import { useSessionSyncStore } from "@/lib/stores/session-sync-store";
import type { TaskEvent, UnifiedTask } from "@/lib/background-tasks/types";
import { formatDuration } from "@/lib/utils/timestamp";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

interface SSEMessage {
  type: "connected" | "heartbeat" | "task:started" | "task:completed" | "task:progress";
  data?: TaskEvent;
  timestamp?: string;
}

export function useTaskNotifications() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("schedules.notifications");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectedUserIdRef = useRef<string | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const wasDisconnectedRef = useRef(false);
  const lastEventReceivedAtRef = useRef<number | null>(null);
  const addTask = useUnifiedTasksStore((state) => state.addTask);
  const updateTask = useUnifiedTasksStore((state) => state.updateTask);
  const completeTask = useUnifiedTasksStore((state) => state.completeTask);
  const buildSessionUrl = useCallback((task: UnifiedTask) => {
    if (task.sessionId && task.characterId) {
      return `/chat/${task.characterId}?sessionId=${task.sessionId}`;
    }
    return undefined;
  }, []);
  const buildScheduleUrl = useCallback((task: UnifiedTask) => {
    if (task.type !== "scheduled") return undefined;
    return `/agents/${task.characterId}/schedules?highlight=${task.taskId}&run=${task.runId}&expandHistory=true`;
  }, []);
  const dispatchLifecycleEvent = useCallback((eventName: "background-task-started" | "background-task-completed", event: TaskEvent) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(eventName, { detail: event }));
  }, []);
  const shouldShowChatToast = useCallback((task: UnifiedTask) => {
    if (typeof window === "undefined") return true;
    if (task.type !== "chat") return true;
    const { pathname, search } = window.location;
    if (!pathname.startsWith("/chat/")) return true;
    if (!task.sessionId) return true;
    const params = new URLSearchParams(search);
    const sessionId = params.get("sessionId");
    return !sessionId || sessionId !== task.sessionId;
  }, []);

  // Use refs for handlers to avoid stale closures in EventSource callbacks
  const handleTaskStartedRef = useRef<(event: TaskEvent) => void>(() => {});
  const handleTaskCompletedRef = useRef<(event: TaskEvent) => void>(() => {});
  const handleTaskProgressRef = useRef<(event: TaskEvent) => void>(() => {});

  // Update refs when dependencies change
  useEffect(() => {
    handleTaskStartedRef.current = (event: TaskEvent) => {
      if (event.eventType !== "task:started") return;
      const task = event.task;
      const isScheduledChat =
        task.type === "chat" &&
        task.metadata &&
        typeof task.metadata === "object" &&
        "scheduledRunId" in task.metadata;
      if (isScheduledChat) {
        return;
      }
      const displayName =
        task.type === "scheduled"
          ? task.taskName || "Scheduled task"
          : task.type === "chat"
          ? "Chat session"
          : "Channel message";
      console.log("[TaskNotifications] Task started:", displayName, task.runId);

      addTask(task);
      // Bridge to session-sync-store for sidebar/character picker indicators
      if (task.sessionId) {
        useSessionSyncStore.getState().setActiveRun(task.sessionId, task.runId);
      }
      dispatchLifecycleEvent("background-task-started", event);

      const runningKey =
        task.type === "scheduled"
          ? "taskRunning"
          : task.type === "chat"
          ? "chatRunning"
          : "taskRunningGeneric";
      if (shouldShowChatToast(task)) {
        toast.info(t(runningKey, { taskName: displayName }), {
          description: t("taskStartedAt", {
            time: new Date(task.startedAt).toLocaleTimeString(),
          }),
          action: buildSessionUrl(task)
            ? {
                label: t("viewTask"),
                onClick: () => {
                  const url = buildSessionUrl(task);
                  if (url) router.push(url);
                },
              }
            : undefined,
          duration: 5000,
        });
      }
    };

    handleTaskCompletedRef.current = (event: TaskEvent) => {
      if (event.eventType !== "task:completed") return;
      const task = event.task;
      const isScheduledChat =
        task.type === "chat" &&
        task.metadata &&
        typeof task.metadata === "object" &&
        "scheduledRunId" in task.metadata;
      if (isScheduledChat) {
        return;
      }
      const displayName =
        task.type === "scheduled"
          ? task.taskName || "Scheduled task"
          : task.type === "chat"
          ? "Chat session"
          : "Channel message";
      console.log("[TaskNotifications] Task completed:", displayName, task.status);

      completeTask(task);
      // Bridge to session-sync-store for sidebar/character picker indicators
      if (task.sessionId) {
        useSessionSyncStore.getState().setActiveRun(task.sessionId, null);
      }
      dispatchLifecycleEvent("background-task-completed", event);

      if (task.status === "succeeded") {
        const completedKey = task.type === "chat" ? "chatCompleted" : "taskCompleted";
        if (shouldShowChatToast(task)) {
          toast.success(t(completedKey, { taskName: displayName }), {
            description: task.metadata && typeof task.metadata === "object"
              ? (task.metadata as { resultSummary?: string }).resultSummary?.slice(0, 100)
              : undefined,
            action: buildSessionUrl(task)
              ? {
                  label: t("viewTask"),
                  onClick: () => {
                    const url = buildSessionUrl(task);
                    if (url) router.push(url);
                  },
                }
              : undefined,
            duration: 8000,
          });
        }
      } else if (task.status === "failed") {
        const errorMessage = task.error?.toLowerCase() ?? "";
        const isCreditError =
          errorMessage.includes("credit") ||
          errorMessage.includes("insufficient") ||
          errorMessage.includes("quota");
        if (isCreditError) {
          toast.error(t("taskCreditExhausted"), {
            description: t("taskCreditExhaustedDescription"),
            duration: 15000,
          });
        } else {
          const scheduleUrl = buildScheduleUrl(task);
          toast.error(t("taskFailed", { taskName: displayName }), {
            description: task.error?.slice(0, 100),
            action: scheduleUrl
              ? {
                  label: t("viewDetails"),
                  onClick: () => router.push(scheduleUrl),
                }
              : undefined,
            duration: 10000,
          });
        }
      } else if (task.status === "stale") {
        const duration = task.durationMs ? formatDuration(task.durationMs) : "30m";
        toast.warning(t("taskStale"), {
          description: t("taskStaleDescription", {
            taskName: displayName,
            duration,
          }),
          duration: 8000,
        });
      }
    };

    handleTaskProgressRef.current = (event: TaskEvent) => {
      if (event.eventType === "task:progress") {
        if (event.sessionId || event.characterId) {
          updateTask(event.runId, {
            ...(event.sessionId ? { sessionId: event.sessionId } : {}),
            ...(event.characterId ? { characterId: event.characterId } : {}),
          });
        }
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("background-task-progress", { detail: event }));
      }
    };
  }, [addTask, updateTask, completeTask, t, router, buildSessionUrl, buildScheduleUrl, dispatchLifecycleEvent]);

  // Connect to SSE endpoint
  useEffect(() => {
    if (isLoading || !user?.id) {
      return;
    }

    if (eventSourceRef.current && connectedUserIdRef.current === user.id) {
      return;
    }

    console.log("[TaskNotifications] Connecting to event stream for user:", user.id);

    const cleanupConnection = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      connectedUserIdRef.current = null;
    };

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 4)));
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (user?.id) {
          cleanupConnection();
          connect();
        }
      }, delay);
    };

    const reconcileTasks = async (showToast: boolean) => {
      try {
        const { data, error } = await resilientFetch<{ tasks: UnifiedTask[] }>("/api/tasks/active");
        if (!data) {
          if (error) console.warn("[TaskNotifications] Failed to fetch active tasks:", error);
          return;
        }
        const tasks = data.tasks;

        const currentTasks = useUnifiedTasksStore.getState().tasks;
        const serverRunIds = new Set(tasks.map((task) => task.runId));

        for (const task of currentTasks) {
          if (!serverRunIds.has(task.runId)) {
            console.log(`[TaskNotifications] Removing stale task: ${task.runId}`);
            completeTask(task);
          }
        }

        for (const task of tasks) {
          const existing = currentTasks.find((current) => current.runId === task.runId);
          if (existing) {
            updateTask(task.runId, task);
          } else {
            console.log(`[TaskNotifications] Adding missing task: ${task.runId}`);
            addTask(task);
          }
        }

        // Sync active runs to session-sync-store for sidebar/character indicators
        const sessionSyncState = useSessionSyncStore.getState();
        const currentActiveRuns = sessionSyncState.activeRuns;
        for (const [sessionId] of currentActiveRuns) {
          if (!tasks.some(t => t.sessionId === sessionId)) {
            sessionSyncState.setActiveRun(sessionId, null);
          }
        }
        for (const task of tasks) {
          if (task.sessionId) {
            sessionSyncState.setActiveRun(task.sessionId, task.runId);
          }
        }

        if (showToast && tasks.length > 0) {
          toast.success(t("taskReconnected"), {
            description: t("taskReconnectedDescription", { count: tasks.length }),
            duration: 5000,
          });
        }
      } catch (error) {
        console.error("[TaskNotifications] Failed to reconcile state:", error);
      }
    };

    const connect = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Create new SSE connection
      const eventSource = new EventSource("/api/tasks/events");
      eventSourceRef.current = eventSource;
      connectedUserIdRef.current = user.id;

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        lastEventReceivedAtRef.current = Date.now();
        console.log("[TaskNotifications] SSE connection opened");
        const showToast = hasConnectedOnceRef.current && wasDisconnectedRef.current;
        hasConnectedOnceRef.current = true;
        wasDisconnectedRef.current = false;
        void reconcileTasks(showToast);
      };

      eventSource.onmessage = (event) => {
        try {
          lastEventReceivedAtRef.current = Date.now();
          const message: SSEMessage = JSON.parse(event.data);
          console.log("[TaskNotifications] Received message:", message.type);

          switch (message.type) {
            case "connected":
              console.log("[TaskNotifications] Connected to event stream");
              break;

            case "heartbeat":
              // Keep-alive, no action needed
              break;

            case "task:started":
              if (message.data) {
                handleTaskStartedRef.current(message.data);
              }
              break;

            case "task:completed":
              if (message.data) {
                handleTaskCompletedRef.current(message.data);
              }
              break;
            case "task:progress":
              if (message.data) {
                handleTaskProgressRef.current(message.data);
              }
              break;
          }
        } catch (error) {
          console.error("[TaskNotifications] Failed to parse message:", error);
        }
      };

      eventSource.onerror = (error) => {
        const msSinceLastMessage =
          lastEventReceivedAtRef.current === null
            ? null
            : Date.now() - lastEventReceivedAtRef.current;
        console.warn("[TaskNotifications] Connection error:", {
          error,
          readyState: eventSource.readyState,
          msSinceLastMessage,
          reconnectAttempts: reconnectAttemptsRef.current,
        });

        eventSource.close();
        wasDisconnectedRef.current = true;

        // Clear ref
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = null;
        }

        scheduleReconnect();
      };
    };

    void reconcileTasks(false).then(() => {
      connect();
    });

    return () => {
      console.log("[TaskNotifications] Cleaning up SSE connection");
      cleanupConnection();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [isLoading, user?.id]);
}
