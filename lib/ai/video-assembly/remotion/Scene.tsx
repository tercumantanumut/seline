/**
 * Scene Component
 *
 * Renders a single scene (image or video) with optional Ken Burns effect.
 * Ken Burns parameters are LLM-controlled based on user instructions.
 *
 * IMPORTANT: This component is expected to be rendered inside a Sequence,
 * which means useCurrentFrame() returns frames relative to scene start (0-based).
 * The startFrame and endFrame props should both be 0-based relative values.
 */

import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import type { SceneAsset, KenBurnsConfig } from "../types";

export interface SceneComponentProps {
  asset: SceneAsset;
  /** Start frame relative to scene (typically 0 when inside a Sequence) */
  startFrame: number;
  /** End frame relative to scene (typically durationFrames when inside a Sequence) */
  endFrame: number;
  opacity?: number;
}

/**
 * Get Remotion easing function based on config
 */
function getEasingFunction(easing: KenBurnsConfig["easing"]) {
  switch (easing) {
    case "linear":
      return Easing.linear;
    case "ease-in":
      return Easing.in(Easing.ease);
    case "ease-out":
      return Easing.out(Easing.ease);
    case "ease-in-out":
    default:
      return Easing.inOut(Easing.ease);
  }
}

/**
 * Scene component that displays an image or video asset.
 * Ken Burns effect is LLM-controlled via asset.kenBurnsEffect config.
 * Expects to be rendered inside a Remotion Sequence for proper frame context.
 */
