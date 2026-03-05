/**
 * Chromium Session Manager
 *
 * Manages isolated Playwright BrowserContexts per agent session.
 * Uses a single shared browser process with context-level isolation
 * (cookies, localStorage, service workers are fully sandboxed).
 *
 * Lifecycle:
 *  1. getOrCreateSession(sessionId) → creates a BrowserContext
 *  2. Agent performs actions via the chromiumWorkspace tool
 *  3. closeSession(sessionId) → closes the context + records history
 *  4. Idle reaper auto-closes sessions after IDLE_TIMEOUT_MS
 *
 * Singleton: stored on globalThis to survive Next.js hot reloads.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";
import { join } from "path";
import { homedir, platform } from "os";
import { startScreencast, stopScreencast } from "./screencast";
import { cleanupInputSession } from "./input-dispatcher";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrowserSession {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastAccessedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Close idle sessions after 10 minutes */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Reaper sweep interval */
const REAPER_INTERVAL_MS = 60 * 1000;

// ─── Global singleton state (survives HMR) ────────────────────────────────────

interface ChromiumManagerState {
  browser: Browser | null;
  persistentContext: BrowserContext | null;  // For user-chrome mode
  browserMode: "standalone" | "user-chrome" | null;
  sessions: Map<string, BrowserSession>;
  reaperInterval: ReturnType<typeof setInterval> | null;
  launching: Promise<Browser> | null;
}

const GLOBAL_KEY = "__seline_chromium_manager__" as const;

function getState(): ChromiumManagerState {
  const g = globalThis as unknown as Record<string, ChromiumManagerState>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      browser: null,
      persistentContext: null,
      browserMode: null,
      sessions: new Map(),
      reaperInterval: null,
      launching: null,
    };
  }
  return g[GLOBAL_KEY];
}

// ─── Chrome profile helpers ───────────────────────────────────────────────────

/**
 * Returns the OS-specific default Chrome user data directory.
 */
function getDefaultChromeProfilePath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Google", "Chrome");
    case "win32":
      return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Google", "Chrome", "User Data");
    default: // linux
      return join(home, ".config", "google-chrome");
  }
}

/**
 * Reads the current browser mode setting. Lazy-loads settings to avoid
 * circular imports at module scope.
 */
function getBrowserSettings(): { mode: "standalone" | "user-chrome"; profilePath: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadSettings } = require("@/lib/settings/settings-manager");
    const settings = loadSettings();
    return {
      mode: settings.chromiumBrowserMode || "standalone",
      profilePath: settings.chromiumUserProfilePath || "",
    };
  } catch {
    return { mode: "standalone", profilePath: "" };
  }
}

// ─── Browser lifecycle ────────────────────────────────────────────────────────

/**
 * Get or launch the shared Chromium browser instance.
 * Uses a launch lock to prevent concurrent startups.
 *
 * In "user-chrome" mode, launches with launchPersistentContext() to inherit
 * the user's real Chrome profile (cookies, extensions, fingerprint).
 */
async function ensureBrowser(): Promise<Browser> {
  const state = getState();
  const { mode } = getBrowserSettings();

  // If mode changed while a browser is running, shut down and restart
  if (state.browserMode && state.browserMode !== mode && state.browser?.isConnected()) {
    console.log(`[ChromiumManager] Browser mode changed from ${state.browserMode} to ${mode} — restarting`);
    await shutdownBrowser();
  }

  // Already connected
  if (state.browser?.isConnected()) return state.browser;

  // Another caller is already launching — wait for it
  if (state.launching) return state.launching;

  state.launching = (async () => {
    try {
      // Dynamic import — playwright-core is optional at build time
      const { chromium } = await import("playwright-core");

      if (mode === "user-chrome") {
        return await launchUserChrome(chromium, state);
      }

      return await launchStandalone(chromium, state);
    } finally {
      state.launching = null;
    }
  })();

  return state.launching;
}

/**
 * Launch in standalone mode — headless, isolated contexts, Seline UA.
 * Current default behavior.
 */
