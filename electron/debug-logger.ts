import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

// ---------------------------------------------------------------------------
// Paths (need to be resolved before first log call)
// ---------------------------------------------------------------------------

const userDataPath = app.getPath("userData");
export const DEBUG_LOG_FILE = path.join(userDataPath, "debug.log");

// ---------------------------------------------------------------------------
// Log buffer (for streaming to renderer)
// ---------------------------------------------------------------------------

export const LOG_BUFFER_MAX_SIZE = 1000;
export const logBuffer: { timestamp: string; level: string; message: string }[] = [];
export let logSubscribers = 0;

export function incrementLogSubscribers(): void {
  logSubscribers++;
}

export function decrementLogSubscribers(): void {
  logSubscribers = Math.max(0, logSubscribers - 1);
}

// ---------------------------------------------------------------------------
// Critical-error patterns (triggers toast notification in renderer)
// ---------------------------------------------------------------------------

export const CRITICAL_ERROR_PATTERNS = [
  { pattern: /No vector column found.*dimension/i, type: "dimension_mismatch" as const },
  { pattern: /embedding.*mismatch/i, type: "dimension_mismatch" as const },
];

// ---------------------------------------------------------------------------
// Renderer reference – injected lazily to avoid circular dependency with
// window-manager.ts.  Call setLogRendererWindow() once the window is created.
// ---------------------------------------------------------------------------

type RendererWindow = {
  isDestroyed(): boolean;
  webContents: { send(channel: string, ...args: unknown[]): void };
};

let rendererWindow: RendererWindow | null = null;

export function setLogRendererWindow(win: RendererWindow | null): void {
  rendererWindow = win;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Send a log entry to the renderer process if it is subscribed.
 */
export function sendLogToRenderer(level: string, message: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: message.trim(),
  };

  // Add to buffer
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX_SIZE) {
    logBuffer.shift();
  }

  // Send to renderer if window exists and has subscribers
  if (rendererWindow && !rendererWindow.isDestroyed() && logSubscribers > 0) {
    rendererWindow.webContents.send("logs:entry", entry);
  }

  // Check for critical errors and send toast notification
  for (const { pattern, type } of CRITICAL_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      if (rendererWindow && !rendererWindow.isDestroyed()) {
        rendererWindow.webContents.send("logs:critical", { type, message: entry.message });
      }
      break;
    }
  }
}

/**
 * Debug logger that writes to both console and a file for production debugging.
 */
export function debugLog(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const messageText = args.map(arg =>
    typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(" ");
  const message = `[${timestamp}] ${messageText}\n`;

  // Always log to console
  console.log(...args);

  // Stream to renderer
  sendLogToRenderer("info", messageText);

  // Also write to file for production debugging
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, message);
  } catch (e) {
    console.error("[Debug] Failed to write to log file:", e);
  }
}

/**
 * Debug error logger.
 */
export function debugError(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const messageText = args.map(arg =>
    typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(" ");
  const message = `[${timestamp}] [ERROR] ${messageText}\n`;

  console.error(...args);

  // Stream to renderer
  sendLogToRenderer("error", messageText);

  try {
    fs.appendFileSync(DEBUG_LOG_FILE, message);
  } catch (e) {
    console.error("[Debug] Failed to write to log file:", e);
  }
}

/**
 * Initialize the debug log file with a session header.
 */
export function initDebugLog(opts: {
  isDev: boolean;
  userDataPath: string;
  execPath: string;
  resourcesPath: string;
}): void {
  try {
    const header = `
================================================================================
ELECTRON APP DEBUG LOG
Started: ${new Date().toISOString()}
Platform: ${process.platform}
Arch: ${process.arch}
Electron Version: ${process.versions.electron}
Node Version: ${process.versions.node}
isDev: ${opts.isDev}
userDataPath: ${opts.userDataPath}
process.execPath: ${opts.execPath}
process.resourcesPath: ${opts.resourcesPath}
================================================================================
`;
    fs.writeFileSync(DEBUG_LOG_FILE, header);
    debugLog("[Debug] Log file initialized at:", DEBUG_LOG_FILE);
  } catch (e) {
    console.error("[Debug] Failed to initialize log file:", e);
  }
}
