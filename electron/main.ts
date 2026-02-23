import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { initializeRTK } from "../lib/rtk";

// ---------------------------------------------------------------------------
// Dev-mode detection
// Never rely on NODE_ENV alone because packaged apps can inherit
// NODE_ENV=development from a parent shell/launcher and accidentally boot
// the dev path (localhost:3000).
// ---------------------------------------------------------------------------

const isDev = !app.isPackaged;

// Keep dev data isolated from production builds to avoid DB collisions.
if (isDev) {
  try {
    const appName = app.getName();
    const devUserDataPath = path.join(app.getPath("appData"), `${appName}-dev`);
    app.setPath("userData", devUserDataPath);
    console.log("[Init] Using dev userData path:", devUserDataPath);
  } catch (error) {
    console.warn("[Init] Failed to set dev userData path:", error);
  }
}

// ---------------------------------------------------------------------------
// macOS PATH fix — must run before any child processes are spawned
// ---------------------------------------------------------------------------

/**
 * Fix PATH for macOS GUI apps.
 *
 * When Electron apps are launched from Finder/Dock (not terminal),
 * they don't inherit the user's shell PATH. This function adds
 * common Node.js installation paths to ensure npx/node are found.
 */
function fixMacOSPath(): void {
  if (process.platform !== "darwin") return;
  if (isDev) return; // Terminal launch has correct PATH

  const currentPath = process.env.PATH || "";
  const homeDir = process.env.HOME || "";

  const additionalPaths = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    `${homeDir}/.volta/bin`,
    `${homeDir}/.fnm/aliases/default/bin`,
    `${homeDir}/.local/bin`,
    "/usr/local/opt/node/bin",
    "/opt/local/bin",
  ];

  const pathsToAdd: string[] = [];

  for (const p of additionalPaths) {
    try {
      if (fs.existsSync(p) && !currentPath.includes(p)) {
        pathsToAdd.push(p);
      }
    } catch {
      // Ignore errors checking path existence
    }
  }

  // Handle NVM
  try {
    const nvmBaseDir = path.join(homeDir, ".nvm", "versions", "node");
    if (fs.existsSync(nvmBaseDir)) {
      for (const entry of fs.readdirSync(nvmBaseDir)) {
        const binPath = path.join(nvmBaseDir, entry, "bin");
        if (fs.existsSync(binPath) && !currentPath.includes(binPath)) {
          pathsToAdd.push(binPath);
        }
      }
    }
  } catch {
    // Ignore NVM path errors
  }

  // Handle Homebrew versioned Node.js (Apple Silicon)
  try {
    const homebrewOptDir = "/opt/homebrew/opt";
    if (fs.existsSync(homebrewOptDir)) {
      for (const entry of fs.readdirSync(homebrewOptDir)) {
        if (entry.startsWith("node@") || entry === "node") {
          const binPath = path.join(homebrewOptDir, entry, "bin");
          if (fs.existsSync(binPath) && !currentPath.includes(binPath)) {
            pathsToAdd.push(binPath);
          }
        }
      }
    }
  } catch {
    // Ignore Homebrew path errors
  }

  // Handle Homebrew versioned Node.js (Intel Mac)
  try {
    const localOptDir = "/usr/local/opt";
    if (fs.existsSync(localOptDir)) {
      for (const entry of fs.readdirSync(localOptDir)) {
        if (entry.startsWith("node@") || entry === "node") {
          const binPath = path.join(localOptDir, entry, "bin");
          if (fs.existsSync(binPath) && !currentPath.includes(binPath)) {
            pathsToAdd.push(binPath);
          }
        }
      }
    }
  } catch {
    // Ignore local opt path errors
  }

  if (pathsToAdd.length > 0) {
    process.env.PATH = [...pathsToAdd, currentPath].join(":");
    console.log("[PATH Fix] Added paths for macOS GUI launch:", pathsToAdd);
    console.log("[PATH Fix] New PATH:", process.env.PATH);
  }
}

fixMacOSPath();

// ---------------------------------------------------------------------------
// Environment / path setup
// ---------------------------------------------------------------------------

const userDataPath = app.getPath("userData");
process.env.ELECTRON_USER_DATA_PATH = userDataPath;
process.env.LOCAL_DATA_PATH = path.join(userDataPath, "data");

if (!process.env.INVIDIOUS_INSTANCE) {
  process.env.INVIDIOUS_INSTANCE = "https://yewtu.be";
}

