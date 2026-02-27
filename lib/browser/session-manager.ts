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
      sessions: new Map(),
      reaperInterval: null,
      launching: null,
    };
  }
  return g[GLOBAL_KEY];
}

// ─── Browser lifecycle ────────────────────────────────────────────────────────

/**
 * Get or launch the shared Chromium browser instance.
 * Uses a launch lock to prevent concurrent startups.
 */
async function ensureBrowser(): Promise<Browser> {
  const state = getState();

  // Already connected
  if (state.browser?.isConnected()) return state.browser;

  // Another caller is already launching — wait for it
  if (state.launching) return state.launching;

  state.launching = (async () => {
    try {
      // Dynamic import — playwright-core is optional at build time
      const { chromium } = await import("playwright-core");

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
      // This avoids the 300MB download of chromium_headless_shell.
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
          console.log(`[ChromiumManager] Launched using ${label}`);
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

      // Clean up on unexpected disconnect
      browser.on("disconnected", () => {
        const s = getState();
        s.browser = null;
        s.sessions.clear();
        console.warn("[ChromiumManager] Browser disconnected — all sessions invalidated");
      });

      state.browser = browser;
      startReaper();
      return browser;
    } finally {
      state.launching = null;
    }
  })();

  return state.launching;
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Get an existing session or create a new isolated BrowserContext.
 */
export async function getOrCreateSession(sessionId: string): Promise<BrowserSession> {
  const state = getState();
  const existing = state.sessions.get(sessionId);

  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing;
  }

  const browser = await ensureBrowser();

  // Each context is fully isolated (cookies, localStorage, service workers)
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Seline/1.0",
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  const now = Date.now();

  const session: BrowserSession = {
    sessionId,
    context,
    page,
    createdAt: now,
    lastAccessedAt: now,
  };

  state.sessions.set(sessionId, session);
  console.log(`[ChromiumManager] Session created: ${sessionId} (active: ${state.sessions.size})`);

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
 */
export async function closeSession(sessionId: string): Promise<void> {
  const state = getState();
  const session = state.sessions.get(sessionId);
  if (!session) return;

  state.sessions.delete(sessionId);

  try {
    await session.context.close();
  } catch (err) {
    // Context may already be closed if browser disconnected
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

  if (state.browser) {
    try {
      await state.browser.close();
    } catch {
      // Ignore
    }
    state.browser = null;
    console.log("[ChromiumManager] Browser shut down");
  }
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
