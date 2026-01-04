import {
  app,
  BrowserWindow,
  Menu,
  shell,
  session,
  ipcMain,
  protocol,
  net,
  nativeTheme,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === "development";

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
type ThemePreference = "dark" | "light" | "system";
let currentThemePreference: ThemePreference = "system";
let themeListenerRegistered = false;

// Production server port
const PROD_SERVER_PORT = 3456;

// Set up user data path for local storage
const userDataPath = app.getPath("userData");
process.env.ELECTRON_USER_DATA_PATH = userDataPath;
process.env.LOCAL_DATA_PATH = path.join(userDataPath, "data");
const DEFAULT_INVIDIOUS_INSTANCE = "https://yewtu.be";
if (!process.env.INVIDIOUS_INSTANCE) {
  process.env.INVIDIOUS_INSTANCE = DEFAULT_INVIDIOUS_INSTANCE;
}

// Local embedding model paths (used by Transformers.js in the Next.js server)
const resourcesModelsDir = path.join(process.resourcesPath, "models");
const userModelsDir = path.join(userDataPath, "models");
const embeddingCacheDir = path.join(userDataPath, "models-cache");
process.env.EMBEDDING_CACHE_DIR = embeddingCacheDir;

// ============================================================================
// DEBUG LOGGING SYSTEM - WITH RENDERER STREAMING
// ============================================================================
const DEBUG_LOG_FILE = path.join(userDataPath, "debug.log");

// Log buffer for streaming to renderer (max 1000 entries)
const LOG_BUFFER_MAX_SIZE = 1000;
const logBuffer: { timestamp: string; level: string; message: string }[] = [];
let logSubscribers = 0;

// Patterns that indicate critical errors worth toasting
const CRITICAL_ERROR_PATTERNS = [
  { pattern: /No vector column found.*dimension/i, type: "dimension_mismatch" as const },
  { pattern: /embedding.*mismatch/i, type: "dimension_mismatch" as const },
];

/**
 * Send log entry to renderer if subscribed
 */
function sendLogToRenderer(level: string, message: string): void {
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
  if (mainWindow && logSubscribers > 0) {
    mainWindow.webContents.send("logs:entry", entry);
  }

  // Check for critical errors and send toast notification
  for (const { pattern, type } of CRITICAL_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      if (mainWindow) {
        mainWindow.webContents.send("logs:critical", { type, message: entry.message });
      }
      break;
    }
  }
}

/**
 * Debug logger that writes to both console and a file for production debugging
 */
function debugLog(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const messageText = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  const message = `[${timestamp}] ${messageText}\n`;

  // Always log to console
  console.log(...args);

  // Stream to renderer
  sendLogToRenderer("info", messageText);

  // Also write to file for production debugging
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, message);
  } catch (e) {
    console.error('[Debug] Failed to write to log file:', e);
  }
}

/**
 * Debug error logger
 */
function debugError(...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const messageText = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  const message = `[${timestamp}] [ERROR] ${messageText}\n`;

  console.error(...args);

  // Stream to renderer
  sendLogToRenderer("error", messageText);

  try {
    fs.appendFileSync(DEBUG_LOG_FILE, message);
  } catch (e) {
    console.error('[Debug] Failed to write to log file:', e);
  }
}

/**
 * Initialize debug log file with session header
 */
function initDebugLog(): void {
  try {
    const header = `
================================================================================
ELECTRON APP DEBUG LOG
Started: ${new Date().toISOString()}
Platform: ${process.platform}
Arch: ${process.arch}
Electron Version: ${process.versions.electron}
Node Version: ${process.versions.node}
isDev: ${isDev}
userDataPath: ${userDataPath}
process.execPath: ${process.execPath}
process.resourcesPath: ${process.resourcesPath}
================================================================================
`;
    fs.writeFileSync(DEBUG_LOG_FILE, header);
    debugLog('[Debug] Log file initialized at:', DEBUG_LOG_FILE);
  } catch (e) {
    console.error('[Debug] Failed to initialize log file:', e);
  }
}

/**
 * Log detailed directory contents recursively (limited depth)
 */
