import { globalShortcut } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { debugError, debugLog } from "./debug-logger";

const DEFAULT_VOICE_HOTKEY = "CommandOrControl+Shift+Space";

let registeredHotkey: string | null = null;

function readVoiceHotkeyFromSettings(dataDir: string): string {
  try {
    const settingsPath = path.join(dataDir, "settings.json");
    if (!fs.existsSync(settingsPath)) {
      return DEFAULT_VOICE_HOTKEY;
    }

    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { voiceHotkey?: unknown };
    if (typeof parsed.voiceHotkey === "string" && parsed.voiceHotkey.trim().length > 0) {
      return parsed.voiceHotkey.trim();
    }
  } catch (error) {
    debugError("[VoiceHotkey] Failed to read settings hotkey:", error);
  }

  return DEFAULT_VOICE_HOTKEY;
}

function unregisterCurrentHotkey(): void {
  if (!registeredHotkey) {
    return;
  }

  try {
    globalShortcut.unregister(registeredHotkey);
  } catch (error) {
    debugError("[VoiceHotkey] Failed to unregister hotkey:", error);
  }

  registeredHotkey = null;
}

export function registerVoiceHotkey(options: {
  accelerator: string;
  onTrigger: () => void;
}): { success: boolean; accelerator: string; error?: string } {
  const accelerator = options.accelerator.trim() || DEFAULT_VOICE_HOTKEY;

  unregisterCurrentHotkey();

  try {
    const ok = globalShortcut.register(accelerator, () => {
      try {
        options.onTrigger();
      } catch (error) {
        debugError("[VoiceHotkey] Trigger callback failed:", error);
      }
    });

    if (!ok) {
      return {
        success: false,
        accelerator,
        error: `Failed to register global shortcut: ${accelerator}`,
      };
    }

    registeredHotkey = accelerator;
    debugLog(`[VoiceHotkey] Registered: ${accelerator}`);

    return { success: true, accelerator };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugError("[VoiceHotkey] Registration error:", error);
    return {
      success: false,
      accelerator,
      error: message,
    };
  }
}

export function registerVoiceHotkeyFromSettings(options: {
  dataDir: string;
  onTrigger: () => void;
}): { success: boolean; accelerator: string; error?: string } {
  const accelerator = readVoiceHotkeyFromSettings(options.dataDir);
  return registerVoiceHotkey({ accelerator, onTrigger: options.onTrigger });
}

export function getRegisteredVoiceHotkey(): string {
  return registeredHotkey || DEFAULT_VOICE_HOTKEY;
}

export function clearVoiceHotkey(): void {
  unregisterCurrentHotkey();
}
