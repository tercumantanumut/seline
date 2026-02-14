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
  dialog,
  utilityProcess,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import { spawn, exec } from "child_process";
import { listFiles, downloadFile } from "@huggingface/hub";
import { initializeRTK } from "../lib/rtk";

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === "development";

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

/**
 * Fix PATH for macOS GUI apps
 *
 * When Electron apps are launched from Finder/Dock (not terminal),
 * they don't inherit the user's shell PATH. This function adds
 * common Node.js installation paths to ensure npx/node are found.
 */
function fixMacOSPath(): void {
  if (process.platform !== "darwin") {
    return; // Only needed on macOS
  }

  // Skip in development (terminal launch has correct PATH)
  if (isDev) {
    return;
  }

  const currentPath = process.env.PATH || "";
  const homeDir = process.env.HOME || "";

  // Common Node.js installation paths on macOS
  const additionalPaths = [
    "/usr/local/bin",                                    // Homebrew (Intel Mac)
    "/opt/homebrew/bin",                                 // Homebrew (Apple Silicon)
    "/opt/homebrew/sbin",                                // Homebrew sbin
    `${homeDir}/.volta/bin`,                             // Volta
    `${homeDir}/.fnm/aliases/default/bin`,               // fnm
    `${homeDir}/.local/bin`,                             // pipx/local installs
    "/usr/local/opt/node/bin",                           // Homebrew node formula
    "/opt/local/bin",                                    // MacPorts
  ];

  // Filter to paths that exist and aren't already in PATH
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

  // Handle NVM with glob pattern (check all installed versions)
  try {
    const nvmBaseDir = path.join(homeDir, ".nvm", "versions", "node");
    if (fs.existsSync(nvmBaseDir)) {
      const entries = fs.readdirSync(nvmBaseDir);
      for (const entry of entries) {
        const binPath = path.join(nvmBaseDir, entry, "bin");
        if (fs.existsSync(binPath) && !currentPath.includes(binPath)) {
          pathsToAdd.push(binPath);
        }
      }
    }
  } catch {
    // Ignore NVM path errors
  }

  // Handle Homebrew versioned Node.js (e.g., node@22, node@20)
  try {
    const homebrewOptDir = "/opt/homebrew/opt";
    if (fs.existsSync(homebrewOptDir)) {
      const entries = fs.readdirSync(homebrewOptDir);
      for (const entry of entries) {
        // Look for node@XX directories
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

  // Also check /usr/local/opt for Intel Macs
  try {
    const localOptDir = "/usr/local/opt";
    if (fs.existsSync(localOptDir)) {
      const entries = fs.readdirSync(localOptDir);
      for (const entry of entries) {
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

// Call immediately to fix PATH before any child processes are spawned
fixMacOSPath();

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let nextServer: Electron.UtilityProcess | null = null;
let isAppQuitting = false;
let serverRestartCount = 0;
let serverRestartResetTimer: NodeJS.Timeout | null = null;
const MAX_SERVER_RESTARTS = 3;
const RESTART_RESET_INTERVAL = 5 * 60 * 1000;
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
    debugLog("[Next.js] Using execPath:", process.execPath);

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
    debugLog("[Next.js] Working directory:", standaloneDir);
    debugLog("[Next.js] Environment PORT:", PROD_SERVER_PORT);

    // Use utilityProcess.fork() to run the Next.js standalone server.
    // This uses Electron's built-in Node.js runtime (correct ABI for native
    // modules like better-sqlite3) without spawning a visible OS process.
    // Unlike spawn(process.execPath) with ELECTRON_RUN_AS_NODE, this does NOT
    // cause a Terminal/dock icon to appear on macOS.
    try {
      nextServer = utilityProcess.fork(standaloneServer, [], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(PROD_SERVER_PORT),
          HOSTNAME: "localhost",
          LOCAL_DATA_PATH: path.join(userDataPath, "data"),
          NEXT_TELEMETRY_DISABLED: "1",
          ELECTRON_RESOURCES_PATH: resourcesPath,
          SELINE_PRODUCTION_BUILD: "1",
        },
        stdio: "pipe",
        serviceName: "next-server",
      });
    } catch (error) {
      debugError("[Next.js] Failed to fork utility process:", error);
      reject(error);
      return;
    }

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

    nextServer.on("exit", (code) => {
      debugLog("[Next.js] Process exited with code:", code);
      nextServer = null;

      // Don't auto-restart on intentional shutdown or when no window exists.
      if (isAppQuitting || !mainWindow) {
        return;
      }

      if (serverRestartCount >= MAX_SERVER_RESTARTS) {
        debugError("[Next.js] Max restart attempts reached. Server will not auto-restart.");
        dialog.showErrorBox(
          "Server Crashed",
          "The application server has crashed repeatedly. Please restart the app manually."
        );
        return;
      }

      serverRestartCount += 1;
      debugLog(`[Next.js] Auto-restarting server (attempt ${serverRestartCount}/${MAX_SERVER_RESTARTS})...`);

      if (serverRestartResetTimer) {
        clearTimeout(serverRestartResetTimer);
      }
      serverRestartResetTimer = setTimeout(() => {
        serverRestartCount = 0;
      }, RESTART_RESET_INTERVAL);

      setTimeout(() => {
        startNextServer()
          .then(() => {
            debugLog("[Next.js] Server restarted successfully");
            mainWindow?.reload();
          })
          .catch((error) => {
            debugError("[Next.js] Failed to restart server:", error);
          });
      }, 2000);
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

  // Single-file model download (for whisper.cpp .bin files from shared repos)
  // Unlike model:download which downloads an entire repo, this downloads one file.
  ipcMain.handle("model:checkFileExists", async (_event, opts: { modelId: string; filename: string }) => {
    const filePath = path.join(userModelsDir, "whisper", opts.filename);
    return fs.existsSync(filePath);
  });

  ipcMain.handle("model:downloadFile", async (event, opts: { modelId: string; repo: string; filename: string }) => {
    try {
      const destDir = path.join(userModelsDir, "whisper");
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, opts.filename);
      debugLog(`[Model] Starting single-file download: ${opts.repo}/${opts.filename} -> ${destPath}`);

      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
        status: "downloading",
        progress: 0,
        file: opts.filename,
      });

      const blob = await downloadFile({
        repo: opts.repo,
        path: opts.filename,
      });

      if (!blob) {
        throw new Error(`File not found: ${opts.repo}/${opts.filename}`);
      }

      // Stream the download — read chunks and report progress
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(destPath, buffer);

      debugLog(`[Model] Single-file download complete: ${opts.filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
        status: "completed",
        progress: 100,
        file: opts.filename,
      });

      return { success: true };
    } catch (error) {
      debugError(`[Model] Single-file download failed: ${opts.repo}/${opts.filename}`, error);
      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
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

  // ============================================================================
  // COMFYUI LOCAL BACKEND HANDLERS
  // ============================================================================

  // ComfyUI model definitions
  const COMFYUI_MODELS = {
    checkpoint: {
      name: "z-image-turbo-fp8-aio.safetensors",
      url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors",
      path: "ComfyUI/models/checkpoints/",
    },
    lora: {
      name: "z-image-detailer.safetensors",
      url: "https://huggingface.co/styly-agents/z-image-detailer/resolve/main/z-image-detailer.safetensors",
      path: "ComfyUI/models/loras/",
    },
  };

  // Get the default ComfyUI backend path
  // In production: copy from bundled resources to user data folder
  // In development: use the local comfyui_backend folder
  function getComfyUIBackendPath(): string {
    if (isDev) {
      // In development, use the local comfyui_backend folder
      return path.join(process.cwd(), "comfyui_backend");
    } else {
      // In production, use user data folder
      return path.join(userDataPath, "comfyui_backend");
    }
  }

  // Get the bundled ComfyUI backend path (in resources)
  function getBundledComfyUIPath(): string {
    return path.join(process.resourcesPath, "comfyui_backend");
  }

  // Copy directory recursively
  function copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Ensure ComfyUI backend is set up in user data folder
  async function ensureComfyUIBackend(): Promise<string> {
    const backendPath = getComfyUIBackendPath();

    if (isDev) {
      // In dev mode, use local folder directly
      return backendPath;
    }

    // In production, check if already copied to user data
    const dockerComposePath = findDockerComposeFile(backendPath);
    if (!dockerComposePath) {
      // Copy from bundled resources
      const bundledPath = getBundledComfyUIPath();
      if (fs.existsSync(bundledPath)) {
        debugLog("[ComfyUI] Copying backend from bundled resources to user data...");
        copyDirSync(bundledPath, backendPath);
        debugLog("[ComfyUI] Backend copied to:", backendPath);
      } else {
        throw new Error("ComfyUI backend not found in bundled resources");
      }
    }

    // Ensure model directories exist
    fs.mkdirSync(path.join(backendPath, "ComfyUI", "models", "checkpoints"), { recursive: true });
    fs.mkdirSync(path.join(backendPath, "ComfyUI", "models", "loras"), { recursive: true });
    fs.mkdirSync(path.join(backendPath, "output"), { recursive: true });
    fs.mkdirSync(path.join(backendPath, "inputs"), { recursive: true });

    return backendPath;
  }

  // Helper: Execute command as promise
  function execPromise(command: string, options?: { cwd?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      // Always use shell on Windows for proper path handling
      exec(command, { ...options, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' }, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // Helper: Run docker compose command (tries both "docker compose" and "docker-compose")
  // Helper: Find docker-compose file (supports .yml and .yaml extensions)
  function findDockerComposeFile(dir: string): string | null {
    const ymlPath = path.join(dir, "docker-compose.yml");
    const yamlPath = path.join(dir, "docker-compose.yaml");
    if (fs.existsSync(ymlPath)) return ymlPath;
    if (fs.existsSync(yamlPath)) return yamlPath;
    return null;
  }

  async function dockerComposeExec(args: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<string> {
    const workDir = options?.cwd;
    const envVars = options?.env ? { ...process.env, ...options.env } : process.env;

    debugLog(`[ComfyUI] Running docker compose command: ${args} in ${workDir || "default"}`);

    // Verify docker-compose file exists in the working directory
    if (workDir) {
      const composeFile = findDockerComposeFile(workDir);
      if (!composeFile) {
        throw new Error(`docker-compose.yml/yaml not found in ${workDir}`);
      }
      debugLog(`[ComfyUI] Found docker-compose file at ${composeFile}`);
    }

    // Try new "docker compose" CLI first (Docker Desktop 3.4+)
    try {
      const cmd = `docker compose ${args}`;
      debugLog(`[ComfyUI] Executing: ${cmd}`);
      return await new Promise((resolve, reject) => {
        exec(cmd, { cwd: workDir, env: envVars, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        });
      });
    } catch (e1) {
      const err1 = e1 instanceof Error ? e1.message : String(e1);
      debugLog(`[ComfyUI] docker compose failed: ${err1}`);

      // Fallback to legacy "docker-compose" command
      try {
        const cmd = `docker-compose ${args}`;
        debugLog(`[ComfyUI] Fallback executing: ${cmd}`);
        return await new Promise((resolve, reject) => {
          exec(cmd, { cwd: workDir, env: envVars, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' }, (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          });
        });
      } catch (e2) {
        const err2 = e2 instanceof Error ? e2.message : String(e2);
        debugError(`[ComfyUI] docker-compose also failed: ${err2}`);
        throw new Error(`Docker compose failed: ${err1}`);
      }
    }
  }

  // Helper: Sleep
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper: Send progress to renderer
  function sendComfyUIProgress(data: { stage: string; progress: number; message: string; error?: string }): void {
    mainWindow?.webContents.send("comfyui:installProgress", data);
  }

  // Helper: Download file with progress
  async function downloadFileWithProgress(
    url: string,
    destPath: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      const request = https.get(url, { headers: { "User-Agent": "STYLY-Agent" } }, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(destPath);
            downloadFileWithProgress(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
            return;
          }
        }

        const totalSize = parseInt(response.headers["content-length"] || "0", 10);
        let downloadedSize = 0;

        response.on("data", (chunk: Buffer) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = Math.floor((downloadedSize / totalSize) * 100);
            onProgress(percent);
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      });

      request.on("error", (error) => {
        fs.unlink(destPath, () => { });
        reject(error);
      });
    });
  }

  // Check ComfyUI status
  ipcMain.handle("comfyui:checkStatus", async (_event, backendPath?: string) => {
    // Use provided path or get default
    const effectivePath = backendPath || getComfyUIBackendPath();

    const status = {
      dockerInstalled: false,
      imageBuilt: false,
      containerRunning: false,
      apiHealthy: false,
      modelsDownloaded: false,
      checkpointExists: false,
      loraExists: false,
    };

    try {
      // Check Docker installed
      await execPromise("docker --version");
      status.dockerInstalled = true;

      // Check if image exists
      const images = await execPromise("docker images z-image-turbo-fp8 --format \"{{.Repository}}\"");
      status.imageBuilt = images.trim().includes("z-image-turbo-fp8");

      // Check if container is running
      const containers = await execPromise("docker ps --filter \"name=comfyui-z-image\" --format \"{{.Names}}\"");
      status.containerRunning = containers.trim().includes("comfyui-z-image");

      // Check Available Models Helper
      async function checkAvailableModels(): Promise<{ checkpoints: string[], loras: string[] }> {
        try {
          // Query ComfyUI directly on port 8188 for object_info
          const [checkpointRes, loraRes] = await Promise.all([
            net.fetch("http://127.0.0.1:8188/object_info/CheckpointLoaderSimple"),
            net.fetch("http://127.0.0.1:8188/object_info/LoraLoader")
          ]);

          if (!checkpointRes.ok || !loraRes.ok) return { checkpoints: [], loras: [] };

          const checkpointData = await checkpointRes.json() as any;
          const loraData = await loraRes.json() as any;

          const checkpoints = checkpointData?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
          const loras = loraData?.LoraLoader?.input?.required?.lora_name?.[0] || [];

          return { checkpoints, loras };
        } catch (e) {
          return { checkpoints: [], loras: [] };
        }
      }

      // Check API health
      if (status.containerRunning) {
        try {
          const response = await net.fetch("http://127.0.0.1:8000/health");
          status.apiHealthy = response.ok;
        } catch {
          status.apiHealthy = false;
        }
      }

      // Check models exist (Hybrid approach: API preferred, FS fallback)
      let modelsFoundViaApi = false;

      if (status.containerRunning) {
        try {
          const { checkpoints, loras } = await checkAvailableModels();

          // Check for partial matches (sometimes files have different extensions or paths in the list)
          if (checkpoints.some((c: string) => c.includes(COMFYUI_MODELS.checkpoint.name))) {
            status.checkpointExists = true;
          }
          if (loras.some((l: string) => l.includes(COMFYUI_MODELS.lora.name))) {
            status.loraExists = true;
          }

          if (status.checkpointExists && status.loraExists) {
            status.modelsDownloaded = true;
            modelsFoundViaApi = true;
          }
        } catch (e) {
          debugError("[ComfyUI] Failed to check models via API:", e);
        }
      }

      // If API check didn't confirm models (container down or models missing in API), fallback to file system
      if (!modelsFoundViaApi && effectivePath) {
        const checkpointPath = path.join(effectivePath, COMFYUI_MODELS.checkpoint.path, COMFYUI_MODELS.checkpoint.name);
        const loraPath = path.join(effectivePath, COMFYUI_MODELS.lora.path, COMFYUI_MODELS.lora.name);

        // Only update if false (don't overwrite true from API)
        if (!status.checkpointExists) status.checkpointExists = fs.existsSync(checkpointPath);
        if (!status.loraExists) status.loraExists = fs.existsSync(loraPath);

        status.modelsDownloaded = status.checkpointExists && status.loraExists;
      }

      // If API is healthy, models must be working (even if filenames don't match our expected names)
      if (status.apiHealthy && !status.modelsDownloaded) {
        status.modelsDownloaded = true;
        status.checkpointExists = true;
        status.loraExists = true;
      }
    } catch (error) {
      debugError("[ComfyUI] Status check error:", error);
    }

    return status;
  });

  // External ComfyUI (user instance) detection
  ipcMain.handle("comfyuiCustom:detect", async (_event, options?: { host?: string; ports?: number[]; useHttps?: boolean }) => {
    try {
      const { detectComfyUIBaseUrl } = await import("../lib/comfyui/custom/client");
      return await detectComfyUIBaseUrl(options);
    } catch (error) {
      return { baseUrl: null, source: "error", error: error instanceof Error ? error.message : "Detection failed" };
    }
  });

  ipcMain.handle("comfyuiCustom:resolve", async (_event, override?: { comfyuiBaseUrl?: string; comfyuiHost?: string; comfyuiPort?: number }) => {
    try {
      const { resolveCustomComfyUIBaseUrl } = await import("../lib/comfyui/custom/client");
      return await resolveCustomComfyUIBaseUrl(override);
    } catch (error) {
      return { baseUrl: null, source: "error", error: error instanceof Error ? error.message : "Resolution failed" };
    }
  });

  // Install (build Docker image)
  ipcMain.handle("comfyui:install", async (_event, backendPath: string) => {
    try {
      sendComfyUIProgress({ stage: "building", progress: 10, message: "Building Docker image..." });

      const dockerComposePath = findDockerComposeFile(backendPath);
      if (!dockerComposePath) {
        throw new Error(`docker-compose.yml/yaml not found in ${backendPath}`);
      }

      // Build with docker-compose
      await new Promise<void>((resolve, reject) => {
        const build = spawn("docker-compose", ["build"], {
          cwd: backendPath,
          shell: true,
        });

        let progress = 10;
        build.stdout?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build]", line);
          progress = Math.min(progress + 2, 80);
          sendComfyUIProgress({ stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.stderr?.on("data", (data) => {
          debugLog("[ComfyUI Build stderr]", data.toString());
        });

        build.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        build.on("error", (err) => {
          reject(err);
        });
      });

      sendComfyUIProgress({ stage: "complete", progress: 100, message: "Docker image built successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // Download models
  ipcMain.handle("comfyui:downloadModels", async (_event, backendPath: string) => {
    try {
      sendComfyUIProgress({ stage: "downloading-models", progress: 0, message: "Preparing to download models..." });

      // Create directories
      const checkpointDir = path.join(backendPath, COMFYUI_MODELS.checkpoint.path);
      const loraDir = path.join(backendPath, COMFYUI_MODELS.lora.path);
      fs.mkdirSync(checkpointDir, { recursive: true });
      fs.mkdirSync(loraDir, { recursive: true });

      // Download checkpoint (~11GB)
      const checkpointPath = path.join(checkpointDir, COMFYUI_MODELS.checkpoint.name);
      if (!fs.existsSync(checkpointPath)) {
        sendComfyUIProgress({ stage: "downloading-models", progress: 5, message: "Downloading checkpoint (~11GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.checkpoint.url,
          checkpointPath,
          (progress) => {
            sendComfyUIProgress({
              stage: "downloading-models",
              progress: 5 + Math.floor(progress * 0.7),
              message: `Downloading checkpoint: ${progress}%`
            });
          }
        );
      }

      // Download LoRA (~1.2GB)
      const loraPath = path.join(loraDir, COMFYUI_MODELS.lora.name);
      if (!fs.existsSync(loraPath)) {
        sendComfyUIProgress({ stage: "downloading-models", progress: 80, message: "Downloading LoRA (~1.2GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.lora.url,
          loraPath,
          (progress) => {
            sendComfyUIProgress({
              stage: "downloading-models",
              progress: 80 + Math.floor(progress * 0.2),
              message: `Downloading LoRA: ${progress}%`
            });
          }
        );
      }

      sendComfyUIProgress({ stage: "complete", progress: 100, message: "Models downloaded successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // Start container
  ipcMain.handle("comfyui:start", async (_event, backendPath?: string) => {
    try {
      // Use provided path or get default
      const effectivePath = backendPath || getComfyUIBackendPath();

      sendComfyUIProgress({ stage: "starting", progress: 50, message: "Starting ComfyUI container..." });

      await dockerComposeExec("up -d", { cwd: effectivePath });

      // Wait for health check
      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch("http://localhost:8000/health");
          if (response.ok) {
            sendComfyUIProgress({ stage: "complete", progress: 100, message: "ComfyUI is running!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendComfyUIProgress({ stage: "starting", progress: 50 + attempts, message: `Waiting for API... (${attempts}/30)` });
      }

      throw new Error("API health check timed out after 60 seconds");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  });

  // Stop container
  ipcMain.handle("comfyui:stop", async (_event, backendPath?: string) => {
    try {
      // Use provided path or get default
      const effectivePath = backendPath || getComfyUIBackendPath();

      // Try docker compose down first (supports both new and legacy CLI)
      try {
        await dockerComposeExec("down", { cwd: effectivePath });
        return { success: true };
      } catch (e) {
        debugLog("[ComfyUI] docker compose down failed, trying direct stop...");
      }

      // Fallback: direct stop of known container names
      try {
        await execPromise("docker stop comfyui-z-image z-image-api");
        await execPromise("docker rm comfyui-z-image z-image-api");
      } catch {
        // Force remove if stop fails
        await execPromise("docker rm -f comfyui-z-image z-image-api");
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  // Get default backend path (auto-detected)
  ipcMain.handle("comfyui:getDefaultPath", async () => {
    try {
      const backendPath = getComfyUIBackendPath();
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  // Full setup: copies files, builds Docker, downloads models, starts containers
  ipcMain.handle("comfyui:fullSetup", async () => {
    try {
      // Step 1: Ensure backend is set up
      sendComfyUIProgress({ stage: "checking", progress: 5, message: "Setting up ComfyUI backend..." });
      const backendPath = await ensureComfyUIBackend();
      debugLog("[ComfyUI] Backend path:", backendPath);

      // Step 2: Check Docker is installed
      sendComfyUIProgress({ stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      // Step 3: Build Docker images
      sendComfyUIProgress({ stage: "building", progress: 15, message: "Building Docker images (this may take 10-20 minutes)..." });

      const dockerComposePath = findDockerComposeFile(backendPath);
      if (!dockerComposePath) {
        throw new Error(`docker-compose.yml/yaml not found in ${backendPath}`);
      }

      await new Promise<void>((resolve, reject) => {
        // Try docker compose first, fallback to docker-compose
        const composeCmd = process.platform === "win32" ? "docker" : "docker";
        const composeArgs = process.platform === "win32" ? ["compose", "build"] : ["compose", "build"];

        const build = spawn(composeCmd, composeArgs, {
          cwd: backendPath,
          shell: true,
        });

        let progress = 15;
        build.stdout?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build]", line);
          progress = Math.min(progress + 1, 40);
          sendComfyUIProgress({ stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.stderr?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build stderr]", line);
          // Docker often outputs to stderr even for non-errors
          progress = Math.min(progress + 1, 40);
          sendComfyUIProgress({ stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        build.on("error", (err) => {
          reject(err);
        });
      });

      // Step 4: Download models
      sendComfyUIProgress({ stage: "downloading-models", progress: 45, message: "Downloading models (~12GB total)..." });

      const checkpointDir = path.join(backendPath, COMFYUI_MODELS.checkpoint.path);
      const loraDir = path.join(backendPath, COMFYUI_MODELS.lora.path);
      fs.mkdirSync(checkpointDir, { recursive: true });
      fs.mkdirSync(loraDir, { recursive: true });

      // Download checkpoint (~11GB)
      const checkpointPath = path.join(checkpointDir, COMFYUI_MODELS.checkpoint.name);
      if (!fs.existsSync(checkpointPath)) {
        sendComfyUIProgress({ stage: "downloading-models", progress: 45, message: "Downloading checkpoint model (~11GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.checkpoint.url,
          checkpointPath,
          (percent) => {
            const overallProgress = 45 + Math.floor(percent * 0.35);
            sendComfyUIProgress({
              stage: "downloading-models",
              progress: overallProgress,
              message: `Downloading checkpoint: ${percent}%`
            });
          }
        );
      }

      // Download LoRA (~1.2GB)
      const loraPath = path.join(loraDir, COMFYUI_MODELS.lora.name);
      if (!fs.existsSync(loraPath)) {
        sendComfyUIProgress({ stage: "downloading-models", progress: 80, message: "Downloading LoRA model (~1.2GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.lora.url,
          loraPath,
          (percent) => {
            const overallProgress = 80 + Math.floor(percent * 0.1);
            sendComfyUIProgress({
              stage: "downloading-models",
              progress: overallProgress,
              message: `Downloading LoRA: ${percent}%`
            });
          }
        );
      }

      // Step 5: Start containers
      sendComfyUIProgress({ stage: "starting", progress: 92, message: "Starting ComfyUI containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath });

      // Step 6: Wait for health check
      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch("http://localhost:8000/health");
          if (response.ok) {
            sendComfyUIProgress({ stage: "complete", progress: 100, message: "ComfyUI is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendComfyUIProgress({
          stage: "starting",
          progress: 92 + Math.floor(attempts * 0.13),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out after 2 minutes. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // ============================================================================
  // FLUX.2 KLEIN 4B LOCAL BACKEND HANDLERS
  // ============================================================================

  // FLUX.2 Klein 4B configuration
  const FLUX2_KLEIN_4B_CONFIG = {
    name: "flux2-klein-4b",
    displayName: "FLUX.2 Klein 4B",
    imageName: "flux2-klein-4b-api",
    containerName: "flux2-klein-4b-api",
    comfyContainerName: "flux2-klein-4b-comfy",
    apiPort: 5051,
    comfyPort: 8084,
    backendFolder: "flux2-klein-4b",
  };

  // FLUX.2 Klein 9B configuration
  const FLUX2_KLEIN_9B_CONFIG = {
    name: "flux2-klein-9b",
    displayName: "FLUX.2 Klein 9B",
    imageName: "flux2-klein-9b-api",
    containerName: "flux2-klein-9b-api",
    comfyContainerName: "flux2-klein-9b-comfy",
    apiPort: 5052,
    comfyPort: 8085,
    backendFolder: "flux2-klein-9b",
  };

  // Helper: Get FLUX.2 Klein backend path
  function getFlux2KleinBackendPath(variant: "4b" | "9b"): string {
    const config = variant === "4b" ? FLUX2_KLEIN_4B_CONFIG : FLUX2_KLEIN_9B_CONFIG;
    return path.join(getComfyUIBackendPath(), config.backendFolder);
  }

  // Helper: Send progress to renderer for FLUX.2 Klein
  function sendFlux2KleinProgress(variant: "4b" | "9b", data: { stage: string; progress: number; message: string; error?: string }): void {
    const channel = variant === "4b" ? "flux2Klein4b:installProgress" : "flux2Klein9b:installProgress";
    mainWindow?.webContents.send(channel, data);
  }

  // Helper: Get HuggingFace token from settings
  function getHuggingFaceToken(): string | undefined {
    try {
      // In dev mode, settings are stored in .local-data/settings.json
      // In production, they're in the Electron userData path
      const devSettingsPath = path.join(process.cwd(), ".local-data", "settings.json");
      const prodSettingsPath = path.join(dataDir, "settings.json");

      const settingsPath = isDev && fs.existsSync(devSettingsPath) ? devSettingsPath : prodSettingsPath;

      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        debugLog(`[FLUX.2 Klein] Read HF token from ${settingsPath}: ${settings.huggingFaceToken ? "present" : "missing"}`);
        return settings.huggingFaceToken;
      }
      debugLog(`[FLUX.2 Klein] Settings file not found at ${settingsPath}`);
    } catch (error) {
      debugError("[FLUX.2 Klein] Failed to read HF token from settings:", error);
    }
    return undefined;
  }

  // Helper: Check FLUX.2 Klein status
  async function checkFlux2KleinStatus(variant: "4b" | "9b", backendPath?: string) {
    const config = variant === "4b" ? FLUX2_KLEIN_4B_CONFIG : FLUX2_KLEIN_9B_CONFIG;
    const effectivePath = backendPath || getFlux2KleinBackendPath(variant);

    const status = {
      dockerInstalled: false,
      imageBuilt: false,
      containerRunning: false,
      apiHealthy: false,
      modelsDownloaded: false,
    };

    try {
      // Check Docker installed
      await execPromise("docker --version");
      status.dockerInstalled = true;

      // Check if images exist (Docker Compose prefixes with folder name, e.g., flux2-klein-4b-flux2-klein-4b-api)
      const images = await execPromise(`docker images --format "{{.Repository}}"`);
      const imageList = images.toLowerCase();
      // Check for both possible naming patterns
      status.imageBuilt = imageList.includes(config.imageName) || imageList.includes(`${config.name}-${config.imageName}`);
      debugLog(`[FLUX.2 Klein ${variant}] Image check: imageBuilt=${status.imageBuilt}, looking for ${config.imageName} or ${config.name}-${config.imageName}`);

      // Check if container is running
      const containers = await execPromise(`docker ps --format "{{.Names}}"`);
      const containerList = containers.toLowerCase();
      status.containerRunning = containerList.includes(config.containerName);

      // Check API health
      if (status.containerRunning) {
        try {
          const response = await net.fetch(`http://127.0.0.1:${config.apiPort}/health`);
          status.apiHealthy = response.ok;
        } catch {
          status.apiHealthy = false;
        }
      }

      // Check for FLUX.2 Klein models in the shared models directory
      // Models are mounted from ../ComfyUI/models in docker-compose
      const sharedModelsDir = path.join(effectivePath, "..", "ComfyUI", "models");

      // Define required models for each variant
      const requiredModels = {
        "4b": {
          vae: "flux2-vae.safetensors",
          clip: "qwen_3_4b.safetensors",
          diffusion: "flux-2-klein-base-4b-fp8.safetensors",
        },
        "9b": {
          vae: "flux2-vae.safetensors",
          clip: "qwen_3_4b.safetensors",
          diffusion: "flux-2-klein-base-9b-fp8.safetensors",
        },
      };

      const models = requiredModels[variant];
      const vaePath = path.join(sharedModelsDir, "vae", models.vae);
      const clipPath = path.join(sharedModelsDir, "clip", models.clip);
      const diffusionPath = path.join(sharedModelsDir, "diffusion_models", models.diffusion);

      const vaeExists = fs.existsSync(vaePath);
      const clipExists = fs.existsSync(clipPath);
      const diffusionExists = fs.existsSync(diffusionPath);

      debugLog(`[FLUX.2 Klein ${variant}] Model check: vae=${vaeExists}, clip=${clipExists}, diffusion=${diffusionExists}`);

      status.modelsDownloaded = vaeExists && clipExists && diffusionExists;

      // If API is healthy, consider models as working (they might be baked into image)
      if (status.apiHealthy) {
        status.modelsDownloaded = true;
      }

      // If image is built, models should be available (either baked in or mounted)
      // For FLUX.2 Klein, models are either baked into the image during build (DOWNLOAD_MODELS=true)
      // or mounted from the shared models directory at runtime
      if (status.imageBuilt && !status.modelsDownloaded) {
        // Check if any models exist in the shared directory as a fallback
        if (fs.existsSync(sharedModelsDir)) {
          const vaeDir = path.join(sharedModelsDir, "vae");
          const clipDir = path.join(sharedModelsDir, "clip");
          const diffusionDir = path.join(sharedModelsDir, "diffusion_models");

          const hasAnyVae = fs.existsSync(vaeDir) && fs.readdirSync(vaeDir).some((f: string) => f.endsWith(".safetensors"));
          const hasAnyClip = fs.existsSync(clipDir) && fs.readdirSync(clipDir).some((f: string) => f.endsWith(".safetensors"));
          const hasAnyDiffusion = fs.existsSync(diffusionDir) && fs.readdirSync(diffusionDir).some((f: string) => f.endsWith(".safetensors"));

          if (hasAnyVae && hasAnyClip && hasAnyDiffusion) {
            debugLog(`[FLUX.2 Klein ${variant}] Found models in shared directory (may have different filenames)`);
            status.modelsDownloaded = true;
          }
        }
      }
    } catch (error) {
      debugError(`[${config.displayName}] Status check error:`, error);
    }

    return status;
  }

  // FLUX.2 Klein 4B IPC handlers
  ipcMain.handle("flux2Klein4b:checkStatus", async (_event, backendPath?: string) => {
    return checkFlux2KleinStatus("4b", backendPath);
  });

  ipcMain.handle("flux2Klein4b:getDefaultPath", async () => {
    try {
      const backendPath = getFlux2KleinBackendPath("4b");
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein4b:start", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("4b");
      const hfToken = getHuggingFaceToken();
      sendFlux2KleinProgress("4b", { stage: "starting", progress: 50, message: "Starting FLUX.2 Klein 4B containers..." });

      await dockerComposeExec("up -d", { cwd: effectivePath, env: hfToken ? { HF_TOKEN: hfToken } : undefined });

      // Wait for API to be ready
      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_4B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress("4b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 4B is ready!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
      }

      return { success: true }; // Container started, API may still be initializing
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress("4b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("flux2Klein4b:stop", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("4b");
      await dockerComposeExec("down", { cwd: effectivePath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein4b:fullSetup", async () => {
    try {
      let backendPath = getFlux2KleinBackendPath("4b");

      // Step 1: Check prerequisites
      sendFlux2KleinProgress("4b", { stage: "checking", progress: 5, message: "Checking prerequisites..." });

      if (!fs.existsSync(backendPath)) {
        if (!isDev) {
          await ensureComfyUIBackend();
          backendPath = getFlux2KleinBackendPath("4b");
        }
        if (!fs.existsSync(backendPath)) {
          throw new Error(`Backend folder not found: ${backendPath}. Please ensure FLUX.2 Klein 4B is properly installed.`);
        }
      }

      // Step 2: Check Docker
      sendFlux2KleinProgress("4b", { stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      // Step 3: Check for HuggingFace token (required for gated models)
      const hfToken = getHuggingFaceToken();
      if (!hfToken) {
        throw new Error("Hugging Face token is required. Please enter your HF_TOKEN in the settings above.");
      }

      // Step 4: Check if Docker images already exist
      sendFlux2KleinProgress("4b", { stage: "checking", progress: 15, message: "Checking for existing Docker images..." });

      let imagesExist = false;
      try {
        const imageList = await execPromise("docker images --format \"{{.Repository}}\"");
        imagesExist = imageList.toLowerCase().includes("flux2-klein-4b");
        debugLog(`[FLUX.2 Klein 4B] Images exist check: ${imagesExist}, images: ${imageList.trim()}`);
      } catch (e) {
        debugLog("[FLUX.2 Klein 4B] Failed to check existing images, will build:", e);
      }

      if (imagesExist) {
        sendFlux2KleinProgress("4b", { stage: "building", progress: 80, message: "Using existing Docker images (skipping build)..." });
        debugLog("[FLUX.2 Klein 4B] Skipping build - images already exist");
      } else {
        // Build Docker images only if they don't exist
        sendFlux2KleinProgress("4b", { stage: "building", progress: 15, message: "Building Docker images (this may take 10-15 minutes)..." });

        await new Promise<void>((resolve, reject) => {
          const build = spawn("docker", ["compose", "build"], {
            cwd: backendPath,
            shell: true,
            env: { ...process.env, HF_TOKEN: hfToken },
          });

          let progress = 15;
          build.stdout?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 4B Build]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress("4b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.stderr?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 4B Build stderr]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress("4b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Docker build failed with code ${code}`));
            }
          });

          build.on("error", reject);
        });
      }

      // Step 5: Start containers
      sendFlux2KleinProgress("4b", { stage: "starting", progress: 85, message: "Starting FLUX.2 Klein 4B containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath, env: { HF_TOKEN: hfToken } });

      // Step 5: Wait for health check
      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_4B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress("4b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 4B is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendFlux2KleinProgress("4b", {
          stage: "starting",
          progress: 85 + Math.floor(attempts * 0.25),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress("4b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // ============================================================================
  // FLUX.2 KLEIN 9B LOCAL BACKEND HANDLERS
  // ============================================================================

  ipcMain.handle("flux2Klein9b:checkStatus", async (_event, backendPath?: string) => {
    return checkFlux2KleinStatus("9b", backendPath);
  });

  ipcMain.handle("flux2Klein9b:getDefaultPath", async () => {
    try {
      const backendPath = getFlux2KleinBackendPath("9b");
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein9b:start", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("9b");
      const hfToken = getHuggingFaceToken();
      sendFlux2KleinProgress("9b", { stage: "starting", progress: 50, message: "Starting FLUX.2 Klein 9B containers..." });

      await dockerComposeExec("up -d", { cwd: effectivePath, env: hfToken ? { HF_TOKEN: hfToken } : undefined });

      // Wait for API to be ready
      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_9B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress("9b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 9B is ready!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
      }

      return { success: true }; // Container started, API may still be initializing
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress("9b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("flux2Klein9b:stop", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("9b");
      await dockerComposeExec("down", { cwd: effectivePath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein9b:fullSetup", async () => {
    try {
      let backendPath = getFlux2KleinBackendPath("9b");

      // Step 1: Check prerequisites
      sendFlux2KleinProgress("9b", { stage: "checking", progress: 5, message: "Checking prerequisites..." });

      if (!fs.existsSync(backendPath)) {
        if (!isDev) {
          await ensureComfyUIBackend();
          backendPath = getFlux2KleinBackendPath("9b");
        }
        if (!fs.existsSync(backendPath)) {
          throw new Error(`Backend folder not found: ${backendPath}. Please ensure FLUX.2 Klein 9B is properly installed.`);
        }
      }

      // Step 2: Check Docker
      sendFlux2KleinProgress("9b", { stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      // Step 3: Check for HuggingFace token (required for gated models)
      const hfToken = getHuggingFaceToken();
      if (!hfToken) {
        throw new Error("Hugging Face token is required. Please enter your HF_TOKEN in the settings above.");
      }

      // Step 4: Check if Docker images already exist
      sendFlux2KleinProgress("9b", { stage: "checking", progress: 15, message: "Checking for existing Docker images..." });

      let imagesExist = false;
      try {
        const imageList = await execPromise("docker images --format \"{{.Repository}}\"");
        imagesExist = imageList.toLowerCase().includes("flux2-klein-9b");
        debugLog(`[FLUX.2 Klein 9B] Images exist check: ${imagesExist}, images: ${imageList.trim()}`);
      } catch (e) {
        debugLog("[FLUX.2 Klein 9B] Failed to check existing images, will build:", e);
      }

      if (imagesExist) {
        sendFlux2KleinProgress("9b", { stage: "building", progress: 80, message: "Using existing Docker images (skipping build)..." });
        debugLog("[FLUX.2 Klein 9B] Skipping build - images already exist");
      } else {
        // Build Docker images only if they don't exist
        sendFlux2KleinProgress("9b", { stage: "building", progress: 15, message: "Building Docker images (this may take 10-15 minutes)..." });

        await new Promise<void>((resolve, reject) => {
          const build = spawn("docker", ["compose", "build"], {
            cwd: backendPath,
            shell: true,
            env: { ...process.env, HF_TOKEN: hfToken },
          });

          let progress = 15;
          build.stdout?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 9B Build]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress("9b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.stderr?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 9B Build stderr]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress("9b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Docker build failed with code ${code}`));
            }
          });

          build.on("error", reject);
        });
      }

      // Step 5: Start containers
      sendFlux2KleinProgress("9b", { stage: "starting", progress: 85, message: "Starting FLUX.2 Klein 9B containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath, env: { HF_TOKEN: hfToken } });

      // Step 5: Wait for health check
      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_9B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress("9b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 9B is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendFlux2KleinProgress("9b", {
          stage: "starting",
          progress: 85 + Math.floor(attempts * 0.25),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress("9b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
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

  try {
    await initializeRTK();
  } catch (error) {
    debugError("[RTK] Initialization failed:", error);
  }

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
  isAppQuitting = true;
  if (serverRestartResetTimer) {
    clearTimeout(serverRestartResetTimer);
    serverRestartResetTimer = null;
  }
  stopNextServer();
});

// Security: Prevent new webview creation
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    debugLog('[Security] Blocked webview attachment');
    event.preventDefault();
  });
});
