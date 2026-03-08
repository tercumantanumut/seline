"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useVectorSyncStatus } from "@/hooks/use-vector-sync-status";

const VECTOR_DIMENSION_PATTERNS = [
  /No vector column found.*dimension/i,
  /embedding.*mismatch/i,
  /dimension.*mismatch/i,
  /different dimensions/i,
  /vector dimension/i,
];

const WATCHER_RESOURCE_PATTERNS = [
  /EMFILE/i,
  /EBADF/i,
  /EAGAIN/i,
  /too many open files/i,
  /file descriptor/i,
];

/**
 * Listens for runtime vector issues and nudges users with plain-language recovery guidance.
 */
export function VectorWarningListener() {
  const t = useTranslations("vectorSearch");
  const { status } = useVectorSyncStatus();
  const lastToastAtRef = useRef(0);
  const lastWatcherIssueByFolderRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (typeof window === "undefined") return;

    // In Electron builds, keep using native critical log events.
    if (window.electronAPI?.logs) {
      const electron = window.electronAPI;
      electron.logs.subscribe();
      electron.logs.onCritical((data: { type: string; message: string }) => {
        if (data.type === "dimension_mismatch") {
          if (Date.now() - lastToastAtRef.current < 30_000) {
            return;
          }
          lastToastAtRef.current = Date.now();
          toast.warning(t("indexMismatch"), { duration: 9000 });
        }
      });

      return () => {
        electron.logs.unsubscribe();
        electron.logs.removeListeners();
      };
    }

    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      originalError(...args);

      const message = args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" ");

      if (VECTOR_DIMENSION_PATTERNS.some((pattern) => pattern.test(message))) {
        if (Date.now() - lastToastAtRef.current < 30_000) {
          return;
        }
        lastToastAtRef.current = Date.now();
        toast.warning(t("indexMismatch"), { duration: 9000 });
      }
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    const nextSeen = new Map<string, string>();

    for (const folder of status.recentErrors) {
      const lastError = folder.lastError;
      if (!lastError || !WATCHER_RESOURCE_PATTERNS.some((pattern) => pattern.test(lastError))) {
        continue;
      }

      nextSeen.set(folder.id, lastError);

      if (lastWatcherIssueByFolderRef.current.get(folder.id) === lastError) {
        continue;
      }

      lastWatcherIssueByFolderRef.current.set(folder.id, lastError);
      const folderName = folder.displayName || folder.folderPath.split(/[/\\]/).pop() || folder.folderPath;

      toast.warning("Folder sync paused to protect app stability", {
        duration: 12000,
        description:
          `${folderName} hit the file descriptor limit. ` +
          `Exclude .venv, venv, env, __pycache__, site-packages, node_modules, and large image/font folders, ` +
          `or sync a smaller subfolder, then resume sync.`,
      });
    }

    for (const folderId of Array.from(lastWatcherIssueByFolderRef.current.keys())) {
      if (!nextSeen.has(folderId)) {
        lastWatcherIssueByFolderRef.current.delete(folderId);
      }
    }
  }, [status.recentErrors]);

  return null;
}
