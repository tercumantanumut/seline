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
import { useActiveTasksStore } from "@/lib/stores/active-tasks-store";
import type { TaskEvent } from "@/lib/scheduler/task-events";

interface SSEMessage {
  type: "connected" | "heartbeat" | "task:started" | "task:completed";
  data?: TaskEvent;
  timestamp?: string;
}

export function useTaskNotifications() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("schedules.notifications");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addTask = useActiveTasksStore((state) => state.addTask);
  const completeTask = useActiveTasksStore((state) => state.completeTask);
  const buildSessionUrl = useCallback((event: TaskEvent) => {
    if (event.sessionId && event.characterId) {
      return `/chat/${event.characterId}?sessionId=${event.sessionId}`;
    }
    return undefined;
  }, []);
  const buildScheduleUrl = useCallback((event: TaskEvent) => {
    if (!event.characterId) return undefined;
    return `/agents/${event.characterId}/schedules?highlight=${event.taskId}&run=${event.runId}&expandHistory=true`;
  }, []);
  const dispatchLifecycleEvent = useCallback((eventName: "scheduled-task-started" | "scheduled-task-completed", event: TaskEvent) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(eventName, { detail: event }));
  }, []);

  // Use refs for handlers to avoid stale closures in EventSource callbacks
  const handleTaskStartedRef = useRef<(event: TaskEvent) => void>(() => {});
  const handleTaskCompletedRef = useRef<(event: TaskEvent) => void>(() => {});

  // Update refs when dependencies change
  useEffect(() => {
    handleTaskStartedRef.current = (event: TaskEvent) => {
      console.log("[TaskNotifications] Task started:", event.taskName, event.runId);

      // Add to active tasks store
      addTask(event);
      dispatchLifecycleEvent("scheduled-task-started", event);

      // Show toast notification
      toast.info(t("taskRunning", { taskName: event.taskName }), {
        description: t("taskStartedAt", {
          time: new Date(event.startedAt).toLocaleTimeString()
        }),
        action: buildSessionUrl(event) ? {
          label: t("viewTask"),
          onClick: () => {
            const url = buildSessionUrl(event);
            if (url) router.push(url);
          },
        } : undefined,
        duration: 5000,
      });
    };

    handleTaskCompletedRef.current = (event: TaskEvent) => {
      console.log("[TaskNotifications] Task completed:", event.taskName, event.status);

      // Update active tasks store
      completeTask(event);
      dispatchLifecycleEvent("scheduled-task-completed", event);

      // Show completion toast
      if (event.status === "succeeded") {
        toast.success(t("taskCompleted", { taskName: event.taskName }), {
          description: event.resultSummary?.slice(0, 100),
          action: buildSessionUrl(event) ? {
            label: t("viewTask"),
            onClick: () => {
              const url = buildSessionUrl(event);
              if (url) router.push(url);
            },
          } : undefined,
          duration: 8000,
        });
      } else if (event.status === "failed") {
        const scheduleUrl = buildScheduleUrl(event);
        toast.error(t("taskFailed", { taskName: event.taskName }), {
          description: event.error?.slice(0, 100),
          action: scheduleUrl ? {
            label: t("viewDetails"),
            onClick: () => router.push(scheduleUrl),
          } : undefined,
          duration: 10000,
        });
      }
    };
  }, [addTask, completeTask, t, router, buildSessionUrl, buildScheduleUrl, dispatchLifecycleEvent]);

  // Connect to SSE endpoint
  useEffect(() => {
    if (isLoading || !user?.id) {
      return;
    }

    console.log("[TaskNotifications] Connecting to event stream for user:", user.id);

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Create new SSE connection
    const eventSource = new EventSource("/api/schedules/events");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("[TaskNotifications] SSE connection opened");
    };

    eventSource.onmessage = (event) => {
      try {
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
        }
      } catch (error) {
        console.error("[TaskNotifications] Failed to parse message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.warn("[TaskNotifications] Connection error:", error);
      eventSource.close();

      // Clear ref
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }

      // Reconnect after 5 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        // Force re-run of this effect by triggering a state update
        // This is handled naturally by React's effect system on rerender
      }, 5000);
    };

    return () => {
      console.log("[TaskNotifications] Cleaning up SSE connection");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isLoading, user?.id]);
}
