import {
  ipcMain,
  app,
  shell,
  dialog,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { debugLog, debugError, logBuffer, incrementLogSubscribers, decrementLogSubscribers } from "./debug-logger";
import type { BrowserWindow } from "electron";
import { registerComfyUIHandlers } from "./ipc-comfyui-handlers";
import { registerFlux2Handlers } from "./ipc-flux2-handlers";
import { registerModelHandlers } from "./ipc-model-handlers";
import { registerFileHandlers } from "./ipc-file-handlers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IpcHandlerContext {
  mainWindow: () => BrowserWindow | null;
  isDev: boolean;
  dataDir: string;
  mediaDir: string;
  userDataPath: string;
  userModelsDir: string;
  prodServerPort: number;
}

// ---------------------------------------------------------------------------
// Internal helpers used only within IPC handlers
// ---------------------------------------------------------------------------

function isDirectoryEmpty(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return true;
  const entries = fs.readdirSync(dirPath);
  return entries.length === 0;
}

function copyDirectoryRecursive(source: string, destination: string): void {
  if (!fs.existsSync(source)) return;
  const stats = fs.statSync(source);
  if (stats.isDirectory()) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    for (const entry of fs.readdirSync(source)) {
      copyDirectoryRecursive(path.join(source, entry), path.join(destination, entry));
    }
  } else {
    fs.copyFileSync(source, destination);
  }
}

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

/**
 * Register all IPC handlers.  Call once from app.whenReady().
 */
export function setupIpcHandlers(ctx: IpcHandlerContext): void {
  const { mainWindow, dataDir, mediaDir } = ctx;

  // --------------------------------------------------------------------------
  // Window controls
  // --------------------------------------------------------------------------

  ipcMain.on("window:minimize", () => {
    mainWindow()?.minimize();
  });

  ipcMain.on("window:maximize", () => {
    const win = mainWindow();
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    mainWindow()?.close();
  });

  ipcMain.handle("window:isMaximized", () => {
    return mainWindow()?.isMaximized() ?? false;
  });

  // --------------------------------------------------------------------------
  // Log streaming handlers
  // --------------------------------------------------------------------------

  ipcMain.on("logs:subscribe", () => {
    incrementLogSubscribers();
    debugLog(`[Logs] Subscriber added`);
  });

  ipcMain.on("logs:unsubscribe", () => {
    decrementLogSubscribers();
    debugLog(`[Logs] Subscriber removed`);
  });

  ipcMain.handle("logs:getBuffer", () => {
    return logBuffer;
  });

  ipcMain.on("logs:clear", () => {
    logBuffer.length = 0;
    debugLog("[Logs] Buffer cleared");
  });

  // --------------------------------------------------------------------------
  // App info
  // --------------------------------------------------------------------------

  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:getName", () => {
    return app.getName();
  });

  ipcMain.handle("app:getDataPath", () => {
    return dataDir;
  });

  ipcMain.handle("app:getMediaPath", () => {
    return mediaDir;
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
    return shell.openPath(targetPath);
  });

  ipcMain.handle("dialog:selectFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // --------------------------------------------------------------------------
  // Delegate to sub-registrars
  // --------------------------------------------------------------------------

  registerFileHandlers(ctx);
  registerModelHandlers(ctx);
  registerComfyUIHandlers(ctx);
  registerFlux2Handlers(ctx);
}

// ---------------------------------------------------------------------------
// Embedding model setup (called once at startup, before window is ready)
// ---------------------------------------------------------------------------

export function setupEmbeddingModelPaths(opts: {
  userModelsDir: string;
  resourcesModelsDir: string;
  dataDir: string;
}): void {
  process.env.EMBEDDING_MODEL_DIR = opts.userModelsDir;

  if (!fs.existsSync(opts.userModelsDir)) {
    fs.mkdirSync(opts.userModelsDir, { recursive: true });
  }

  function localIsDirectoryEmpty(dirPath: string): boolean {
    if (!fs.existsSync(dirPath)) return true;
    return fs.readdirSync(dirPath).length === 0;
  }

  if (fs.existsSync(opts.resourcesModelsDir) && localIsDirectoryEmpty(opts.userModelsDir)) {
    try {
      debugLog("[Embeddings] Copying bundled models to user data directory...");
      copyDirectoryRecursive(opts.resourcesModelsDir, opts.userModelsDir);
    } catch (error) {
      debugError("[Embeddings] Failed to copy local models:", error);
    }
  }

  debugLog("[Embeddings] Using local model dir:", opts.userModelsDir);

  try {
    const settingsPath = path.join(opts.dataDir, "settings.json");
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    settings.embeddingModelDir = opts.userModelsDir;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    debugLog("[Embeddings] Saved embeddingModelDir to settings.json");
  } catch (error) {
    debugError("[Embeddings] Failed to save embeddingModelDir to settings:", error);
  }
}
