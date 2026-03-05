"use client";

/**
 * useBrowserInteraction — Manages interactive mode for the browser session viewer.
 *
 * When interactive mode is enabled, user mouse/keyboard events on the screencast
 * image are captured, translated to viewport coordinates, and sent to the
 * interact API endpoint. This lets users directly control the browser the agent is using.
 *
 * Coordinate mapping: The screencast image is rendered with object-contain at
 * arbitrary display size, but the actual browser viewport is typically 1280×720.
 * We compute the mapping by comparing the image's natural size to its rendered size.
 */

import { useCallback, useRef, useState, useEffect, type RefObject } from "react";

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
}

interface UseBrowserInteractionReturn {
  /** Attach to the screencast container's onMouseDown */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Attach to the screencast container's onMouseMove */
  handleMouseMove: (e: React.MouseEvent) => void;
  /** Attach to the screencast container's onWheel */
  handleWheel: (e: React.WheelEvent) => void;
  /** Current cursor position in viewport coordinates (for overlay) */
  cursorPos: { x: number; y: number } | null;
  /** Whether a request is in-flight */
  isSending: boolean;
  /** Navigate to a URL */
  navigate: (url: string) => Promise<void>;
}

/**
 * Map a mouse event's position on the rendered <img> element to
 * the actual browser viewport coordinates.
 *
 * The image uses `object-contain`, so it may have letterboxing.
 * We need to account for the offset and scale.
 */
function mapToViewport(
  e: React.MouseEvent | React.WheelEvent,
  img: HTMLImageElement
): { x: number; y: number } | null {
  const rect = img.getBoundingClientRect();
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;

  if (!naturalW || !naturalH) return null;

  // Calculate the rendered image dimensions within the container (object-contain)
  const containerW = rect.width;
  const containerH = rect.height;
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;

  // Offset from container top-left to image top-left (letterboxing)
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;

  // Mouse position relative to the container
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Check if click is within the rendered image area
  if (
    mouseX < offsetX || mouseX > offsetX + renderedW ||
    mouseY < offsetY || mouseY > offsetY + renderedH
  ) {
    return null; // Click is in the letterbox area
  }

  // Map to viewport coordinates
  const viewportX = ((mouseX - offsetX) / renderedW) * naturalW;
  const viewportY = ((mouseY - offsetY) / renderedH) * naturalH;

  return { x: Math.round(viewportX), y: Math.round(viewportY) };
}

export function useBrowserInteraction({
  sessionId,
  imgRef,
  enabled,
}: UseBrowserInteractionOptions): UseBrowserInteractionReturn {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendInteraction = useCallback(async (payload: InteractPayload) => {
    if (!sessionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSending(true);
    try {
      await fetch(`/api/browser/${sessionId}/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
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

    const pos = mapToViewport(e, imgRef.current);
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled || !imgRef.current) return;

    const pos = mapToViewport(e, imgRef.current);
    setCursorPos(pos);
  }, [enabled, imgRef]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!enabled || !imgRef.current) return;

    const pos = mapToViewport(e, imgRef.current);
    if (!pos) return;

    e.preventDefault();

    void sendInteraction({
      type: "scroll",
      x: pos.x,
      y: pos.y,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  }, [enabled, imgRef, sendInteraction]);

  const navigate = useCallback(async (url: string) => {
    if (!url) return;
    // Auto-add protocol if missing
    const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
    await sendInteraction({ type: "navigate", url: normalizedUrl });
  }, [sendInteraction]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleWheel,
    cursorPos,
    isSending,
    navigate,
  };
}
