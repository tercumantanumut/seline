"use client";

/**
 * useActionIndicators — Manages visual action indicator overlays for the browser session viewer.
 *
 * Receives action SSE events (via addAction), maps viewport coordinates to display
 * coordinates on the screencast image, and maintains a time-limited queue of indicators
 * that auto-remove after their animation completes.
 */

import { useCallback, useRef, useState, useEffect, type RefObject } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionIndicator {
  id: string;
  action: string;
  x?: number;
  y?: number;
  source: "agent" | "user";
  timestamp: number;
  input: Record<string, unknown>;
}

export interface ActionSSEData {
  seq: number;
  action: string;
  input: Record<string, unknown>;
  source?: "agent" | "user";
  timestamp?: string;
  success?: boolean;
  durationMs?: number;
}

interface UseActionIndicatorsOptions {
  sessionId: string;
  imgRef: RefObject<HTMLImageElement | null>;
  enabled: boolean;
}

interface UseActionIndicatorsReturn {
  indicators: ActionIndicator[];
  addAction: (data: ActionSSEData) => void;
  clearIndicators: () => void;
}

// ─── Duration map ─────────────────────────────────────────────────────────────

const ANIMATION_DURATIONS: Record<string, number> = {
  click: 700,
  scroll: 500,
  type: 1000,
  navigate: 700,
};

function getAnimationDuration(action: string): number {
  return ANIMATION_DURATIONS[action] ?? 700;
}

// ─── Coordinate mapping ───────────────────────────────────────────────────────

/**
 * Maps viewport coordinates (from the browser) to display coordinates
 * relative to the rendered screencast image element.
 *
 * This is the inverse of mapToViewport in use-browser-interaction.ts.
 */
function viewportToDisplay(
  viewportX: number,
  viewportY: number,
  img: HTMLImageElement
): { x: number; y: number } | null {
  const rect = img.getBoundingClientRect();
  // Viewport is always 1280x720 as set in session-manager.ts.
  // Using naturalWidth/naturalHeight would be wrong on HiDPI/Retina
  // displays where the screencast frame is rendered at 2x pixel ratio.
  const VIEWPORT_W = 1280;
  const VIEWPORT_H = 720;

  const scale = Math.min(rect.width / VIEWPORT_W, rect.height / VIEWPORT_H);
  const renderedW = VIEWPORT_W * scale;
  const renderedH = VIEWPORT_H * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;

  const displayX = (viewportX / VIEWPORT_W) * renderedW + offsetX;
  const displayY = (viewportY / VIEWPORT_H) * renderedH + offsetY;

  return { x: displayX, y: displayY };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

let indicatorCounter = 0;

export function useActionIndicators({
  imgRef,
  enabled,
}: UseActionIndicatorsOptions): UseActionIndicatorsReturn {
  const [indicators, setIndicators] = useState<ActionIndicator[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearIndicators = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    setIndicators([]);
  }, []);

  // M4: Use a ref for enabled so addAction never holds a stale closure
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Cleanup all timers on unmount
  useEffect(() => clearIndicators, [clearIndicators]);

  useEffect(() => {
    if (enabled) return;
    clearIndicators();
  }, [enabled, clearIndicators]);

  const addAction = useCallback(
    (data: ActionSSEData) => {
      if (!enabledRef.current) return;

      const img = imgRef.current;
      if (!img) return;

      const id = `action-${++indicatorCounter}`;
      const source = data.source ?? "agent";

      // Map coordinates if present
      let x: number | undefined;
      let y: number | undefined;

      const inputX = data.input?.x;
      const inputY = data.input?.y;

      if (typeof inputX === "number" && typeof inputY === "number") {
        const display = viewportToDisplay(inputX, inputY, img);
        if (display) {
          x = display.x;
          y = display.y;
        }
      }

      // Agent clicks use selectors, not coordinates — show centered ripple
      if (data.action === "click" && x == null && y == null) {
        if (img) {
          const rect = img.getBoundingClientRect();
          x = rect.width / 2;
          y = rect.height / 2;
        }
      }

      const indicator: ActionIndicator = {
        id,
        action: data.action,
        x,
        y,
        source,
        timestamp: Date.now(),
        input: data.input ?? {},
      };

      setIndicators((prev) => {
        const next = [...prev, indicator];
        // Cap at 30 to prevent memory issues during action bursts
        return next.length > 30 ? next.slice(-30) : next;
      });

      // Schedule removal after animation duration
      const duration = getAnimationDuration(data.action);
      const timer = setTimeout(() => {
        setIndicators((prev) => prev.filter((i) => i.id !== id));
        timersRef.current.delete(id);
      }, duration);

      timersRef.current.set(id, timer);
    },
    [imgRef]
  );

  return { indicators, addAction, clearIndicators };
}