async function launchStandalone(
  chromium: typeof import("playwright-core").chromium,
  state: ChromiumManagerState,
): Promise<Browser> {
  const launchArgs = [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ];

  let browser: Browser;

  // Strategy: try system Chrome first (zero download), then fall back
  // to Playwright's bundled Chromium (only if already installed).
  const strategies: Array<{ label: string; opts: Parameters<typeof chromium.launch>[0] }> = [
    {
      label: "system Chrome",
      opts: { channel: "chrome", headless: true, args: launchArgs },
    },
    {
      label: "system Chromium",
      opts: { channel: "chromium", headless: true, args: launchArgs },
    },
    {
      label: "Playwright bundled Chromium",
      opts: { headless: true, args: launchArgs },
    },
  ];

  let lastError: Error | null = null;
  browser = null as unknown as Browser;

  for (const { label, opts } of strategies) {
    try {
      browser = await chromium.launch(opts);
      console.log(`[ChromiumManager] Launched using ${label} (standalone mode)`);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`[ChromiumManager] ${label} not available: ${lastError.message.split("\n")[0]}`);
    }
  }

  if (!browser) {
    throw new Error(
      `No Chrome/Chromium browser found. Install Google Chrome or run: npx playwright install chromium\n` +
      `Last error: ${lastError?.message ?? "unknown"}`
    );
  }

  browser.on("disconnected", () => {
    const s = getState();
    s.browser = null;
    s.persistentContext = null;
    s.browserMode = null;
    s.sessions.clear();
    console.warn("[ChromiumManager] Browser disconnected — all sessions invalidated");
  });

  state.browser = browser;
  state.persistentContext = null;
  state.browserMode = "standalone";
  startReaper();
  return browser;
}

/**
 * Launch in user-chrome mode — uses launchPersistentContext() with the
 * user's real Chrome profile directory. Inherits cookies, extensions,
 * fonts, WebGL fingerprint.
 *
 * Runs non-headless so the real rendering pipeline is used (better
 * anti-detection). The Electron screencast viewer still works via CDP.
 *
 * Throws a clear error if Chrome's profile lock is held (user has Chrome open).
 */
async function launchUserChrome(
  chromium: typeof import("playwright-core").chromium,
  state: ChromiumManagerState,
): Promise<Browser> {
  const { profilePath } = getBrowserSettings();
  const resolvedPath = profilePath || getDefaultChromeProfilePath();

  console.log(`[ChromiumManager] Launching with user Chrome profile: ${resolvedPath}`);

  try {
    const context = await chromium.launchPersistentContext(resolvedPath, {
      channel: "chrome",
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
      ],
      viewport: { width: 1280, height: 720 },
      // No custom UA — use Chrome's real one for anti-detection
      ignoreHTTPSErrors: true,
    });

    const browser = context.browser();
    if (!browser) {
      throw new Error("Failed to get browser instance from persistent context");
    }

    browser.on("disconnected", () => {
      const s = getState();
      s.browser = null;
      s.persistentContext = null;
      s.browserMode = null;
      s.sessions.clear();
      console.warn("[ChromiumManager] Browser disconnected — all sessions invalidated");
    });

    state.browser = browser;
    state.persistentContext = context;
    state.browserMode = "user-chrome";
    startReaper();

    console.log("[ChromiumManager] Launched using user Chrome profile (user-chrome mode)");
    return browser;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Detect Chrome profile lock conflict
    if (msg.includes("lock") || msg.includes("already running") || msg.includes("SingletonLock")) {
      throw new Error(
        "Cannot launch with your Chrome profile because Chrome is currently open. " +
        "Close all Chrome windows and try again, or switch to Standalone mode in Settings → Preferences."
      );
    }

    throw new Error(
      `Failed to launch with user Chrome profile at "${resolvedPath}": ${msg}\n` +
      "Make sure Google Chrome is installed and the profile path is correct."
    );
  }
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Get an existing session or create a new isolated BrowserContext.
 *
 * In standalone mode: each session gets its own isolated BrowserContext.
 * In user-chrome mode: sessions share the persistent context (same cookies,
 * extensions, fingerprint) but each gets a separate page/tab.
 */
