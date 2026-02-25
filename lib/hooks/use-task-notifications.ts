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
import {
  useSessionSyncStore,
  type SessionActivityIndicator,
  type SessionActivityState,
} from "@/lib/stores/session-sync-store";
import type {
  TaskEvent,
  TaskProgressEvent,
  UnifiedTask,
} from "@/lib/background-tasks/types";
import { formatDuration } from "@/lib/utils/timestamp";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

interface SSEMessage {
  type: "connected" | "heartbeat" | "task:started" | "task:completed" | "task:progress";
  data?: TaskEvent;
  timestamp?: string;
}

const MAX_ACTIVITY_LABEL_LENGTH = 64;

function trimLabel(value: string, maxLength = MAX_ACTIVITY_LABEL_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function uniqueIndicators(items: SessionActivityIndicator[]): SessionActivityIndicator[] {
  const byKey = new Map<string, SessionActivityIndicator>();
  for (const item of items) {
    byKey.set(item.key, item);
  }
  return Array.from(byKey.values());
}

function stableIndicatorSort(items: SessionActivityIndicator[]): SessionActivityIndicator[] {
  return [...items].sort((a, b) => {
    const aPriority = a.tone === "critical" ? 4 : a.tone === "warning" ? 3 : a.tone === "info" ? 2 : a.tone === "success" ? 1 : 0;
    const bPriority = b.tone === "critical" ? 4 : b.tone === "warning" ? 3 : b.tone === "info" ? 2 : b.tone === "success" ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.label.localeCompare(b.label);
  });
}

function buildActivityState(
  sessionId: string,
  runId: string,
  indicators: SessionActivityIndicator[],
  options: {
    isRunning: boolean;
    progressText?: string;
    previous?: SessionActivityState;
  }
): SessionActivityState {
  const sortedIndicators = stableIndicatorSort(uniqueIndicators(indicators));
  const signature = sortedIndicators
    .map((item) => `${item.key}:${item.kind}:${item.tone}:${item.label}:${item.detail ?? ""}`)
    .join("|");

  const previous = options.previous;
  if (
    previous &&
    previous.runId === runId &&
    previous.isRunning === options.isRunning &&
    previous.progressText === options.progressText
  ) {
    const previousSignature = previous.indicators
      .map((item) => `${item.key}:${item.kind}:${item.tone}:${item.label}:${item.detail ?? ""}`)
      .join("|");
    if (previousSignature === signature) {
      return previous;
    }
  }

  return {
    sessionId,
    runId,
    indicators: sortedIndicators,
    progressText: options.progressText,
    isRunning: options.isRunning,
    updatedAt: Date.now(),
  };
}

function deriveTaskIndicators(task: UnifiedTask, progressText?: string): SessionActivityIndicator[] {
  const indicators: SessionActivityIndicator[] = [
    {
      key: "run",
      kind: "run",
      label: "Running",
      tone: "info",
    },
  ];

  if (task.type === "scheduled") {
    indicators.push({
      key: "scheduled-task",
      kind: "skill",
      label: trimLabel(task.taskName || "Scheduled task"),
      detail: task.attemptNumber ? `Attempt ${task.attemptNumber}` : undefined,
      tone: "neutral",
    });
    if (progressText) {
      indicators.push({
        key: "scheduled-progress",
        kind: "tool",
        label: trimLabel(progressText),
        tone: "info",
      });
    }
  }

  if (task.type === "chat") {
    const metadata = (task.metadata && typeof task.metadata === "object")
      ? (task.metadata as Record<string, unknown>)
      : {};

    if (task.pipelineName === "deep-research") {
      indicators.push({
        key: "deep-research",
        kind: "skill",
        label: "Deep research",
        tone: "info",
      });
    }

    if (metadata.isDelegation === true) {
      indicators.push({
        key: "delegation",
        kind: "delegation",
        label: "Delegating",
        tone: "info",
      });
    }

    if (metadata.scheduledRunId) {
      indicators.push({
        key: "scheduled-origin",
        kind: "skill",
        label: "Scheduled run",
        tone: "neutral",
      });
    }

    const toolName = typeof metadata.toolName === "string" ? metadata.toolName : undefined;
    if (toolName) {
      indicators.push({
        key: "tool-name",
        kind: "tool",
        label: `Using ${trimLabel(toolName, 46)}`,
        tone: "info",
      });
    }

    const hookName = typeof metadata.hookName === "string" ? metadata.hookName : undefined;
    if (hookName) {
      indicators.push({
        key: "hook",
        kind: "hook",
        label: `Running hook ${trimLabel(hookName, 44)}`,
        tone: "info",
      });
    }

    const skillName = typeof metadata.skillName === "string" ? metadata.skillName : undefined;
    if (skillName) {
      indicators.push({
        key: "skill",
        kind: "skill",
        label: `Executing ${trimLabel(skillName, 44)}`,
        tone: "info",
      });
    }

    if (progressText) {
      indicators.push({
        key: "chat-progress",
        kind: "tool",
        label: trimLabel(progressText),
        tone: "info",
      });
    }
  }

  if (task.type === "channel") {
    indicators.push({
      key: "channel",
      kind: "run",
      label: `Channel ${task.channelType}`,
      tone: "neutral",
    });
  }

  return uniqueIndicators(indicators);
}

function deriveProgressIndicators(event: TaskProgressEvent): SessionActivityIndicator[] {
  const indicators: SessionActivityIndicator[] = [
    {
      key: "run",
      kind: "run",
      label: "Working",
      tone: "info",
    },
  ];

  if (event.taskName) {
    indicators.push({
      key: "task-name",
      kind: "skill",
      label: trimLabel(event.taskName),
      tone: "neutral",
    });
  }

  if (event.progressText) {
    indicators.push({
      key: "progress",
      kind: "tool",
      label: trimLabel(event.progressText),
      tone: "info",
    });

    const lower = event.progressText.toLowerCase();
    if (lower.includes("hook")) {
      indicators.push({
        key: "progress-hook",
        kind: "hook",
        label: "Hook running",
        tone: "info",
      });
    }
    if (lower.includes("skill")) {
      indicators.push({
        key: "progress-skill",
        kind: "skill",
        label: "Skill running",
        tone: "info",
      });
    }
    if (lower.includes("workspace")) {
      indicators.push({
        key: "progress-workspace",
        kind: "workspace",
        label: "Workspace updated",
        tone: "neutral",
      });
    }
    if (lower.includes("pull request") || /\bpr\b/.test(lower)) {
      indicators.push({
        key: "progress-pr",
        kind: "pr",
        label: "PR updated",
        tone: "info",
      });
    }
  }

  const parts = Array.isArray(event.progressContent) ? event.progressContent : [];
  const toolCall = parts.find((part) => {
    if (!part || typeof part !== "object") return false;
    return (part as Record<string, unknown>).type === "tool-call";
  }) as Record<string, unknown> | undefined;

  if (toolCall && typeof toolCall.toolName === "string") {
    indicators.push({
      key: "tool-call",
      kind: "tool",
      label: `Using ${trimLabel(toolCall.toolName, 46)}`,
      tone: "info",
    });
  }

  const toolResult = parts.find((part) => {
    if (!part || typeof part !== "object") return false;
    return (part as Record<string, unknown>).type === "tool-result";
  }) as Record<string, unknown> | undefined;

  if (toolResult && typeof toolResult.toolName === "string") {
    indicators.push({
      key: "tool-result",
      kind: "tool",
      label: `Result from ${trimLabel(toolResult.toolName, 40)}`,
      tone: "neutral",
    });
  }

  return uniqueIndicators(indicators);
}

function deriveCompletionIndicators(task: UnifiedTask): SessionActivityIndicator[] {
  const indicators: SessionActivityIndicator[] = [];

  if (task.status === "succeeded") {
    indicators.push({
      key: "completed",
      kind: "success",
      label: "Completed",
      tone: "success",
    });
  } else if (task.status === "stale") {
    indicators.push({
      key: "stale",
      kind: "error",
      label: "Needs attention",
      tone: "warning",
    });
  } else if (task.status === "cancelled") {
    indicators.push({
      key: "cancelled",
      kind: "error",
      label: "Cancelled",
      tone: "warning",
    });
  } else {
    indicators.push({
      key: "failed",
      kind: "error",
      label: "Failed",
      tone: "critical",
    });
  }

  if (task.type === "scheduled") {
    indicators.push({
      key: "scheduled-task",
      kind: "skill",
      label: trimLabel(task.taskName || "Scheduled task"),
      tone: "neutral",
    });
  }

  if (task.type === "chat") {
    const metadata = (task.metadata && typeof task.metadata === "object")
      ? (task.metadata as Record<string, unknown>)
      : {};

    if (metadata.isDelegation === true) {
      indicators.push({
        key: "delegation",
        kind: "delegation",
        label: task.status === "succeeded" ? "Delegation done" : "Delegation issue",
        tone: task.status === "succeeded" ? "success" : "warning",
      });
    }

    const resultSummary = typeof metadata.resultSummary === "string" ? metadata.resultSummary : "";
    if (/\bworkspace\b/i.test(resultSummary)) {
      indicators.push({
        key: "workspace",
        kind: "workspace",
        label: "Workspace updated",
        tone: "neutral",
      });
    }

    if (/\bPR\b|pull request/i.test(resultSummary)) {
      indicators.push({
        key: "pr",
        kind: "pr",
        label: "PR updated",
        tone: "info",
      });
    }
  }

  return uniqueIndicators(indicators);
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
      const isDelegationChat =
        task.type === "chat" &&
        task.metadata &&
        typeof task.metadata === "object" &&
        "isDelegation" in task.metadata;
      const displayName =
        isDelegationChat
          ? "Delegation"
          : task.type === "scheduled"
          ? task.taskName || "Scheduled task"
          : task.type === "chat"
          ? "Chat session"
          : "Channel message";
      console.log("[TaskNotifications] Task started:", displayName, task.runId);

      addTask(task);
      if (task.sessionId) {
        const sessionSyncState = useSessionSyncStore.getState();
        sessionSyncState.setActiveRun(task.sessionId, task.runId);
        const previous = sessionSyncState.getSessionActivity(task.sessionId);
        sessionSyncState.setSessionActivity(
          task.sessionId,
          buildActivityState(task.sessionId, task.runId, deriveTaskIndicators(task), {
            isRunning: true,
            previous,
          })
        );
      }
      dispatchLifecycleEvent("background-task-started", event);

      if (isDelegationChat) return;

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
      const isDelegationChat =
        task.type === "chat" &&
        task.metadata &&
        typeof task.metadata === "object" &&
        "isDelegation" in task.metadata;
      const displayName =
        isDelegationChat
          ? "Delegation"
          : task.type === "scheduled"
          ? task.taskName || "Scheduled task"
          : task.type === "chat"
          ? "Chat session"
          : "Channel message";
      console.log("[TaskNotifications] Task completed:", displayName, task.status);

      completeTask(task);
      if (task.sessionId) {
        const sessionSyncState = useSessionSyncStore.getState();
        sessionSyncState.setActiveRun(task.sessionId, null);
        const previous = sessionSyncState.getSessionActivity(task.sessionId);
        sessionSyncState.setSessionActivity(
          task.sessionId,
          buildActivityState(task.sessionId, task.runId, deriveCompletionIndicators(task), {
            isRunning: false,
            previous,
          })
        );
      }
      dispatchLifecycleEvent("background-task-completed", event);

      if (isDelegationChat) return;

      if (task.status === "succeeded") {
        const completedKey = task.type === "chat" ? "chatCompleted" : "taskCompleted";
        if (shouldShowChatToast(task)) {
          toast.success(t(completedKey, { taskName: displayName }), {
            description:
              task.metadata && typeof task.metadata === "object"
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

        if (event.sessionId) {
          const sessionSyncState = useSessionSyncStore.getState();
          sessionSyncState.setActiveRun(event.sessionId, event.runId);
          const previous = sessionSyncState.getSessionActivity(event.sessionId);
          sessionSyncState.setSessionActivity(
            event.sessionId,
            buildActivityState(
              event.sessionId,
              event.runId,
              deriveProgressIndicators(event),
              {
                isRunning: true,
                progressText: event.progressText,
                previous,
              }
            )
          );
        }
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("background-task-progress", { detail: event }));
      }
    };
  }, [
    addTask,
    updateTask,
    completeTask,
    t,
    router,
    buildSessionUrl,
    buildScheduleUrl,
    dispatchLifecycleEvent,
    shouldShowChatToast,
  ]);

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
        const sessionSyncState = useSessionSyncStore.getState();

        for (const task of currentTasks) {
          if (!serverRunIds.has(task.runId)) {
            console.log(`[TaskNotifications] Removing stale task: ${task.runId}`);
            completeTask(task);
            if (task.sessionId) {
              sessionSyncState.setActiveRun(task.sessionId, null);
              sessionSyncState.setSessionActivity(task.sessionId, null);
            }
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

          if (task.sessionId) {
            sessionSyncState.setActiveRun(task.sessionId, task.runId);
            const previous = sessionSyncState.getSessionActivity(task.sessionId);
            sessionSyncState.setSessionActivity(
              task.sessionId,
              buildActivityState(task.sessionId, task.runId, deriveTaskIndicators(task), {
                isRunning: true,
                previous,
              })
            );
          }
        }

        // Sync active runs to session-sync-store for sidebar/character indicators
        const currentActiveRuns = sessionSyncState.activeRuns;
        for (const [sessionId] of currentActiveRuns) {
          if (!tasks.some((t) => t.sessionId === sessionId)) {
            sessionSyncState.setActiveRun(sessionId, null);
            sessionSyncState.setSessionActivity(sessionId, null);
          }
        }

        if (showToast && tasks.length > 0) {
          toast.success(t("taskReconnected"), {
            description: t("taskReconnectedDescription", { count: tasks.length }),
            duration: 5000,
          });
        }

        // Notify chat-interface that task store has been reconciled so it can
        // re-check for active runs it might have missed during SSE disconnect.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("sse-tasks-reconciled"));
        }
      } catch (error) {
        console.error("[TaskNotifications] Failed to reconcile state:", error);
      }
    };

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

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
