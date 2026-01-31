import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script for secure IPC communication between main and renderer processes.
 * Uses contextBridge to safely expose limited functionality to the renderer.
 */

// Define the API to expose to the renderer process
const electronAPI = {
  // Platform information
  platform: process.platform,

  // Check if running in Electron
  isElectron: true,

  // Window controls (for custom title bar if needed)
  window: {
    minimize: (): void => {
      ipcRenderer.send("window:minimize");
    },
    maximize: (): void => {
      ipcRenderer.send("window:maximize");
    },
    close: (): void => {
      ipcRenderer.send("window:close");
    },
    isMaximized: (): Promise<boolean> => {
      return ipcRenderer.invoke("window:isMaximized");
    },
  },

  // App info
  app: {
    getVersion: (): Promise<string> => {
      return ipcRenderer.invoke("app:getVersion");
    },
    getName: (): Promise<string> => {
      return ipcRenderer.invoke("app:getName");
    },
    getDataPath: (): Promise<string> => {
      return ipcRenderer.invoke("app:getDataPath");
    },
    getMediaPath: (): Promise<string> => {
      return ipcRenderer.invoke("app:getMediaPath");
    },
  },

  // Shell operations (opening external links, etc.)
  shell: {
    openExternal: (url: string): Promise<void> => {
      return ipcRenderer.invoke("shell:openExternal", url);
    },
  },

  // Settings operations
  settings: {
    get: (): Promise<Record<string, unknown> | null> => {
      return ipcRenderer.invoke("settings:get");
    },
    save: (settings: Record<string, unknown>): Promise<boolean> => {
      return ipcRenderer.invoke("settings:save", settings);
    },
  },

  // File operations for local storage
  file: {
    read: (filePath: string): Promise<Buffer | null> => {
      return ipcRenderer.invoke("file:read", filePath);
    },
    write: (filePath: string, data: Buffer | string): Promise<boolean> => {
      return ipcRenderer.invoke("file:write", filePath, data);
    },
    delete: (filePath: string): Promise<boolean> => {
      return ipcRenderer.invoke("file:delete", filePath);
    },
    exists: (filePath: string): Promise<boolean> => {
      return ipcRenderer.invoke("file:exists", filePath);
    },
  },

  // Model download operations
  model: {
    getModelsDir: (): Promise<string> => {
      return ipcRenderer.invoke("model:getModelsDir");
    },
    checkExists: (modelId: string): Promise<boolean> => {
      return ipcRenderer.invoke("model:checkExists", modelId);
    },
    download: (modelId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("model:download", modelId);
    },
    onProgress: (callback: (data: { modelId: string; status: string; progress?: number; file?: string; error?: string }) => void): void => {
      ipcRenderer.on("model:downloadProgress", (_event, data) => callback(data));
    },
    removeProgressListener: (): void => {
      ipcRenderer.removeAllListeners("model:downloadProgress");
    },
  },

  // ComfyUI local backend operations
  comfyui: {
    checkStatus: (backendPath?: string): Promise<{
      dockerInstalled: boolean;
      imageBuilt: boolean;
      containerRunning: boolean;
      apiHealthy: boolean;
      modelsDownloaded: boolean;
      checkpointExists: boolean;
      loraExists: boolean;
    }> => {
      return ipcRenderer.invoke("comfyui:checkStatus", backendPath);
    },
    install: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("comfyui:install", backendPath);
    },
    downloadModels: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("comfyui:downloadModels", backendPath);
    },
    start: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("comfyui:start", backendPath);
    },
    stop: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("comfyui:stop", backendPath);
    },
    getDefaultPath: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke("comfyui:getDefaultPath");
    },
    fullSetup: (): Promise<{ success: boolean; backendPath?: string; error?: string }> => {
      return ipcRenderer.invoke("comfyui:fullSetup");
    },
    detectCustom: (options?: { host?: string; ports?: number[]; useHttps?: boolean }): Promise<{ baseUrl: string | null; source: string; error?: string }> => {
      return ipcRenderer.invoke("comfyuiCustom:detect", options);
    },
    resolveCustom: (override?: { comfyuiBaseUrl?: string; comfyuiHost?: string; comfyuiPort?: number }): Promise<{ baseUrl: string | null; source: string; error?: string }> => {
      return ipcRenderer.invoke("comfyuiCustom:resolve", override);
    },
    onInstallProgress: (callback: (data: {
      stage: string;
      progress: number;
      message: string;
      error?: string;
    }) => void): void => {
      ipcRenderer.on("comfyui:installProgress", (_event, data) => callback(data));
    },
    removeProgressListener: (): void => {
      ipcRenderer.removeAllListeners("comfyui:installProgress");
    },
  },

  // FLUX.2 Klein 4B backend operations
  flux2Klein4b: {
    checkStatus: (backendPath?: string): Promise<{
      dockerInstalled: boolean;
      imageBuilt: boolean;
      containerRunning: boolean;
      apiHealthy: boolean;
      modelsDownloaded: boolean;
    }> => {
      return ipcRenderer.invoke("flux2Klein4b:checkStatus", backendPath);
    },
    start: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein4b:start", backendPath);
    },
    stop: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein4b:stop", backendPath);
    },
    getDefaultPath: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein4b:getDefaultPath");
    },
    fullSetup: (): Promise<{ success: boolean; backendPath?: string; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein4b:fullSetup");
    },
    onInstallProgress: (callback: (data: {
      stage: string;
      progress: number;
      message: string;
      error?: string;
    }) => void): void => {
      ipcRenderer.on("flux2Klein4b:installProgress", (_event, data) => callback(data));
    },
    removeProgressListener: (): void => {
      ipcRenderer.removeAllListeners("flux2Klein4b:installProgress");
    },
  },

  // FLUX.2 Klein 9B backend operations
  flux2Klein9b: {
    checkStatus: (backendPath?: string): Promise<{
      dockerInstalled: boolean;
      imageBuilt: boolean;
      containerRunning: boolean;
      apiHealthy: boolean;
      modelsDownloaded: boolean;
    }> => {
      return ipcRenderer.invoke("flux2Klein9b:checkStatus", backendPath);
    },
    start: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein9b:start", backendPath);
    },
    stop: (backendPath?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein9b:stop", backendPath);
    },
    getDefaultPath: (): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein9b:getDefaultPath");
    },
    fullSetup: (): Promise<{ success: boolean; backendPath?: string; error?: string }> => {
      return ipcRenderer.invoke("flux2Klein9b:fullSetup");
    },
    onInstallProgress: (callback: (data: {
      stage: string;
      progress: number;
      message: string;
      error?: string;
    }) => void): void => {
      ipcRenderer.on("flux2Klein9b:installProgress", (_event, data) => callback(data));
    },
    removeProgressListener: (): void => {
      ipcRenderer.removeAllListeners("flux2Klein9b:installProgress");
    },
  },

  // Dev log streaming operations
  logs: {
    subscribe: (): void => {
      ipcRenderer.send("logs:subscribe");
    },
    unsubscribe: (): void => {
      ipcRenderer.send("logs:unsubscribe");
    },
    getBuffer: (): Promise<{ timestamp: string; level: string; message: string }[]> => {
      return ipcRenderer.invoke("logs:getBuffer");
    },
    clear: (): void => {
      ipcRenderer.send("logs:clear");
    },
    onEntry: (callback: (entry: { timestamp: string; level: string; message: string }) => void): void => {
      ipcRenderer.on("logs:entry", (_event, entry) => callback(entry));
    },
    onCritical: (callback: (data: { type: string; message: string }) => void): void => {
      ipcRenderer.on("logs:critical", (_event, data) => callback(data));
    },
    removeListeners: (): void => {
      ipcRenderer.removeAllListeners("logs:entry");
      ipcRenderer.removeAllListeners("logs:critical");
    },
  },

  // Command execution operations
  command: {
    execute: (options: {
      command: string;
      args: string[];
      cwd: string;
      characterId: string;
      timeout?: number;
    }): Promise<{
      success: boolean;
      stdout: string;
      stderr: string;
      exitCode: number | null;
      signal: string | null;
      error?: string;
      executionTime?: number;
    }> => {
      return ipcRenderer.invoke("command:execute", options);
    },
  },

  ipc: {
    send: (channel: string, ...args: unknown[]): void => {
      // Whitelist of allowed channels
      const validChannels = [
        "window:minimize",
        "window:maximize",
        "window:close",
        "logs:subscribe",
        "logs:unsubscribe",
        "logs:clear",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
      // Whitelist of allowed channels
      const validChannels = [
        "window:isMaximized",
        "app:getVersion",
        "app:getName",
        "app:getDataPath",
        "app:getMediaPath",
        "shell:openExternal",
        "settings:get",
        "settings:save",
        "file:read",
        "file:write",
        "file:delete",
        "file:exists",
        "model:getModelsDir",
        "model:checkExists",
        "model:download",
        "logs:getBuffer",
        "command:execute",
        "comfyui:checkStatus",
        "comfyui:install",
        "comfyui:downloadModels",
        "comfyui:start",
        "comfyui:stop",
        "comfyui:getDefaultPath",
        "comfyui:fullSetup",
        "comfyuiCustom:detect",
        "comfyuiCustom:resolve",
      ];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    },
    on: (channel: string, callback: (...args: unknown[]) => void): void => {
      // Whitelist of allowed channels
      const validChannels = ["window:maximized-changed", "model:downloadProgress", "logs:entry", "logs:critical", "comfyui:installProgress"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args));
      }
    },
    removeAllListeners: (channel: string): void => {
      const validChannels = ["window:maximized-changed", "model:downloadProgress", "logs:entry", "logs:critical", "comfyui:installProgress"];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Export the type for use in other files
export type ElectronAPIType = typeof electronAPI;