export async function getOrCreateSession(sessionId: string): Promise<BrowserSession> {
  const state = getState();
  const existing = state.sessions.get(sessionId);

  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing;
  }

  await ensureBrowser();

  let context: BrowserContext;
  let page: Page;

  if (state.browserMode === "user-chrome" && state.persistentContext) {
    // User-chrome mode: reuse the persistent context, create a new page/tab
    context = state.persistentContext;
    page = await context.newPage();
  } else {
    // Standalone mode: create an isolated context per session
    const browser = state.browser!;
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Seline/1.0",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();
  }

  const now = Date.now();

  const session: BrowserSession = {
    sessionId,
    context,
    page,
    createdAt: now,
    lastAccessedAt: now,
  };

  state.sessions.set(sessionId, session);
  console.log(`[ChromiumManager] Session created: ${sessionId} (${state.browserMode} mode, active: ${state.sessions.size})`);

  // Start live screencast for the backdrop
  startScreencast(sessionId, page).catch((err) => {
    console.warn(`[ChromiumManager] Screencast auto-start failed:`, err);
  });

  return session;
}

/**
 * Get a session without creating one. Returns null if not found.
 */
export function getSession(sessionId: string): BrowserSession | null {
  const state = getState();
  const session = state.sessions.get(sessionId) ?? null;
  if (session) session.lastAccessedAt = Date.now();
  return session;
}

/**
 * Close and clean up a specific session.
 *
 * In standalone mode: closes the entire BrowserContext.
 * In user-chrome mode: closes only the page (the persistent context stays alive).
 */
export async function closeSession(sessionId: string): Promise<void> {
  const state = getState();
  const session = state.sessions.get(sessionId);
  if (!session) return;

  // Stop screencast before closing
  await stopScreencast(sessionId);

  // Clean up CDP input dispatch session
  cleanupInputSession(sessionId);

  state.sessions.delete(sessionId);

  try {
    if (state.browserMode === "user-chrome" && state.persistentContext) {
      // In user-chrome mode, only close the page — the shared context stays alive
      await session.page.close();
    } else {
      // In standalone mode, close the entire isolated context
      await session.context.close();
    }
  } catch (err) {
    // Context/page may already be closed if browser disconnected
    console.warn(`[ChromiumManager] Error closing session ${sessionId}:`, err);
  }

  console.log(`[ChromiumManager] Session closed: ${sessionId} (active: ${state.sessions.size})`);

  // If no sessions remain, close the browser to free resources
  if (state.sessions.size === 0 && state.browser) {
    await shutdownBrowser();
  }
}

/**
 * Close all sessions and shut down the browser.
 */
export async function shutdownAll(): Promise<void> {
  const state = getState();

  // Stop all screencasts first
  const { stopAllScreencasts } = await import("./screencast");
  await stopAllScreencasts();

  // Close all contexts
  const closePromises = Array.from(state.sessions.values()).map(async (session) => {
    try {
      await session.context.close();
    } catch {
      // Ignore — browser may already be gone
    }
  });
  await Promise.allSettled(closePromises);
  state.sessions.clear();

  await shutdownBrowser();
}

/**
 * Get the count of active sessions (for diagnostics).
 */
export function getActiveSessionCount(): number {
  return getState().sessions.size;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function shutdownBrowser(): Promise<void> {
  const state = getState();
  stopReaper();

  // In user-chrome mode, close the persistent context first (closes browser too)
  if (state.persistentContext) {
    try {
      await state.persistentContext.close();
    } catch {
      // Ignore
    }
    state.persistentContext = null;
  }

  if (state.browser) {
    try {
      await state.browser.close();
    } catch {
      // Ignore — may already be closed by persistent context teardown
    }
    state.browser = null;
  }

  state.browserMode = null;
  console.log("[ChromiumManager] Browser shut down");
}

function startReaper(): void {
  const state = getState();
  if (state.reaperInterval) return;

  state.reaperInterval = setInterval(async () => {
    const now = Date.now();
    const toClose: string[] = [];

    for (const [id, session] of getState().sessions) {
      if (now - session.lastAccessedAt > IDLE_TIMEOUT_MS) {
        toClose.push(id);
      }
    }

    for (const id of toClose) {
      console.log(`[ChromiumManager] Reaping idle session: ${id}`);
      await closeSession(id);
    }
  }, REAPER_INTERVAL_MS);

  // Don't prevent Node from exiting
  if (state.reaperInterval && typeof state.reaperInterval === "object" && "unref" in state.reaperInterval) {
    state.reaperInterval.unref();
  }
}

function stopReaper(): void {
  const state = getState();
  if (state.reaperInterval) {
    clearInterval(state.reaperInterval);
    state.reaperInterval = null;
  }
}
