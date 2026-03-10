"use client";

/**
 * useBrowserInteraction - Manages interactive mode for the browser session viewer.
 *
 * When interactive mode is enabled, user mouse/keyboard events on the screencast
 * image are captured, translated to viewport coordinates, and sent to the
 * interact API endpoint. This lets users directly control the browser the agent is using.
 *
 * Coordinate mapping: the screencast is rendered with object-contain at arbitrary
 * display size, but the Playwright session always runs at a fixed 1280x720 viewport.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";

interface InteractPayload {
  type: "click" | "type" | "keypress" | "scroll" | "navigate";
  x?: number;
  y?: number;
  button?: string;
  clickCount?: number;
  text?: string;
  key?: string;
  modifiers?: number;
  deltaX?: number;
  deltaY?: number;
  url?: string;
}

interface UseBrowserInteractionOptions {
  sessionId: string;
  imgRef: RefObject<HTMLImageElement | null>;
  /** Whether interactive mode is currently active */
  enabled: boolean;
  /** Container element ref for attaching non-passive wheel listener */
  containerRef?: RefObject<HTMLElement | null>;
}

interface UseBrowserInteractionReturn {
  /** Attach to the screencast container's onMouseDown */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Whether a request is in-flight */
  isSending: boolean;
  /** Navigate to a URL */
  navigate: (url: string) => Promise<void>;
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

function getRenderedFrameMetrics(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect();
  const scale = Math.min(rect.width / VIEWPORT_W, rect.height / VIEWPORT_H);
  const renderedW = VIEWPORT_W * scale;
  const renderedH = VIEWPORT_H * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;

  return { rect, renderedW, renderedH, offsetX, offsetY };
}

/**
 * Map a pointer position on the rendered <img> element to browser viewport coordinates.
 *
 * The screencast can be emitted at HiDPI pixel sizes, so we map against the known
 * Playwright viewport instead of img.naturalWidth/img.naturalHeight.
 */
function mapPointToViewport(
  clientX: number,
  clientY: number,
  img: HTMLImageElement
): { x: number; y: number } | null {
  const { rect, renderedW, renderedH, offsetX, offsetY } = getRenderedFrameMetrics(img);
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  if (
    mouseX < offsetX ||
    mouseX > offsetX + renderedW ||
    mouseY < offsetY ||
    mouseY > offsetY + renderedH
  ) {
    return null;
  }

  const viewportX = ((mouseX - offsetX) / renderedW) * VIEWPORT_W;
  const viewportY = ((mouseY - offsetY) / renderedH) * VIEWPORT_H;

  return { x: Math.round(viewportX), y: Math.round(viewportY) };
}

export function useBrowserInteraction({
  sessionId,
  imgRef,
  enabled,
  containerRef,
}: UseBrowserInteractionOptions): UseBrowserInteractionReturn {
  const [isSending, setIsSending] = useState(false);

  const sendInteraction = useCallback(async (payload: InteractPayload) => {
    if (!sessionId) return;

    setIsSending(true);
    try {
      await fetch(`/api/browser/${sessionId}/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[BrowserInteraction] Failed to send:", err);
    } finally {
      setIsSending(false);
    }
  }, [sessionId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled || !imgRef.current) return;

    const pos = mapPointToViewport(e.clientX, e.clientY, imgRef.current);
    if (!pos) return;

    e.preventDefault();

    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
    void sendInteraction({
      type: "click",
      x: pos.x,
      y: pos.y,
      button,
      clickCount: e.detail || 1,
    });
  }, [enabled, imgRef, sendInteraction]);


  // Non-passive wheel listener attached via useEffect so preventDefault() works.
  useEffect(() => {
    const el = containerRef?.current;
    if (!el || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      const img = imgRef.current;
      if (!img) return;

      const pos = mapPointToViewport(e.clientX, e.clientY, img);
      if (!pos) return;

      e.preventDefault();
      void sendInteraction({
        type: "scroll",
        x: pos.x,
        y: pos.y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, containerRef, imgRef, sendInteraction]);

  const navigate = useCallback(async (url: string) => {
    if (!url) return;
    const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
    await sendInteraction({ type: "navigate", url: normalizedUrl });
  }, [sendInteraction]);

  return {
    handleMouseDown,
    isSending,
    navigate,
  };
}
