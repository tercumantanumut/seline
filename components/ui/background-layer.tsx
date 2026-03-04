"use client";

import { useEffect, useRef } from "react";
import type { BackgroundConfig } from "@/lib/personalization/wallpapers";
import { getWallpaperById } from "@/lib/personalization/wallpapers";
import { getVideoWallpaperById } from "@/lib/personalization/video-wallpapers";

interface BackgroundLayerProps {
  config: BackgroundConfig;
  className?: string;
}

/**
 * Renders a background layer (wallpaper, color, URL, or video) behind content.
 * Should be placed as the first child in a `relative` container.
 */
export function BackgroundLayer({ config, className = "" }: BackgroundLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Force play on mount + pause/resume on visibility change
  useEffect(() => {
    if (config.type !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    // Force play — autoPlay attribute alone can fail on hydration
    const tryPlay = () => {
      video.play().catch(() => {});
    };

    // Play immediately if ready, otherwise wait for canplay
    if (video.readyState >= 3) {
      tryPlay();
    } else {
      video.addEventListener("canplay", tryPlay, { once: true });
    }

    const handleVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      video.removeEventListener("canplay", tryPlay);
    };
  }, [config.type, config.videoId]);

  if (config.type === "none") return null;

  const opacity = (config.opacity ?? 30) / 100;
  const blur = config.blur ?? 0;

  const filterStyle = blur > 0 ? `blur(${blur}px)` : undefined;
  const transformStyle = blur > 0 ? "scale(1.1)" : undefined;

  // Video background
  if (config.type === "video" && config.videoId) {
    const video = getVideoWallpaperById(config.videoId);
    if (!video) return null;

    return (
      <div
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
        aria-hidden
      >
        <video
          ref={videoRef}
          key={video.videoUrl}
          autoPlay
          muted
          loop
          playsInline
          poster={video.posterUrl}
          className="h-full w-full object-cover"
          style={{
            opacity,
            filter: filterStyle,
            transform: transformStyle,
          }}
          preload="auto"
          src={video.videoUrl}
        />
      </div>
    );
  }

  // Static backgrounds (wallpaper, url, color)
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
      aria-hidden
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
