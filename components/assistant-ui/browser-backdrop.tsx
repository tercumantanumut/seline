"use client";

/**
 * BrowserBackdrop — Live browser video as chat background
 *
 * Connects to the CDP screencast SSE stream and renders real-time
 * browser frames as a blurred, dimmed backdrop behind chat messages.
 *
 * Event-driven: listens for background-task-progress events containing
 * chromium tool calls to detect when a browser session becomes active.
 * No blind polling — only probes the SSE endpoint after seeing evidence
 * of browser activity.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

interface BrowserBackdropProps {
  /** The chat session ID — used to connect to the screencast stream */
  sessionId?: string;
  className?: string;
  /** Called when the backdrop becomes active (has frames) or inactive */
  onActiveChange?: (active: boolean) => void;
}

/** Tool names that indicate a browser session may be active */
const BROWSER_TOOL_NAMES = new Set([
  "chromium_workspace",
  "chromiumWorkspace",
  "chromium-workspace",
  "browser",
]);

function hasBrowserToolCall(detail: unknown): boolean {
  if (!detail || typeof detail !== "object") return false;
  const event = detail as Record<string, unknown>;

  // Check progressContent for tool calls with browser-related tool names
  const parts = Array.isArray(event.progressContent) ? event.progressContent : [];
  for (const part of parts) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (
        (p.type === "tool-call" || p.type === "tool-result") &&
        typeof p.toolName === "string" &&
        BROWSER_TOOL_NAMES.has(p.toolName)
      ) {
        return true;
      }
    }
  }

  // Check progressText for browser-related keywords
  if (typeof event.progressText === "string") {
    const lower = event.progressText.toLowerCase();
    if (lower.includes("browser") || lower.includes("chromium") || lower.includes("screencast")) {
      return true;
    }
  }

  return false;
}

export function BrowserBackdrop({ sessionId, className, onActiveChange }: BrowserBackdropProps) {
  const { chatBackground, resolvedTheme } = useTheme();
  const imgRef = useRef<HTMLImageElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks whether we've seen browser tool activity for this session
  const [browserDetected, setBrowserDetected] = useState(false);

  const cleanupStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupStream();
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
  }, [cleanupStream]);

  // Notify parent when backdrop becomes active/inactive
  useEffect(() => {
    onActiveChange?.(hasFrame);
  }, [hasFrame, onActiveChange]);

  const backdropStyle = useMemo(() => {
    const configuredOpacity = Math.min(Math.max(chatBackground.opacity ?? 30, 0), 100) / 100;
    const tintAlpha =
      resolvedTheme === "dark"
        ? 0.28 + (1 - configuredOpacity) * 0.34
        : 0.16 + (1 - configuredOpacity) * 0.24;
    const frameBrightness = resolvedTheme === "dark" ? 0.52 : 0.72;
    const frameSaturation = resolvedTheme === "dark" ? 0.9 : 1;

    return {
      frameFilter: `brightness(${frameBrightness}) saturate(${frameSaturation}) contrast(0.92)`,
      tintColor: `hsl(var(--terminal-cream) / ${Math.min(0.72, tintAlpha)})`,
      gradient:
        resolvedTheme === "dark"
          ? "linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.10) 28%, rgba(0,0,0,0.10) 72%, rgba(0,0,0,0.28) 100%)"
          : "linear-gradient(to bottom, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0.06) 72%, rgba(255,255,255,0.18) 100%)",
    };
  }, [chatBackground.opacity, resolvedTheme]);

  // Listen for browser tool calls in background-task-progress events
  useEffect(() => {
    if (!sessionId) return;

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object") return;
      const evt = detail as Record<string, unknown>;
      // Only care about progress events for this session
      if (evt.sessionId !== sessionId) return;
      if (hasBrowserToolCall(detail)) {
        setBrowserDetected(true);
      }
    };

    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== "object") return;
      const task = (detail as Record<string, unknown>).task as Record<string, unknown> | undefined;
      if (task?.sessionId === sessionId) {
        // Run completed — if no active stream, reset browser detection
        if (!eventSourceRef.current) {
          setBrowserDetected(false);
        }
      }
    };

    window.addEventListener("background-task-progress", handleProgress);
    window.addEventListener("background-task-completed", handleCompleted);
    return () => {
      window.removeEventListener("background-task-progress", handleProgress);
      window.removeEventListener("background-task-completed", handleCompleted);
    };
  }, [sessionId]);

  // Connect to screencast stream only when browser activity is detected
  useEffect(() => {
    if (!sessionId || !browserDetected) {
      cleanupAll();
      if (!browserDetected) setHasFrame(false);
      return;
    }

    let mounted = true;

    const connectStream = () => {
      if (!mounted) return;
      cleanupStream();

      const es = new EventSource(`/api/browser/${sessionId}/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (mounted) setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const { data } = JSON.parse(event.data) as { data: string; ts: number };
          if (imgRef.current && data) {
            imgRef.current.src = `data:image/jpeg;base64,${data}`;
            if (mounted) setHasFrame(true);
          }
        } catch {
          // Malformed frame, skip
        }
      };

      // Listen for explicit session-end event from server
      es.addEventListener("session-end", () => {
        es.close();
        eventSourceRef.current = null;
        if (mounted) {
          setIsConnected(false);
          setHasFrame(false);
          setBrowserDetected(false);
        }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (mounted) {
          setIsConnected(false);
          // Fade out after losing connection
          setTimeout(() => {
            if (mounted && !eventSourceRef.current) {
              setHasFrame(false);
              setBrowserDetected(false);
            }
          }, 1500);
        }
      };
    };

    // Probe once to check if screencast is already active, then connect
    const probe = async () => {
      if (!mounted || eventSourceRef.current) return;
      try {
        const res = await fetch(`/api/browser/${sessionId}/stream`, {
          method: "HEAD",
        });
        if (res.ok) {
          connectStream();
        } else {
          // Screencast not ready yet — retry a few times then give up
          // (the agent may still be navigating before screencast starts)
          probeIntervalRef.current = setInterval(async () => {
            if (!mounted || eventSourceRef.current) {
              if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
              return;
            }
            try {
              const r = await fetch(`/api/browser/${sessionId}/stream`, { method: "HEAD" });
              if (r.ok) {
                if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
                connectStream();
              }
            } catch { /* ignore */ }
          }, 3000);
        }
      } catch {
        // Network error, ignore
      }
    };

    void probe();

    return () => {
      mounted = false;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, browserDetected]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700 ease-in-out",
        hasFrame ? "opacity-100" : "opacity-0",
        className
      )}
      aria-hidden="true"
    >
      {/* Live browser frame */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        alt=""
        className="h-full w-full object-cover"
        style={{
          filter: backdropStyle.frameFilter,
        }}
      />

      {/* Theme-tinted wash — mirrors wallpaper translucency controls for legibility */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: backdropStyle.tintColor,
        }}
      />

      {/* Gradient overlay — adds edge protection without fully flattening the stream */}
      <div
        className="absolute inset-0"
        style={{
          background: backdropStyle.gradient,
        }}
      />

      {/* Controls (Pop out + LIVE) are rendered in thread.tsx above the viewport z-layer */}
    </div>
  );
}
