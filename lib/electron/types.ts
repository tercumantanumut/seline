/**
 * Type definitions for the Electron API exposed via contextBridge.
 * This allows type-safe access to Electron functionality from the renderer process.
 */

export interface ElectronWindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
}

export interface ElectronAppAPI {
  getVersion: () => Promise<string>;
  getName: () => Promise<string>;
}

export interface ElectronShellAPI {
  openExternal: (url: string) => Promise<void>;
}

export interface ElectronIpcAPI {
  send: (channel: string, ...args: unknown[]) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

export interface ModelDownloadProgress {
  modelId: string;
  status: "downloading" | "completed" | "error";
  progress?: number;
  totalFiles?: number;
  downloadedFiles?: number;
  file?: string;
  error?: string;
}

export interface ElectronModelAPI {
  getModelsDir: () => Promise<string>;
  checkExists: (modelId: string) => Promise<boolean>;
  download: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  onProgress: (callback: (data: ModelDownloadProgress) => void) => void;
  removeProgressListener: () => void;
}

export interface ElectronAPI {
  platform: NodeJS.Platform;
  isElectron: boolean;
  window: ElectronWindowAPI;
  app: ElectronAppAPI;
  shell: ElectronShellAPI;
  ipc: ElectronIpcAPI;
  model: ElectronModelAPI;
}

/**
 * Check if the app is running in Electron
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && "electronAPI" in window;
}

/**
 * Get the Electron API if available
 */
export function getElectronAPI(): ElectronAPI | null {
  if (isElectron()) {
    return (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
  }
  return null;
}

/**
 * Open an external URL in the default browser
 * Works both in Electron and regular browser environments
 */
export async function openExternalUrl(url: string): Promise<void> {
  const electronAPI = getElectronAPI();
  if (electronAPI) {
    await electronAPI.shell.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Note: Window.electronAPI is declared in electron/preload.ts
// This file only provides type definitions for use in the renderer process
