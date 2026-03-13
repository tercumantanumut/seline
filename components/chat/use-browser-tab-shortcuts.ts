"use client";

import { useEffect } from "react";
import type { ChatWorkspaceTab } from "@/lib/stores/chat-workspace-store";

interface UseBrowserTabShortcutsOptions {
  enabled: boolean;
  tabs: ChatWorkspaceTab[];
  activeSessionId: string | null;
  onActivateSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onNewSession: () => void;
  onReopenLastClosed: () => void;
}

export function useBrowserTabShortcuts({
  enabled,
  tabs,
  activeSessionId,
  onActivateSession,
  onCloseSession,
  onNewSession,
  onReopenLastClosed,
}: UseBrowserTabShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl+Shift+T — reopen last closed tab
      if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        onReopenLastClosed();
        return;
      }

      // Cmd/Ctrl+T — new tab
      if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        onNewSession();
        return;
      }

      // Cmd/Ctrl+W — close active tab
      if (cmdOrCtrl && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeSessionId) {
          onCloseSession(activeSessionId);
        }
        return;
      }

      // Ctrl+Shift+Tab — previous tab
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length === 0 || !activeSessionId) {
          return;
        }
        const currentIndex = tabs.findIndex(
          (tab) => tab.sessionId === activeSessionId,
        );
        const prevIndex =
          currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
        onActivateSession(tabs[prevIndex].sessionId);
        return;
      }

      // Ctrl+Tab — next tab
      if (e.ctrlKey && !e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length === 0 || !activeSessionId) {
          return;
        }
        const currentIndex = tabs.findIndex(
          (tab) => tab.sessionId === activeSessionId,
        );
        const nextIndex =
          currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
        onActivateSession(tabs[nextIndex].sessionId);
        return;
      }

      // Cmd/Ctrl+1 through Cmd/Ctrl+9 — activate nth tab
      if (cmdOrCtrl && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        if (tabs.length === 0) {
          return;
        }
        const n = parseInt(e.key, 10);
        // 9 always activates the last tab
        const targetIndex = n === 9 ? tabs.length - 1 : n - 1;
        if (targetIndex < tabs.length) {
          onActivateSession(tabs[targetIndex].sessionId);
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    enabled,
    tabs,
    activeSessionId,
    onActivateSession,
    onCloseSession,
    onNewSession,
    onReopenLastClosed,
  ]);
}
