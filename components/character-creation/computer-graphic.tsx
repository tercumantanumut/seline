"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { useReducedMotion } from "./hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { ZLUTTY_EASINGS } from "@/lib/animations/utils";

interface ComputerGraphicProps {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to animate */
  animated?: boolean;
  /** CSS class for the container */
  className?: string;
  /** Content to display on the screen */
  screenContent?: React.ReactNode;
}

export function ComputerGraphic({
  size = "md",
  animated = true,
  className,
  screenContent,
}: ComputerGraphicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  const sizeClasses = {
    sm: "w-32 h-28",
    md: "w-48 h-40",
    lg: "w-64 h-52",
  };

  useEffect(() => {
    if (!shouldAnimate || !containerRef.current) return;

    // Subtle floating animation
    const floatAnimation = animate(containerRef.current, {
      translateY: [-4, 4, -4],
      duration: 4000,
      loop: true,
      ease: ZLUTTY_EASINGS.float,
    });

    // Subtle rotation
    const rotateAnimation = animate(containerRef.current, {
      rotateY: [-3, 3, -3],
      rotateX: [-1, 1, -1],
      duration: 6000,
      loop: true,
      ease: ZLUTTY_EASINGS.float,
    });

    return () => {
      floatAnimation.pause();
      rotateAnimation.pause();
    };
  }, [shouldAnimate]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative transform-gpu",
        sizeClasses[size],
        className
      )}
      style={{
        perspective: "1000px",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Monitor Body */}
      <div
        className="absolute inset-0 rounded-lg bg-gradient-to-b from-terminal-cream to-terminal-cream-dark shadow-lg"
        style={{
          transform: "translateZ(0px)",
        }}
      >
        {/* Screen Bezel */}
        <div className="absolute inset-3 rounded bg-terminal-dark shadow-inner overflow-hidden">
          {/* Screen Content */}
          <div className="absolute inset-1 bg-terminal-bg rounded-sm overflow-hidden">
            {/* Scanline Effect */}
            <div
              className="absolute inset-0 pointer-events-none opacity-10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)",
              }}
            />
            {/* Screen Glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-terminal-green/5 to-transparent pointer-events-none" />
            
            {/* Custom Screen Content or Default */}
            <div className="relative h-full p-2 font-mono text-xs text-terminal-green">
              {screenContent || <DefaultScreenContent />}
            </div>
          </div>
        </div>

        {/* Power LED */}
        <div className="absolute bottom-1.5 right-3 w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse shadow-glow-green" />
      </div>

      {/* Monitor Stand */}
      <div
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-3 bg-terminal-cream-dark border-2 border-terminal-border rounded-b"
        style={{
          transform: "translateZ(-5px) translateX(-50%)",
        }}
      />
      
      {/* Monitor Base */}
      <div
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-16 h-2 bg-terminal-cream-dark border-2 border-terminal-border rounded-full"
        style={{
          transform: "translateZ(-10px) translateX(-50%)",
        }}
      />
    </div>
  );
}

function DefaultScreenContent() {
  return (
    <div className="space-y-1">
	      <div className="text-terminal-amber">Selene</div>
      <div className="text-terminal-green opacity-70">{">"} _</div>
    </div>
  );
}

