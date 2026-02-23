import {
  app,
  BrowserWindow,
  Menu,
  shell,
  session,
  protocol,
  net,
  nativeTheme,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { debugLog, debugError, setLogRendererWindow } from "./debug-logger";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

export let mainWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

export type ThemePreference = "dark" | "light" | "system";
export let currentThemePreference: ThemePreference = "system";
let themeListenerRegistered = false;

export function getThemePreferenceFromSettings(dataDir: string): ThemePreference {
  try {
    const settingsPath = path.join(dataDir, "settings.json");
    if (!fs.existsSync(settingsPath)) return "system";
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const theme = settings?.theme;
    if (theme === "dark" || theme === "light" || theme === "system") {
      return theme;
    }
  } catch (error) {
    debugError("[Theme] Failed to read settings theme:", error);
  }
  return "system";
}

export function resolveThemePreference(theme: ThemePreference): "dark" | "light" {
  if (theme === "system") {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }
  return theme;
}

export function getWindowBackgroundColor(theme: ThemePreference): string {
  return resolveThemePreference(theme) === "dark" ? "#1a1a1a" : "#f5e6d3";
}

export function registerThemeListener(): void {
  if (themeListenerRegistered) return;
  nativeTheme.on("updated", () => {
    if (currentThemePreference !== "system") return;
    mainWindow?.setBackgroundColor(getWindowBackgroundColor("system"));
  });
  themeListenerRegistered = true;
}

// ---------------------------------------------------------------------------
// Local-media protocol
// ---------------------------------------------------------------------------

/**
 * Register custom protocol for local media files.
 * URL format: local-media:///sessionId/role/filename.ext
 */
export function registerLocalMediaProtocol(mediaDir: string): void {
  protocol.handle("local-media", (request) => {
    try {
      // Parse the URL - format is local-media:///path/to/file
      const url = new URL(request.url);
      // Get pathname and remove leading slashes, decode URI
      let filePath = decodeURIComponent(url.pathname);
      // Remove leading slashes (pathname starts with /)
      filePath = filePath.replace(/^\/+/, "");

      // Build full path to the file
      const fullPath = path.join(mediaDir, filePath);

      console.log("[Protocol] Handling local-media request:", {
        requestUrl: request.url,
        pathname: url.pathname,
        filePath,
        fullPath,
        mediaDir,
      });

      // Security: ensure the path is within the media directory
      const normalizedPath = path.normalize(fullPath);
      const normalizedMediaDir = path.normalize(mediaDir);
      if (!normalizedPath.startsWith(normalizedMediaDir)) {
        console.error("[Protocol] Forbidden - path escapes media directory:", normalizedPath);
        return new Response("Forbidden", { status: 403 });
      }

      // Check if file exists
      if (!fs.existsSync(normalizedPath)) {
        console.error("[Protocol] File not found:", normalizedPath);
        return new Response(`File not found: ${filePath}`, { status: 404 });
      }

      console.log("[Protocol] Serving file:", normalizedPath);
      // Return the file using net.fetch with file:// protocol
      return net.fetch(`file://${normalizedPath}`);
    } catch (error) {
      console.error("[Protocol] Error handling request:", error);
      return new Response(`Internal Server Error: ${error}`, { status: 500 });
    }
  });
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

export interface CreateWindowOptions {
  isDev: boolean;
  dataDir: string;
  mediaDir: string;
  prodServerPort: number;
  preloadPath: string;
  devServerUrl: string;
  waitForServer: (url: string, timeoutMs: number) => Promise<boolean>;
}

/**
 * Create the main application window.
 */
export async function createWindow(opts: CreateWindowOptions): Promise<void> {
  debugLog("\n=== CREATING WINDOW ===");

  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const themePreference = getThemePreferenceFromSettings(opts.dataDir);

  currentThemePreference = themePreference;
  nativeTheme.themeSource = themePreference;
  const windowBackgroundColor = getWindowBackgroundColor(themePreference);

  // Configure Content Security Policy for the session
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob: https: http://localhost:*; " +
          "media-src 'self' data: blob: https://*.amazonaws.com https://*.cloudfront.net http://localhost:*; " +
          "connect-src 'self' https://api.anthropic.com https://openrouter.ai ws://localhost:* http://localhost:*; " +
          "worker-src 'self' blob:; " +
          "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;",
        ],
      },
    });
  });

  // Create the browser window with secure settings
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "Seline",
    backgroundColor: windowBackgroundColor,
    autoHideMenuBar: isWindows || isLinux,
    ...(isMac
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    ...(isWindows ? { frame: false } : {}),
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true, // Protect against prototype pollution
      nodeIntegration: false, // Disable Node.js in renderer for security
      sandbox: true, // Enable sandbox for additional security
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false, // Don't show until ready to prevent visual flash
  });

  debugLog("[Window] BrowserWindow created");
  registerThemeListener();

  // Expose window reference to the logger so log entries can be streamed
  setLogRendererWindow(mainWindow);

  if (isWindows || isLinux) {
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

  // ============================================================================
  // DEBUG: Add error event handlers to catch page loading issues
  // ============================================================================

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    debugError("[Window] did-fail-load event:", {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });

  mainWindow.webContents.on("did-finish-load", () => {
    debugLog("[Window] did-finish-load - Page loaded successfully");
  });

  mainWindow.webContents.on("dom-ready", () => {
    debugLog("[Window] dom-ready - DOM is ready");
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    debugError("[Window] render-process-gone:", details);
  });

  mainWindow.webContents.on("unresponsive", () => {
    debugError("[Window] webContents became unresponsive");
  });

  mainWindow.webContents.on("responsive", () => {
    debugLog("[Window] webContents became responsive again");
  });

  // Log console messages from the renderer
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelNames = ["verbose", "info", "warning", "error"];
    debugLog(`[Renderer ${levelNames[level] || level}] ${message} (${sourceId}:${line})`);
  });

  // ============================================================================
  // Load the Next.js app
  // ============================================================================

  if (opts.isDev) {
    // In development, load from Next.js dev server
    debugLog("[Window] Loading development URL:", opts.devServerUrl);
    mainWindow.loadURL(opts.devServerUrl);

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from embedded Next.js server
    const serverUrl = `http://localhost:${opts.prodServerPort}`;

    debugLog("[Window] Production mode - checking server health before loading");

    // Wait for server to be ready before loading
    const isReady = await opts.waitForServer(serverUrl, 30000);

    if (isReady) {
      debugLog("[Window] Server is ready, loading URL:", serverUrl);
    } else {
      debugError("[Window] Server health check failed, attempting to load anyway:", serverUrl);
    }

    mainWindow.loadURL(serverUrl);

    // DevTools should remain closed in production builds.
  }

  // Show window when ready to show (prevents white flash)
  mainWindow.once("ready-to-show", () => {
    debugLog("[Window] ready-to-show event fired");
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    // Allow same-origin navigation
    if (targetUrl.startsWith("http://localhost") || targetUrl.startsWith("file://")) {
      return { action: "allow" };
    }
    // Open external links in default browser
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  // Handle navigation for external links
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    debugLog("[Window] will-navigate:", targetUrl);
    const parsedUrl = new URL(targetUrl);
    // Allow localhost and file protocol
    if (
      parsedUrl.hostname === "localhost" ||
      parsedUrl.protocol === "file:"
    ) {
      return;
    }
    // Block and open external URLs in default browser
    event.preventDefault();
    shell.openExternal(targetUrl);
  });

  // Clean up on close
  mainWindow.on("closed", () => {
    debugLog("[Window] Window closed");
    mainWindow = null;
    setLogRendererWindow(null);
  });

  debugLog("=== WINDOW CREATION COMPLETE ===\n");
}

// ---------------------------------------------------------------------------
// App activate handler (macOS re-open)
// ---------------------------------------------------------------------------

export async function handleActivate(createWindowFn: () => Promise<void>): Promise<void> {
  debugLog("[App] activate event fired");
  if (BrowserWindow.getAllWindows().length === 0) {
    debugLog("[App] No windows open, creating new window");
    await createWindowFn();
  }
}
