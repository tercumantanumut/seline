/**
 * Browser Screencast Manager
 *
 * Uses CDP (Chrome DevTools Protocol) Page.startScreencast to stream
 * real-time JPEG frames from the browser's GPU compositor.
 * Subscribers (SSE endpoints) receive frames via a pub/sub pattern.
 *
 * This is the same technology Chrome DevTools uses for remote preview —
 * it's a live video feed, not periodic screenshots.
 */

import type { Page, CDPSession } from "playwright-core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreencastFrame {
  /** Base64-encoded JPEG image data */
  data: string;
  /** Frame metadata from CDP */
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  /** When this frame was received */
  receivedAt: number;
}

type FrameListener = (frame: ScreencastFrame) => void;

interface ScreencastSession {
  cdpSession: CDPSession;
  listeners: Set<FrameListener>;
  latestFrame: ScreencastFrame | null;
  isActive: boolean;
}

// ─── Global state (survives HMR) ─────────────────────────────────────────────

const GLOBAL_KEY = "__seline_screencast_manager__" as const;

interface ScreencastState {
  sessions: Map<string, ScreencastSession>;
}

function getState(): ScreencastState {
  const g = globalThis as unknown as Record<string, ScreencastState>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { sessions: new Map() };
  }
  return g[GLOBAL_KEY];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start screencasting for a browser session.
 * Frames are streamed via CDP at ~3 FPS, JPEG quality 40 (~20-40KB/frame).
 */
export async function startScreencast(
  sessionId: string,
  page: Page
): Promise<void> {
  const state = getState();

  // Already screencasting for this session
  if (state.sessions.has(sessionId)) return;

  try {
    const cdpSession = await page.context().newCDPSession(page);

    const screencastSession: ScreencastSession = {
      cdpSession,
      listeners: new Set(),
      latestFrame: null,
      isActive: true,
    };

    // Listen for frames from CDP
    cdpSession.on("Page.screencastFrame", (params: {
      data: string;
      metadata: ScreencastFrame["metadata"];
      sessionId: number;
    }) => {
      const frame: ScreencastFrame = {
        data: params.data,
        metadata: params.metadata,
        receivedAt: Date.now(),
      };

      screencastSession.latestFrame = frame;

      // Notify all subscribers
      for (const listener of screencastSession.listeners) {
        try {
          listener(frame);
        } catch {
          // Don't let a bad listener crash the stream
        }
      }

      // Acknowledge frame to keep the stream flowing
      cdpSession.send("Page.screencastFrameAck", {
        sessionId: params.sessionId,
      }).catch(() => {
        // CDP session may be closed
      });
    });

    // Start the screencast — JPEG at quality 70, every frame for smooth live view
    await cdpSession.send("Page.startScreencast", {
      format: "jpeg",
      quality: 70,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });

    state.sessions.set(sessionId, screencastSession);
    console.log(`[Screencast] Started for session: ${sessionId}`);
  } catch (err) {
    console.warn(`[Screencast] Failed to start for ${sessionId}:`, err);
  }
}

/**
 * Stop screencasting for a session. Cleans up CDP session and notifies listeners.
 */
export async function stopScreencast(sessionId: string): Promise<void> {
  const state = getState();
  const session = state.sessions.get(sessionId);
  if (!session) return;

  session.isActive = false;
  state.sessions.delete(sessionId);

  try {
    await session.cdpSession.send("Page.stopScreencast");
    await session.cdpSession.detach();
  } catch {
    // CDP session may already be gone
  }

  // Clear all listeners
  session.listeners.clear();
  console.log(`[Screencast] Stopped for session: ${sessionId}`);
}

/**
 * Subscribe to screencast frames for a session.
 * Returns an unsubscribe function.
 * If a session is active, the listener immediately gets the latest frame.
 */
export function subscribeToFrames(
  sessionId: string,
  listener: FrameListener
): () => void {
  const state = getState();
  const session = state.sessions.get(sessionId);

  if (!session) {
    // No active screencast — return a no-op unsubscribe
    return () => {};
  }

  session.listeners.add(listener);

  // Send the latest frame immediately so the client doesn't start with a blank
  if (session.latestFrame) {
    try {
      listener(session.latestFrame);
    } catch {
      // Ignore
    }
  }

  return () => {
    session.listeners.delete(listener);
  };
}

/**
 * Get the latest frame for a session (for initial load / polling fallback).
 */
export function getLatestFrame(sessionId: string): ScreencastFrame | null {
  return getState().sessions.get(sessionId)?.latestFrame ?? null;
}

/**
 * Check if a session has an active screencast.
 */
export function isScreencastActive(sessionId: string): boolean {
  return getState().sessions.get(sessionId)?.isActive ?? false;
}

/**
 * Get count of active screencasts (diagnostics).
 */
export function getActiveScreencastCount(): number {
  return getState().sessions.size;
}

/**
 * Stop all active screencasts. Called during shutdown.
 */
export async function stopAllScreencasts(): Promise<void> {
  const state = getState();
  const sessionIds = Array.from(state.sessions.keys());
  await Promise.allSettled(sessionIds.map((id) => stopScreencast(id)));
}
