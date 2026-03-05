import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";
import { getWindowBackgroundColor, currentThemePreference } from "./window-manager";

// ---------------------------------------------------------------------------
// Browser session windows — one per sessionId
// ---------------------------------------------------------------------------

const sessionWindows = new Map<string, BrowserWindow>();

/**
 * Register IPC handlers for dedicated browser session windows.
 */
export function registerBrowserSessionHandlers(ctx: IpcHandlerContext): void {
  ipcMain.handle("browser-session:open", async (_event, sessionId: string) => {
    if (!sessionId) return { success: false, error: "No sessionId provided" };

    // If window already exists, focus it
    const existing = sessionWindows.get(sessionId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { success: true, reused: true };
    }

    try {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        title: `Browser Session`,
        backgroundColor: getWindowBackgroundColor(currentThemePreference),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
        show: false,
      });

      sessionWindows.set(sessionId, win);

      // Load the dedicated browser session page
      const baseUrl = ctx.isDev
        ? (process.env.ELECTRON_DEV_URL || "http://localhost:3000")
        : `http://localhost:${ctx.prodServerPort}`;

      await win.loadURL(`${baseUrl}/browser-session?sessionId=${sessionId}`);

      win.once("ready-to-show", () => {
        win.show();
        win.focus();
      });

      win.on("closed", () => {
        sessionWindows.delete(sessionId);
        debugLog(`[BrowserSession] Window closed for session ${sessionId.slice(0, 8)}…`);
      });

      debugLog(`[BrowserSession] Opened window for session ${sessionId.slice(0, 8)}…`);
      return { success: true };
    } catch (error) {
      debugError(`[BrowserSession] Failed to open window:`, error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("browser-session:close", (_event, sessionId: string) => {
    const win = sessionWindows.get(sessionId);
    if (win && !win.isDestroyed()) {
      win.close();
      sessionWindows.delete(sessionId);
      return { success: true };
    }
    return { success: false, error: "No window found" };
  });

  ipcMain.handle("browser-session:is-open", (_event, sessionId: string) => {
    const win = sessionWindows.get(sessionId);
    return { open: !!win && !win.isDestroyed() };
  });

  ipcMain.handle("browser-session:save-recording", async (_event, options: { defaultPath?: string }) => {
    const { dialog } = await import("electron");
    const result = await dialog.showSaveDialog({
      title: "Save Browser Recording",
      defaultPath: options?.defaultPath || "browser-recording.webm",
      filters: [
        { name: "WebM Video", extensions: ["webm"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePath };
  });
}

/**
 * Close all browser session windows. Called on app quit.
 */
export function closeAllBrowserSessionWindows(): void {
  for (const [sessionId, win] of sessionWindows) {
    if (!win.isDestroyed()) {
      win.close();
    }
    sessionWindows.delete(sessionId);
  }
  debugLog("[BrowserSession] All session windows closed");
}
