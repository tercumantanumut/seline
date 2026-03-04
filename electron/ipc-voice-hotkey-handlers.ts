import { ipcMain } from "electron";
import type { IpcHandlerContext } from "./ipc-handlers";
import {
  registerVoiceHotkey,
  registerVoiceHotkeyFromSettings,
  getRegisteredVoiceHotkey,
  clearVoiceHotkey,
} from "./hotkey-manager";

function normalizeAccelerator(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function registerVoiceHotkeyHandlers(ctx: IpcHandlerContext): void {
  ipcMain.handle("voice-hotkey:register", (_event, accelerator?: unknown) => {
    const input = normalizeAccelerator(accelerator);
    const result = registerVoiceHotkey({
      accelerator: input || getRegisteredVoiceHotkey(),
      onTrigger: () => {
        const win = ctx.mainWindow();
        if (!win) return;
        win.webContents.send("voice-hotkey:triggered");
      },
    });

    return result;
  });

  ipcMain.handle("voice-hotkey:registerFromSettings", () => {
    const result = registerVoiceHotkeyFromSettings({
      dataDir: ctx.dataDir,
      onTrigger: () => {
        const win = ctx.mainWindow();
        if (!win) return;
        win.webContents.send("voice-hotkey:triggered");
      },
    });

    return result;
  });

  ipcMain.handle("voice-hotkey:getRegistered", () => {
    return {
      accelerator: getRegisteredVoiceHotkey(),
    };
  });

  ipcMain.handle("voice-hotkey:clear", () => {
    clearVoiceHotkey();
    return { success: true };
  });
}
