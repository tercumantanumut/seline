import {
  ipcMain,
  net,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { initializeRTK } from "../lib/rtk";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

export function registerFileHandlers(ctx: IpcHandlerContext): void {
  const { isDev, dataDir, mediaDir, prodServerPort } = ctx;

  // --------------------------------------------------------------------------
  // Settings handlers
  // --------------------------------------------------------------------------

  ipcMain.handle("settings:get", () => {
    const settingsPath = path.join(dataDir, "settings.json");
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    return null;
  });

  ipcMain.handle("settings:save", async (_event, settings: Record<string, unknown>) => {
    const settingsPath = path.join(dataDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Re-initialize RTK when related experimental flags change.
    if (
      Object.prototype.hasOwnProperty.call(settings, "rtkEnabled")
      || Object.prototype.hasOwnProperty.call(settings, "rtkVerbosity")
      || Object.prototype.hasOwnProperty.call(settings, "rtkUltraCompact")
    ) {
      try {
        await initializeRTK();
      } catch (error) {
        debugError("[RTK] Failed to apply updated settings:", error);
      }
    }

    return true;
  });

  // --------------------------------------------------------------------------
  // File handlers for local storage
  // --------------------------------------------------------------------------

  ipcMain.handle("file:read", (_event, filePath: string) => {
    const fullPath = path.join(mediaDir, filePath);
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      throw new Error("Access denied");
    }
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath);
    }
    return null;
  });

  ipcMain.handle("file:write", (_event, filePath: string, data: Buffer | string) => {
    const fullPath = path.join(mediaDir, filePath);
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      throw new Error("Access denied");
    }
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, data);
    return true;
  });

  ipcMain.handle("file:delete", (_event, filePath: string) => {
    const fullPath = path.join(mediaDir, filePath);
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      throw new Error("Access denied");
    }
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  });

  ipcMain.handle("file:exists", (_event, filePath: string) => {
    const fullPath = path.join(mediaDir, filePath);
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      return false;
    }
    return fs.existsSync(fullPath);
  });

  // --------------------------------------------------------------------------
  // Command execution handler - proxies to Next.js API
  // --------------------------------------------------------------------------

  ipcMain.handle("command:execute", async (_event, options: {
    command: string;
    args: string[];
    cwd: string;
    characterId: string;
    timeout?: number;
  }) => {
    try {
      debugLog("[Command] Executing command via API:", options.command, options.args);

      const serverPort = isDev ? 3000 : prodServerPort;
      const apiUrl = `http://localhost:${serverPort}/api/execute-command`;

      const response = await net.fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      const result = await response.json() as {
        success: boolean;
        stdout: string;
        stderr: string;
        exitCode: number | null;
        signal: string | null;
        error?: string;
      };

      debugLog("[Command] Result:", result.success ? "success" : "failed", result.exitCode);
      return result;
    } catch (error) {
      debugError("[Command] Execution error:", error);
      return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