function logDirectoryContents(dirPath: string, prefix: string = '', depth: number = 0, maxDepth: number = 2): void {
  if (depth > maxDepth) return;

  try {
    if (!fs.existsSync(dirPath)) {
      debugLog(`${prefix}[DIR NOT FOUND] ${dirPath}`);
      return;
    }

    const items = fs.readdirSync(dirPath);
    debugLog(`${prefix}${dirPath}/ (${items.length} items)`);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          logDirectoryContents(itemPath, prefix + '  ', depth + 1, maxDepth);
        } else {
          debugLog(`${prefix}  ${item} (${stat.size} bytes)`);
        }
      } catch (e) {
        debugLog(`${prefix}  ${item} [ERROR: ${e}]`);
      }
    }
  } catch (e) {
    debugError(`${prefix}[ERROR reading ${dirPath}]:`, e);
  }
}

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

function setupEmbeddingModelPaths(): void {
  // Always set the user models dir (for downloads), even if no bundled models exist
  process.env.EMBEDDING_MODEL_DIR = userModelsDir;

  // Ensure the models directory exists for downloads
  if (!fs.existsSync(userModelsDir)) {
    fs.mkdirSync(userModelsDir, { recursive: true });
  }

  // Copy bundled models if they exist and user dir is empty
  if (fs.existsSync(resourcesModelsDir) && isDirectoryEmpty(userModelsDir)) {
    try {
      debugLog("[Embeddings] Copying bundled models to user data directory...");
      copyDirectoryRecursive(resourcesModelsDir, userModelsDir);
    } catch (error) {
      debugError("[Embeddings] Failed to copy local models:", error);
    }
  }

  debugLog("[Embeddings] Using local model dir:", userModelsDir);

  // Also save to settings.json so Next.js dev server can read it
  // (Next.js runs in a separate process without access to Electron env vars)
  try {
    const settingsPath = path.join(dataDir, "settings.json");
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    settings.embeddingModelDir = userModelsDir;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    debugLog("[Embeddings] Saved embeddingModelDir to settings.json");
  } catch (error) {
    debugError("[Embeddings] Failed to save embeddingModelDir to settings:", error);
  }
}

/**
 * Verify all required paths for standalone server
 */
function verifyStandalonePaths(): void {
  debugLog('\n=== PATH VERIFICATION ===');

  const resourcesPath = process.resourcesPath;
  debugLog('[Paths] process.resourcesPath:', resourcesPath);

  const standaloneDir = path.join(resourcesPath, 'standalone');
  const serverJs = path.join(standaloneDir, 'server.js');
  const staticDir = path.join(standaloneDir, '.next', 'static');
  const publicDir = path.join(standaloneDir, 'public');

  debugLog('[Paths] Expected locations:');
  debugLog('  - standaloneDir:', standaloneDir);
  debugLog('  - serverJs:', serverJs);
  debugLog('  - staticDir:', staticDir);
  debugLog('  - publicDir:', publicDir);

  debugLog('[Paths] Existence checks:');
  debugLog('  - standaloneDir exists:', fs.existsSync(standaloneDir));
  debugLog('  - serverJs exists:', fs.existsSync(serverJs));
  debugLog('  - staticDir exists:', fs.existsSync(staticDir));
  debugLog('  - publicDir exists:', fs.existsSync(publicDir));

  // Log contents of resources directory
  debugLog('\n=== RESOURCES DIRECTORY CONTENTS ===');
  logDirectoryContents(resourcesPath, '', 0, 3);

  debugLog('=== END PATH VERIFICATION ===\n');
}

/**
 * HTTP health check - poll server until it responds or timeout
 */
