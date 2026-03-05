"use client";

import { cn } from "@/lib/utils";

// =============================================================================
// Props
// =============================================================================

interface EmotionBadgeProps {
  /** The detected emotion label (e.g. "happy", "neutral", "sad") */
  emotion: string;
  /** Emotion intensity from 0 (barely detectable) to 1 (strong) */
  intensity: number;
  /** Whether the badge is visible */
  visible: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Intensity tier styling
// =============================================================================

/**
 * Returns opacity styling based on intensity.
 * Higher intensity = more visually prominent badge.
 */
function getIntensityStyles(intensity: number): string {
  if (intensity >= 0.8) return "opacity-100";
  if (intensity >= 0.5) return "opacity-90";
  if (intensity >= 0.3) return "opacity-75";
  return "opacity-60";
}

// =============================================================================
// Component
// =============================================================================

/**
 * Small pill-shaped badge that displays the current detected emotion.
 *
 * Positioned by the parent (typically absolute bottom-right of the avatar).
 * Uses amber theming to match the existing emotion display in the fork's
 * AvatarPanel status bar.
 */
function EmotionBadge({
  emotion,
  intensity,
  visible,
  className,
}: EmotionBadgeProps) {
  return (
    <div
      className={cn(
        // Base styles
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "bg-amber-500/15 text-amber-400 border border-amber-500/20",
        "text-[11px] font-mono leading-none select-none",
        // Smooth transitions
        "transition-all duration-300 ease-in-out",
        // Visibility
        visible
          ? "translate-y-0 scale-100"
          : "translate-y-1 scale-95 pointer-events-none opacity-0",
        // Intensity-based opacity (only applies when visible)
        visible && getIntensityStyles(intensity),
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={
        visible ? `Detected emotion: ${emotion}` : "No emotion detected"
      }
      data-testid="emotion-badge"
      data-emotion={emotion}
      data-intensity={intensity}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-amber-400",
          // Pulse the dot at high intensity
          intensity >= 0.7 && "animate-pulse",
        )}
        aria-hidden="true"
      />
      <span>{emotion}</span>
    </div>
  );
}

export { EmotionBadge };
export type { EmotionBadgeProps };