export const Scene: React.FC<SceneComponentProps> = ({
  asset,
  startFrame,
  endFrame,
  opacity = 1,
}) => {
	  // useCurrentFrame() returns frame relative to parent Sequence (0-based)
	  const frame = useCurrentFrame();
	  const { fps, width, height } = useVideoConfig();

  // Calculate duration for animations
  // Since we're inside a Sequence, startFrame is typically 0
  const durationFrames = endFrame - startFrame;

  // Get Ken Burns config from asset (LLM-controlled)
  const kbConfig = asset.kenBurnsEffect;
  const kenBurnsEnabled = kbConfig?.enabled ?? asset.type === "image";

  // Calculate scale based on LLM-specified parameters
  let scale = 1;
  if (kenBurnsEnabled && kbConfig) {
    const startScale = kbConfig.direction === "in" ? 1 : kbConfig.endScale;
    const targetScale = kbConfig.direction === "in" ? kbConfig.endScale : 1;
    const easingFn = getEasingFunction(kbConfig.easing);

    scale = interpolate(frame, [0, durationFrames], [startScale, targetScale], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
      easing: easingFn,
    });
  }

	  // Calculate translation to focus on the specified focal point.
	  // We apply the Ken Burns transform to the MEDIA element (Img/Video) inside an
	  // overflow-hidden container. This way, the container always covers the
	  // viewport and the media moves/zooms behind it, eliminating black bands.
	  //
	  // Focal point (0.5, 0.5)  -> centered, no pan.
	  // Focal point (0, 0)      -> top-left area emphasized.
	  // Focal point (1, 1)      -> bottom-right area emphasized.
	  let translateX = 0;
	  let translateY = 0;
	  if (kenBurnsEnabled && kbConfig) {
	    // Offset from center in normalized coordinates [-0.5, 0.5]
	    const offsetX = kbConfig.focalPoint.x - 0.5;
	    const offsetY = kbConfig.focalPoint.y - 0.5;

	    // Extra image outside the frame due to zoom ("overscan").
	    // We only ever translate within this region so the frame stays fully
	    // covered and no black/empty bars become visible at any edge.
	    const maxTranslateX = (scale - 1) * width;
	    const maxTranslateY = (scale - 1) * height;

	    translateX = -offsetX * maxTranslateX;
	    translateY = -offsetY * maxTranslateY;
	  }

	  // Container stays fixed at composition bounds and only handles opacity.
	  // All zoom/pan transforms are applied to the inner media element.
	  const containerStyle: React.CSSProperties = {
	    opacity,
	    width: "100%",
	    height: "100%",
	    overflow: "hidden",
	  };

	  // Use will-change to hint browser for GPU acceleration on the media element.
	  // Round transform values to reduce sub-pixel rendering issues.
	  const mediaTransform = kenBurnsEnabled && kbConfig
	    ? `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px) scale(${scale.toFixed(4)})`
	    : undefined;

	  const mediaStyle: React.CSSProperties = {
	    width: "100%",
	    height: "100%",
	    objectFit: "cover",
	    transform: mediaTransform,
	    transformOrigin: "center center",
	    willChange: mediaTransform ? "transform" : undefined,
	  };

  // Determine if this is a video based on format or metadata
  const isVideo =
    asset.type === "video" ||
    asset.format === "mp4" ||
    asset.format === "webm" ||
    (asset.metadata?.mediaType === "video");

  // Convert local URL to absolute HTTP URL for Remotion
  // Remotion's browser-based renderer cannot access file:// URLs due to security restrictions
  // We need to use HTTP URLs served by the Next.js media API
  const getAssetUrl = (url: string): string => {
    // If it's already an absolute URL, use it
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // Determine base URL for media access:
    // Priority order:
    // 1. REMOTION_SERVE_URL - explicitly injected via webpack DefinePlugin during bundling
    //    This is the correct URL for accessing media files from the Next.js server
    // 2. NEXT_PUBLIC_APP_URL - from environment
    // 3. Default to localhost:3000 for development
    //
    // IMPORTANT: Do NOT use window.location.origin here!
    // Remotion's headless browser runs the bundle from a temp directory served on port 3000,
    // but media files are actually served by the Next.js server (port 3456 in Electron production).
    // Using window.location.origin would return the wrong port.
    const getBaseUrl = (): string => {
      // Use the injected REMOTION_SERVE_URL which points to the actual Next.js server
      if (process.env.REMOTION_SERVE_URL) {
        return process.env.REMOTION_SERVE_URL;
      }
      // Fallback to NEXT_PUBLIC_APP_URL or localhost:3000 for development
      return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    };

    const baseUrl = getBaseUrl();

    const token = process.env.REMOTION_MEDIA_TOKEN;

    // If it's a local API path, construct full HTTP URL
    // Remotion needs absolute HTTP URLs to load media in its headless browser
    if (url.startsWith("/api/media/")) {
      const fullUrl = `${baseUrl}${url}`;
      if (!token) return fullUrl;
      const separator = fullUrl.includes("?") ? "&" : "?";
      return `${fullUrl}${separator}internal_auth=${token}`;
    }
    // If it's a relative path without /api/media/, construct the full API URL
    if (!url.startsWith("/") && !url.includes("://")) {
      const fullUrl = `${baseUrl}/api/media/${url}`;
      if (!token) return fullUrl;
      return `${fullUrl}?internal_auth=${token}`;
    }
    return url;
  };

  const assetUrl = getAssetUrl(asset.url);

  // Calculate video duration in frames for the Video component
  // This tells Remotion how much of the source video to use
  const videoDurationFrames = Math.ceil((asset.duration || 3) * fps);

  // If scene is longer than video, we'll loop by not setting endAt
  // For now, just use the minimum to avoid black frames
  const effectiveEndAt = Math.min(videoDurationFrames, durationFrames);

  return (
    <AbsoluteFill style={containerStyle}>
      {isVideo ? (
        // Use OffthreadVideo for better performance in server-side rendering
        // It processes video frames off the main thread to prevent blocking
        <OffthreadVideo
          src={assetUrl}
          style={mediaStyle}
          // Video starts from beginning of source file
          startFrom={0}
          // Use the actual video duration or scene duration, whichever is shorter
          endAt={effectiveEndAt}
          // Mute by default to avoid audio sync issues
          muted
          // Ensure video doesn't show poster frame during transition
          pauseWhenBuffering={false}
        />
      ) : (
        <Img src={assetUrl} style={mediaStyle} />
      )}
    </AbsoluteFill>
  );
};

export default Scene;

