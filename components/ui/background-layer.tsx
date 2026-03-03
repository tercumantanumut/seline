"use client";

import type { BackgroundConfig } from "@/lib/personalization/wallpapers";
import { getWallpaperById } from "@/lib/personalization/wallpapers";

interface BackgroundLayerProps {
  config: BackgroundConfig;
  className?: string;
}

/**
 * Renders a background layer (wallpaper, color, or URL) behind content.
 * Should be placed as the first child in a `relative` container.
 */
export function BackgroundLayer({ config, className = "" }: BackgroundLayerProps) {
  if (config.type === "none") return null;

  const opacity = (config.opacity ?? 30) / 100;
  const blur = config.blur ?? 0;

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
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
      aria-hidden
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{
            opacity,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            transform: blur > 0 ? "scale(1.1)" : undefined,
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
