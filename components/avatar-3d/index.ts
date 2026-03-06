// =============================================================================
// Avatar 3D — Barrel exports
// =============================================================================

// Types
export type {
  Avatar3DConfig,
  Avatar3DRef,
  AvatarLoadState,
  VisemeCue,
  TalkingHeadInstance,
  TalkingHeadModule,
  TalkingHeadAudioPayload,
  TalkingHeadSpeakOptions,
  TalkingHeadConstructor,
  TalkingHeadConstructorOptions,
  TalkingHeadShowAvatarOptions,
} from "./types";

// Components
export { AvatarRenderer } from "./avatar-renderer";
export type { AvatarRendererProps } from "./avatar-renderer";

export { EmotionBadge } from "./emotion-badge";
export type { EmotionBadgeProps } from "./emotion-badge";

// Hook
export { useAvatar } from "./use-avatar";

// -----------------------------------------------------------------------------
// Lazy-loadable version (for code-splitting)
// -----------------------------------------------------------------------------

import { lazy } from "react";

/**
 * Lazy-loaded AvatarRenderer for use with React.Suspense.
 * Zero-cost when avatar is never rendered.
 *
 * Usage:
 * ```tsx
 * <Suspense fallback={<LoadingSkeleton />}>
 *   <LazyAvatarRenderer config={config} ref={avatarRef} />
 * </Suspense>
 * ```
 */
export const LazyAvatarRenderer = lazy(() =>
  import("./avatar-renderer").then((mod) => ({
    default: mod.AvatarRenderer,
  })),
);