async function waitForServerReady(url: string, timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;
  let attempts = 0;

  debugLog(`[HealthCheck] Starting health check for ${url} (timeout: ${timeoutMs}ms)`);

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    try {
      debugLog(`[HealthCheck] Attempt ${attempts} - fetching ${url}`);
      const response = await net.fetch(url);
      debugLog(`[HealthCheck] Response status: ${response.status}`);

      if (response.ok || response.status === 200) {
        debugLog(`[HealthCheck] Server is ready after ${attempts} attempts (${Date.now() - startTime}ms)`);
        return true;
      }
    } catch (e) {
      debugLog(`[HealthCheck] Attempt ${attempts} failed:`, e instanceof Error ? e.message : e);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  debugError(`[HealthCheck] Server not ready after ${timeoutMs}ms and ${attempts} attempts`);
  return false;
}

// Initialize debug log on module load
initDebugLog();

// Ensure data directories exist
const dataDir = path.join(userDataPath, "data");
const mediaDir = path.join(dataDir, "media");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Initialize local embedding paths once data directories are ready
setupEmbeddingModelPaths();

function getThemePreferenceFromSettings(): ThemePreference {
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

function resolveThemePreference(theme: ThemePreference): "dark" | "light" {
  if (theme === "system") {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }
  return theme;
}

function getWindowBackgroundColor(theme: ThemePreference): string {
  return resolveThemePreference(theme) === "dark" ? "#1a1a1a" : "#f5e6d3";
}

function registerThemeListener(): void {
  if (themeListenerRegistered) return;
  nativeTheme.on("updated", () => {
    if (currentThemePreference !== "system") return;
    mainWindow?.setBackgroundColor(getWindowBackgroundColor("system"));
  });
  themeListenerRegistered = true;
}

/**
 * Register custom protocol for local media files
 * URL format: local-media:///sessionId/role/filename.ext
 */
function registerLocalMediaProtocol(): void {
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

/**
 * Create the main application window
 */
async function createWindow(): Promise<void> {
  debugLog('\n=== CREATING WINDOW ===');

  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const themePreference = getThemePreferenceFromSettings();

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
          "img-src 'self' data: blob: https:; " +
          "media-src 'self' data: blob: https://*.amazonaws.com https://*.cloudfront.net; " +
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // Protect against prototype pollution
      nodeIntegration: false, // Disable Node.js in renderer for security
      sandbox: true, // Enable sandbox for additional security
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false, // Don't show until ready to prevent visual flash
  });

  debugLog('[Window] BrowserWindow created');
  registerThemeListener();

  if (isWindows || isLinux) {
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

  // ============================================================================
  // DEBUG: Add error event handlers to catch page loading issues
  // ============================================================================

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    debugError('[Window] did-fail-load event:', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('[Window] did-finish-load - Page loaded successfully');
  });

  mainWindow.webContents.on('dom-ready', () => {
    debugLog('[Window] dom-ready - DOM is ready');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    debugError('[Window] render-process-gone:', details);
  });

  mainWindow.webContents.on('unresponsive', () => {
    debugError('[Window] webContents became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    debugLog('[Window] webContents became responsive again');
  });

  // Log console messages from the renderer
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelNames = ['verbose', 'info', 'warning', 'error'];
    debugLog(`[Renderer ${levelNames[level] || level}] ${message} (${sourceId}:${line})`);
  });

  // ============================================================================
  // Load the Next.js app
  // ============================================================================

  if (isDev) {
    // In development, load from Next.js dev server
    const devServerUrl = process.env.ELECTRON_DEV_URL || "http://localhost:3000";
    debugLog('[Window] Loading development URL:', devServerUrl);
    mainWindow.loadURL(devServerUrl);

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from embedded Next.js server
    const serverUrl = `http://localhost:${PROD_SERVER_PORT}`;

    debugLog('[Window] Production mode - checking server health before loading');

    // Wait for server to be ready before loading
    const isReady = await waitForServerReady(serverUrl, 30000);

    if (isReady) {
      debugLog('[Window] Server is ready, loading URL:', serverUrl);
    } else {
      debugError('[Window] Server health check failed, attempting to load anyway:', serverUrl);
    }

    mainWindow.loadURL(serverUrl);

    // DevTools should remain closed in production builds.
  }

  // Show window when ready to show (prevents white flash)
  mainWindow.once("ready-to-show", () => {
    debugLog('[Window] ready-to-show event fired');
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
    debugLog('[Window] will-navigate:', targetUrl);
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
    debugLog('[Window] Window closed');
    mainWindow = null;
  });

  debugLog('=== WINDOW CREATION COMPLETE ===\n');
}

/**
 * Start the embedded Next.js standalone server in production mode
 */
