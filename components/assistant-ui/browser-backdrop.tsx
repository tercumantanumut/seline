"use client";

/**
 * BrowserBackdrop — Live browser video as chat background
 *
 * Connects to the CDP screencast SSE stream and renders real-time
 * browser frames as a blurred, dimmed backdrop behind chat messages.
 *
 * Self-contained: probes the SSE endpoint every 5s to detect when a
 * browser session becomes active. Fades in with first frame, fades
 * out when the session closes (SSE returns 404).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface BrowserBackdropProps {
  /** The chat session ID — used to connect to the screencast stream */
  sessionId?: string;
  className?: string;
  /** Called when the backdrop becomes active (has frames) or inactive */
  onActiveChange?: (active: boolean) => void;
}

export function BrowserBackdrop({ sessionId, className, onActiveChange }: BrowserBackdropProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!sessionId) {
      cleanupAll();
      setHasFrame(false);
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
            if (mounted && !hasFrame) setHasFrame(true);
          }
        } catch {
          // Malformed frame, skip
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (mounted) {
          setIsConnected(false);
          // Fade out after losing connection
          setTimeout(() => {
            if (mounted && !eventSourceRef.current) setHasFrame(false);
          }, 1500);
        }
      };
    };

    // Probe: check if a screencast is active, then connect
    const probe = async () => {
      if (!mounted || eventSourceRef.current) return;
      try {
        const res = await fetch(`/api/browser/${sessionId}/stream`, {
          method: "HEAD",
        });
        // If not 404, a screencast is running — connect
        if (res.ok || res.status === 200) {
          connectStream();
        }
      } catch {
        // Network error, ignore
      }
    };

    // Initial probe + periodic retry
    void probe();
    probeIntervalRef.current = setInterval(probe, 5000);

    return () => {
      mounted = false;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
          filter: "brightness(0.7) saturate(1.1)",
        }}
      />

      {/* Light gradient overlay — keeps text readable without hiding the browser */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.05) 70%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* Connection indicator */}
      {isConnected && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-sm">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          <span className="text-[10px] font-medium text-white/60">LIVE</span>
        </div>
      )}
    </div>
  );
}
