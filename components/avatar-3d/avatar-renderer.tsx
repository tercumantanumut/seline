"use client";

import {
  forwardRef,
  useRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useAvatar } from "./use-avatar";
import type { Avatar3DConfig, Avatar3DRef } from "./types";

// =============================================================================
// Props
// =============================================================================

interface AvatarRendererProps {
  /** Configuration for the 3D avatar */
  config: Avatar3DConfig;
  /** Optional fallback content shown when 3D is unavailable or disabled */
  fallback?: ReactNode;
  /** Additional CSS classes for the outer container */
  className?: string;
}

// =============================================================================
// Loading skeleton
// =============================================================================

function AvatarLoadingSkeleton() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Loading 3D avatar"
    >
      <div className="relative size-12">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        Loading model...
      </span>
    </div>
  );
}

// =============================================================================
// Fallback content (shown when 3D fails or is disabled)
// =============================================================================

function AvatarFallbackContent({ children }: { children?: ReactNode }) {
  if (children) {
    return <>{children}</>;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <svg
          className="size-10 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
        <span className="text-xs font-mono">3D unavailable</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

/**
 * Avatar3D renderer component.
 *
 * Wraps TalkingHead.js in a React-friendly container with:
 * - Loading skeleton while the 3D engine initializes
 * - Graceful fallback if TalkingHead.js fails to load
 * - Responsive sizing (fills parent container)
 * - Imperative API via ref for speech/mood control
 */
const AvatarRenderer = forwardRef<Avatar3DRef, AvatarRendererProps>(
  function AvatarRenderer({ config, fallback, className }, forwardedRef) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { ref: avatarRef, state } = useAvatar(config, containerRef);

    // Expose Avatar3DRef methods via the forwarded ref
    useImperativeHandle(forwardedRef, () => avatarRef, [avatarRef]);

    // Disabled — render fallback immediately
    if (!config.enabled) {
      return (
        <div
          className={cn("relative w-full h-full overflow-hidden", className)}
          data-testid="avatar-3d-container"
          data-state="disabled"
        >
          <AvatarFallbackContent>{fallback}</AvatarFallbackContent>
        </div>
      );
    }

    return (
      <div
        className={cn("relative w-full h-full overflow-hidden", className)}
        style={{
          backgroundColor: config.backgroundColor ?? "transparent",
        }}
        data-testid="avatar-3d-container"
        data-state={state}
      >
        {/* Three.js canvas target — always mounted so TalkingHead can attach */}
        <div
          ref={containerRef}
          className="w-full h-full"
          data-testid="avatar-3d-canvas"
        />

        {/* Loading overlay */}
        {state === "loading" && <AvatarLoadingSkeleton />}

        {/* Error fallback overlay */}
        {state === "error" && (
          <AvatarFallbackContent>{fallback}</AvatarFallbackContent>
        )}
      </div>
    );
  },
);

export { AvatarRenderer };
export type { AvatarRendererProps };
