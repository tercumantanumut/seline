"use client";

import { useEffect, useCallback, useRef } from "react";

interface ElectronAPI {
  voiceHotkey?: {
    onTriggered: (callback: () => void) => (() => void) | undefined;
    register: (accelerator: string) => Promise<{ success: boolean; accelerator: string; error?: string }>;
    registerFromSettings: () => Promise<{ success: boolean; accelerator: string; error?: string }>;
    getRegistered: () => Promise<{ accelerator: string }>;
    clear: () => Promise<{ success: boolean }>;
  };
}

function getElectronAPI(): ElectronAPI["voiceHotkey"] | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  return api?.voiceHotkey ?? null;
}

/**
 * Hook that listens for global voice hotkey triggers from Electron.
 * Falls back to a keyboard shortcut listener in browser mode.
 */
export function useGlobalVoiceHotkey(options: {
  enabled: boolean;
  onTrigger: () => void;
  hotkey?: string;
}): void {
  const { enabled, onTrigger, hotkey } = options;
  const callbackRef = useRef(onTrigger);
  callbackRef.current = onTrigger;

  // Electron IPC path
  useEffect(() => {
    if (!enabled) return;

    const api = getElectronAPI();
    if (!api) return;

    const cleanup = api.onTriggered(() => {
      callbackRef.current();
    });

    return () => {
      cleanup?.();
    };
  }, [enabled]);

  // Register hotkey when it changes
  useEffect(() => {
    if (!enabled || !hotkey) return;

    const api = getElectronAPI();
    if (!api) return;

    void api.register(hotkey);
  }, [enabled, hotkey]);

  // Browser fallback: Cmd+Shift+Space / Ctrl+Shift+Space
  useEffect(() => {
    if (!enabled) return;

    const api = getElectronAPI();
    if (api) return; // Skip browser fallback when Electron is available

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.ctrlKey;
      if (isModifier && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        callbackRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