async function startNextServer(): Promise<void> {
  if (isDev) {
    debugLog('[Next.js] Skipping server start in development mode');
    return;
  }

  debugLog('\n=== STARTING NEXT.JS SERVER ===');

  // First, verify all paths
  verifyStandalonePaths();

  return new Promise((resolve, reject) => {
    // In production, the standalone server is in extraResources/standalone/server.js
    // process.resourcesPath points to the Resources folder in the app bundle
    const resourcesPath = process.resourcesPath;
    const standaloneServer = path.join(resourcesPath, "standalone", "server.js");
    const standaloneDir = path.dirname(standaloneServer);

    debugLog("[Next.js] Resources path:", resourcesPath);
    debugLog("[Next.js] Standalone server path:", standaloneServer);
    debugLog("[Next.js] Standalone dir:", standaloneDir);
    debugLog("[Next.js] Server exists:", fs.existsSync(standaloneServer));

    if (!fs.existsSync(standaloneServer)) {
      debugError("[Next.js] Standalone server not found at:", standaloneServer);
      reject(new Error(`Standalone server not found: ${standaloneServer}`));
      return;
    }

    // Log the server.js file size and first few bytes to confirm it's valid
    try {
      const serverStat = fs.statSync(standaloneServer);
      debugLog("[Next.js] server.js file size:", serverStat.size, "bytes");
      const serverContent = fs.readFileSync(standaloneServer, 'utf-8').slice(0, 500);
      debugLog("[Next.js] server.js first 500 chars:", serverContent);
    } catch (e) {
      debugError("[Next.js] Error reading server.js:", e);
    }

    debugLog("[Next.js] Spawning server process...");
    debugLog("[Next.js] Using execPath:", process.execPath);
    debugLog("[Next.js] Working directory:", standaloneDir);
    debugLog("[Next.js] Environment PORT:", PROD_SERVER_PORT);

    // Use ELECTRON_RUN_AS_NODE=1 to make Electron binary behave like Node.js
    // This is required because process.execPath in packaged Electron apps
    // points to the Electron binary, not a Node.js binary
    nextServer = spawn(process.execPath, [standaloneServer], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(PROD_SERVER_PORT),
        HOSTNAME: "localhost",
        ELECTRON_RUN_AS_NODE: "1", // Critical: Makes Electron binary run as Node.js
        LOCAL_DATA_PATH: path.join(userDataPath, "data"), // Ensure database path is passed
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    debugLog("[Next.js] Spawn called, pid:", nextServer.pid);

    nextServer.stdout?.on("data", (data) => {
      const output = data.toString();
      debugLog("[Next.js stdout]", output);
      if (output.includes("Ready") || output.includes("started server") || output.includes("Listening")) {
        debugLog("[Next.js] Server ready signal detected!");
        resolve();
      }
    });

    nextServer.stderr?.on("data", (data) => {
      debugError("[Next.js stderr]", data.toString());
    });

    nextServer.on("error", (error) => {
      debugError("[Next.js] Process spawn error:", error);
      reject(error);
    });

    nextServer.on("close", (code, signal) => {
      debugLog("[Next.js] Process closed with code:", code, "signal:", signal);
    });

    nextServer.on("exit", (code, signal) => {
      debugLog("[Next.js] Process exited with code:", code, "signal:", signal);
    });

    // Timeout fallback - assume server started after 5 seconds
    setTimeout(() => {
      debugLog("[Next.js] Timeout reached (5s), proceeding anyway");
      resolve();
    }, 5000);
  });
}

/**
 * Stop the Next.js server
 */
function stopNextServer(): void {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
}

/**
 * Set up IPC handlers for window controls and app info
 */
function setupIpcHandlers(): void {
  // Window controls
  ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:isMaximized", () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // Log streaming handlers
  ipcMain.on("logs:subscribe", () => {
    logSubscribers++;
    debugLog(`[Logs] Subscriber added (total: ${logSubscribers})`);
  });

  ipcMain.on("logs:unsubscribe", () => {
    logSubscribers = Math.max(0, logSubscribers - 1);
    debugLog(`[Logs] Subscriber removed (total: ${logSubscribers})`);
  });

  ipcMain.handle("logs:getBuffer", () => {
    return logBuffer;
  });

  ipcMain.on("logs:clear", () => {
    logBuffer.length = 0;
    debugLog("[Logs] Buffer cleared");
  });

  // App info
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

  // Settings handlers
  ipcMain.handle("settings:get", () => {
    const settingsPath = path.join(dataDir, "settings.json");
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    return null;
  });

  ipcMain.handle("settings:save", (_event, settings: Record<string, unknown>) => {
    const settingsPath = path.join(dataDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  });

  // File handlers for local storage
  ipcMain.handle("file:read", (_event, filePath: string) => {
    const fullPath = path.join(mediaDir, filePath);
    // Security check
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
    // Security check
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      throw new Error("Access denied");
    }
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, data);
    return true;
  });

  ipcMain.handle("file:delete", (_event, filePath: string) => {
    const fullPath = path.join(mediaDir, filePath);
    // Security check
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
    // Security check
    if (!path.normalize(fullPath).startsWith(mediaDir)) {
      return false;
    }
    return fs.existsSync(fullPath);
  });

  // Model download handlers
  ipcMain.handle("model:getModelsDir", () => {
    return userModelsDir;
  });

  ipcMain.handle("model:checkExists", async (_event, modelId: string) => {
    // Model ID format: "Xenova/bge-large-en-v1.5" -> path: models/Xenova/bge-large-en-v1.5
    const modelPath = path.join(userModelsDir, ...modelId.split("/"));
    // Check if config.json exists (indicates a valid downloaded model)
    return fs.existsSync(path.join(modelPath, "config.json"));
  });

  ipcMain.handle("model:download", async (event, modelId: string) => {
    try {
      // Dynamic import to avoid bundling issues
      const hub = await import("@huggingface/hub");
      const { listFiles, downloadFile } = hub;

      const destDir = path.join(userModelsDir, ...modelId.split("/"));

      // Ensure destination directory exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      debugLog(`[Model] Starting download: ${modelId} -> ${destDir}`);

      // First, list all files to get total count
      const files: { path: string; size?: number }[] = [];
      for await (const file of listFiles({ repo: modelId, recursive: true })) {
        // Skip directories (they have type "directory") and hidden files
        if (file.type === "file" && !file.path.startsWith(".git/")) {
          files.push({ path: file.path, size: file.size });
        }
      }

      const totalFiles = files.length;
      let downloadedFiles = 0;

      debugLog(`[Model] Found ${totalFiles} files to download`);

      event.sender.send("model:downloadProgress", {
        modelId,
        status: "downloading",
        progress: 0,
        totalFiles,
        downloadedFiles: 0,
        file: "Starting...",
      });

      // Download each file
      for (const file of files) {
        const filePath = path.join(destDir, file.path);
        const fileDir = path.dirname(filePath);

        // Ensure subdirectory exists
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        event.sender.send("model:downloadProgress", {
          modelId,
          status: "downloading",
          file: file.path,
          totalFiles,
          downloadedFiles,
          progress: Math.round((downloadedFiles / totalFiles) * 100),
        });

        // Download file
        const blob = await downloadFile({
          repo: modelId,
          path: file.path,
        });

        if (blob) {
          // Convert blob to buffer and write to file
          const buffer = await blob.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(buffer));
        }

        downloadedFiles++;
      }

      debugLog(`[Model] Download complete: ${modelId}`);
      event.sender.send("model:downloadProgress", {
        modelId,
        status: "completed",
        progress: 100,
        totalFiles,
        downloadedFiles: totalFiles,
      });

      return { success: true };
    } catch (error) {
      debugError(`[Model] Download failed: ${modelId}`, error);
      event.sender.send("model:downloadProgress", {
        modelId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Command execution handler - proxies to Next.js API
  ipcMain.handle("command:execute", async (_event, options: {
    command: string;
    args: string[];
    cwd: string;
    characterId: string;
    timeout?: number;
  }) => {
    try {
      debugLog("[Command] Executing command via API:", options.command, options.args);

      // Proxy to the Next.js API route which has access to the lib modules
      const serverPort = isDev ? 3000 : PROD_SERVER_PORT;
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

// App lifecycle events
app.whenReady().then(async () => {
  debugLog('\n========== APP READY ==========');
  debugLog('[App] Electron app is ready, starting initialization...');

  // Register custom protocol for local media files
  debugLog('[App] Registering local media protocol...');
  registerLocalMediaProtocol();

  debugLog('[App] Setting up IPC handlers...');
  setupIpcHandlers();

  // Start Next.js server in production
  if (!isDev) {
    debugLog('[App] Production mode - starting Next.js server...');
    try {
      await startNextServer();
      debugLog('[App] Next.js server started successfully');
    } catch (error) {
      debugError('[App] Failed to start Next.js server:', error);
    }
  } else {
    debugLog('[App] Development mode - skipping embedded server');
  }

  debugLog('[App] Creating main window...');
  await createWindow();
  debugLog('[App] Main window created');

  // On macOS, re-create window when dock icon is clicked and no windows exist
  app.on("activate", async () => {
    debugLog('[App] activate event fired');
    if (BrowserWindow.getAllWindows().length === 0) {
      debugLog('[App] No windows open, creating new window');
      await createWindow();
    }
  });

  debugLog('========== INITIALIZATION COMPLETE ==========\n');
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  debugLog('[App] window-all-closed event');
  stopNextServer();
  if (process.platform !== "darwin") {
    debugLog('[App] Non-macOS - quitting app');
    app.quit();
  }
});

// Clean up before quitting
app.on("before-quit", () => {
  debugLog('[App] before-quit event - cleaning up');
  stopNextServer();
});

// Security: Prevent new webview creation
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    debugLog('[Security] Blocked webview attachment');
    event.preventDefault();
  });
});

