"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import type { BackgroundConfig } from "@/lib/personalization/wallpapers";
import { getWallpaperById } from "@/lib/personalization/wallpapers";
import { getVideoWallpaperById } from "@/lib/personalization/video-wallpapers";
import { useReducedMotion } from "@/lib/animations/hooks";

interface BackgroundLayerProps {
  config: BackgroundConfig;
  className?: string;
}

/**
 * Renders a background layer (wallpaper, color, URL, or video) behind content.
 * Should be placed as the first child in a `relative` container.
 *
 * Video backgrounds use a dual-layer crossfade strategy:
 * - Two identical <video> elements alternate roles (active/standby)
 * - Near end of active video, standby starts at t=0 and opacity crossfades
 * - Eliminates visible loop-rollback snap on non-perfectly-looped MP4s
 *
 * Performance notes:
 * - Opacity transitions driven via direct DOM style mutation (no React re-renders)
 * - GPU layer promotion via will-change + translateZ(0)
 * - One-shot setTimeout per loop cycle instead of polling interval
 * - Standby video uses preload="metadata" until crossfade begins
 * - Video src released on cleanup to free GPU decode buffers (Chromium #18277)
 * - Respects prefers-reduced-motion: shows poster image instead of video
 */
export function BackgroundLayer({ config, className = "" }: BackgroundLayerProps) {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const opacity = (config.opacity ?? 30) / 100;
  const blur = config.blur ?? 0;
  const filterStyle = blur > 0 ? `blur(${blur}px)` : undefined;
  const transformStyle = blur > 0 ? "scale(1.1)" : undefined;

  const videoConfig =
    config.type === "video" && config.videoId
      ? getVideoWallpaperById(config.videoId)
      : undefined;

  // P1-10: Extract overlap calculation to useMemo — single source of truth
  const overlapSeconds = useMemo(() => {
    if (!videoConfig) return 0;
    return Math.min(
      1.2,
      Math.max(0.6, Math.floor(videoConfig.duration * 0.12 * 10) / 10)
    );
  }, [videoConfig?.duration]);

  // P0-3: Error handler triggers re-render → falls back to poster
  const handleVideoError = useCallback(() => {
    setVideoError(true);
  }, []);

  // Unified video lifecycle: init, crossfade scheduling, visibility handling
  // Single effect avoids circular useCallback dependencies between
  // scheduleNextCrossfade ↔ startCrossfade
  useEffect(() => {
    if (!videoConfig || prefersReducedMotion) return;

    setVideoError(false);

    const primary = primaryVideoRef.current;
    const secondary = secondaryVideoRef.current;
    if (!primary || !secondary) return;

    // Mutable state scoped to this effect instance
    let activeLayer: 0 | 1 = 0;
    let isCrossfading = false;
    let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
    let loopTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (crossfadeTimer) {
        clearTimeout(crossfadeTimer);
        crossfadeTimer = null;
      }
      if (loopTimer) {
        clearTimeout(loopTimer);
        loopTimer = null;
      }
    };

    const getVideos = () => {
      const active = activeLayer === 0 ? primary : secondary;
      const standby = activeLayer === 0 ? secondary : primary;
      return { active, standby };
    };

    // P1-7: One-shot setTimeout calculated from remaining time
    const scheduleNextCrossfade = () => {
      if (disposed || isCrossfading || document.hidden) return;

      const { active } = getVideos();
      if (!Number.isFinite(active.duration)) return;

      const remaining =
        active.duration - active.currentTime - overlapSeconds;

      if (remaining <= 0) {
        startCrossfade();
        return;
      }

      loopTimer = setTimeout(() => {
        loopTimer = null;
        if (!disposed) startCrossfade();
      }, remaining * 1000);
    };

    const startCrossfade = () => {
      if (disposed || isCrossfading || document.hidden) return;

      const { active, standby } = getVideos();
      if (!Number.isFinite(active.duration)) return;

      isCrossfading = true;
      if (loopTimer) {
        clearTimeout(loopTimer);
        loopTimer = null;
      }

      // Prepare standby: seek to 0, start playback
      standby.currentTime = 0;
      standby.play().catch(() => {
        isCrossfading = false;
      });

      // P1-8: Direct DOM style mutation — zero React re-renders
      const overlapMs = Math.round(overlapSeconds * 1000);
      active.style.transition = `opacity ${overlapSeconds}s linear`;
      standby.style.transition = `opacity ${overlapSeconds}s linear`;
      active.style.opacity = "0";
      standby.style.opacity = "1";

      crossfadeTimer = setTimeout(() => {
        crossfadeTimer = null;
        if (disposed) return;

        active.pause();
        active.currentTime = 0;
        active.style.transition = "";
        standby.style.transition = "";

        activeLayer = activeLayer === 0 ? 1 : 0;
        isCrossfading = false;

        // Chain: schedule next crossfade for the now-active video
        scheduleNextCrossfade();
      }, overlapMs);
    };

    // P2-15: Visibility handler pauses timer and reschedules on return
    const handleVisibility = () => {
      if (disposed) return;

      if (document.hidden) {
        primary.pause();
        secondary.pause();
        // Cancel scheduled crossfade — reschedule when tab returns
        if (loopTimer) {
          clearTimeout(loopTimer);
          loopTimer = null;
        }
        return;
      }

      // Tab visible again
      if (isCrossfading) {
        // Mid-crossfade: resume both layers
        primary.play().catch(() => {});
        secondary.play().catch(() => {});
        return;
      }

      // Resume active video and reschedule
      const { active } = getVideos();
      active
        .play()
        .then(() => {
          if (!disposed) scheduleNextCrossfade();
        })
        .catch(() => {});
    };

    // ── Initialize ──
    clearTimers();
    primary.pause();
    secondary.pause();
    primary.currentTime = 0;
    secondary.currentTime = 0;

    // Reset DOM opacity (P1-8: not via React state)
    primary.style.opacity = "1";
    primary.style.transition = "";
    secondary.style.opacity = "0";
    secondary.style.transition = "";

    activeLayer = 0;
    isCrossfading = false;

    const playPrimary = () => {
      if (disposed) return;
      primary
        .play()
        .then(() => {
          if (!disposed) scheduleNextCrossfade();
        })
        .catch(() => {});
    };

    if (primary.readyState >= 3) {
      playPrimary();
    } else {
      primary.addEventListener("canplay", playPrimary, { once: true });
    }

    document.addEventListener("visibilitychange", handleVisibility);

    // ── Cleanup ──
    return () => {
      disposed = true;
      clearTimers();
      primary.removeEventListener("canplay", playPrimary);
      document.removeEventListener("visibilitychange", handleVisibility);

      // P0-5: Release GPU decode buffers (Chromium issue #18277)
      // removeAttribute('src') + load() forces decoder teardown
      primary.pause();
      primary.removeAttribute("src");
      primary.load();
      secondary.pause();
      secondary.removeAttribute("src");
      secondary.load();
    };
    // P1-9: Stable string dep instead of object reference
  }, [videoConfig?.videoUrl, prefersReducedMotion, overlapSeconds]);

  if (config.type === "none") return null;

  // ── Video background ──
  if (videoConfig) {
    // P0-1: Reduced motion → show poster image, no video playback
    if (prefersReducedMotion || videoError) {
      return (
        <div
          className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
          aria-hidden="true"
        >
          <img
            src={videoConfig.posterUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{
              opacity,
              filter: filterStyle,
              transform: transformStyle,
            }}
          />
        </div>
      );
    }

    // P0-4: GPU layer promotion for smooth compositing
    const videoBaseStyle = {
      willChange: "opacity" as const,
      transform: "translateZ(0)",
    };

    return (
      <div
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{ opacity, filter: filterStyle, transform: transformStyle }}
        >
          {/* P0-2: No autoPlay — playback controlled via useEffect .play() calls */}
          <video
            ref={primaryVideoRef}
            muted
            playsInline
            preload="auto"
            src={videoConfig.videoUrl}
            poster={videoConfig.posterUrl}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ ...videoBaseStyle, opacity: 1 }}
            onError={handleVideoError}
          />
          {/* P1-6: Standby uses preload="metadata" — no eager decode until crossfade */}
          <video
            ref={secondaryVideoRef}
            muted
            playsInline
            preload="metadata"
            src={videoConfig.videoUrl}
            poster={videoConfig.posterUrl}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ ...videoBaseStyle, opacity: 0 }}
            onError={handleVideoError}
          />
        </div>
      </div>
    );
  }

  // ── Static backgrounds (wallpaper, url, color) ──
  let backgroundUrl: string | undefined;
  let backgroundColor: string | undefined;

  if (config.type === "wallpaper" && config.wallpaperId) {
    const wp = getWallpaperById(config.wallpaperId);
    backgroundUrl = wp?.url ?? config.url;
  } else if (config.type === "url") {
    backgroundUrl = config.url;
  } else if (config.type === "color") {
    backgroundColor = config.color;
  }

  if (!backgroundUrl && !backgroundColor) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{
            opacity,
            filter: filterStyle,
            transform: transformStyle,
          }}
          loading="lazy"
        />
      ) : (
        <div
          className="h-full w-full"
          style={{
            backgroundColor,
            opacity,
          }}
        />
      )}
    </div>
  );
}
