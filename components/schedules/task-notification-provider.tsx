/**
 * Task Notification Provider
 * 
 * Wrapper component that mounts the task notification hook.
 * Should be placed in the app layout to enable global task notifications.
 */

"use client";

import { useTaskNotifications } from "@/lib/hooks/use-task-notifications";

interface TaskNotificationProviderProps {
  children: React.ReactNode;
}

export function TaskNotificationProvider({ children }: TaskNotificationProviderProps) {
  // Mount the notification hook
  useTaskNotifications();
  
  return <>{children}</>;
}