const resourcesModelsDir = path.join(process.resourcesPath, "models");
const userModelsDir = path.join(userDataPath, "models");
const embeddingCacheDir = path.join(userDataPath, "models-cache");
process.env.EMBEDDING_CACHE_DIR = embeddingCacheDir;

// ---------------------------------------------------------------------------
// Module imports (after env is set so sub-modules see the correct paths)
// ---------------------------------------------------------------------------

import { initDebugLog, debugLog, debugError } from "./debug-logger";
import {
  mainWindow as getMainWindowRef,
  createWindow,
  registerLocalMediaProtocol,
} from "./window-manager";
import {
  startNextServer,
  stopNextServer,
  clearServerRestartTimer,
  waitForServerReady,
  PROD_SERVER_PORT,
} from "./next-server";
import { setupIpcHandlers, setupEmbeddingModelPaths } from "./ipc-handlers";

// ---------------------------------------------------------------------------
// Initialize debug log
// ---------------------------------------------------------------------------

initDebugLog({
  isDev,
  userDataPath,
  execPath: process.execPath,
  resourcesPath: process.resourcesPath,
});

// ---------------------------------------------------------------------------
// Ensure data directories
// ---------------------------------------------------------------------------

const dataDir = path.join(userDataPath, "data");
const mediaDir = path.join(dataDir, "media");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Initialize local embedding paths once data directories are ready
setupEmbeddingModelPaths({ userModelsDir, resourcesModelsDir, dataDir });

// ---------------------------------------------------------------------------
// App quitting flag
// ---------------------------------------------------------------------------

let isAppQuitting = false;

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  debugLog("\n========== APP READY ==========");
  debugLog("[App] Electron app is ready, starting initialization...");

  // Register custom protocol for local media files
  debugLog("[App] Registering local media protocol...");
  registerLocalMediaProtocol(mediaDir);

  debugLog("[App] Setting up IPC handlers...");
  setupIpcHandlers({
    mainWindow: () => {
      // window-manager exports mainWindow as a mutable let — re-read it each call
      const { mainWindow } = require("./window-manager") as typeof import("./window-manager");
      return mainWindow;
    },
    isDev,
    dataDir,
    mediaDir,
    userDataPath,
    userModelsDir,
    prodServerPort: PROD_SERVER_PORT,
  });

  try {
    await initializeRTK();
  } catch (error) {
    debugError("[RTK] Initialization failed:", error);
  }

  // Start Next.js server in production
  if (!isDev) {
    debugLog("[App] Production mode - starting Next.js server...");
    try {
      await startNextServer({
        userDataPath,
        isAppQuitting: () => isAppQuitting,
        getMainWindow: () => {
          const { mainWindow } = require("./window-manager") as typeof import("./window-manager");
          return mainWindow;
        },
      });
      debugLog("[App] Next.js server started successfully");
    } catch (error) {
      debugError("[App] Failed to start Next.js server:", error);
    }
  } else {
    debugLog("[App] Development mode - skipping embedded server");
  }

  debugLog("[App] Creating main window...");
  await createWindow({
    isDev,
    dataDir,
    mediaDir,
    prodServerPort: PROD_SERVER_PORT,
    preloadPath: path.join(__dirname, "preload.js"),
    devServerUrl: process.env.ELECTRON_DEV_URL || "http://localhost:3000",
    waitForServer: waitForServerReady,
  });
  debugLog("[App] Main window created");

  // On macOS, re-create window when dock icon is clicked and no windows exist
  app.on("activate", async () => {
    debugLog("[App] activate event fired");
    const { BrowserWindow } = await import("electron");
    if (BrowserWindow.getAllWindows().length === 0) {
      debugLog("[App] No windows open, creating new window");
      await createWindow({
        isDev,
        dataDir,
        mediaDir,
        prodServerPort: PROD_SERVER_PORT,
        preloadPath: path.join(__dirname, "preload.js"),
        devServerUrl: process.env.ELECTRON_DEV_URL || "http://localhost:3000",
        waitForServer: waitForServerReady,
      });
    }
  });

  debugLog("========== INITIALIZATION COMPLETE ==========\n");
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  debugLog("[App] window-all-closed event");
  stopNextServer();
  if (process.platform !== "darwin") {
    debugLog("[App] Non-macOS - quitting app");
    app.quit();
  }
});

// Clean up before quitting
app.on("before-quit", () => {
  debugLog("[App] before-quit event - cleaning up");
  isAppQuitting = true;
  clearServerRestartTimer();
  stopNextServer();
});

// Security: Prevent new webview creation
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    debugLog("[Security] Blocked webview attachment");
    event.preventDefault();
  });
});
