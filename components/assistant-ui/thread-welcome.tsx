"use client";

import type { FC } from "react";
import { useEffect, useRef, useMemo } from "react";
import { ThreadPrimitive } from "@assistant-ui/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GradientBackground } from "@/components/ui/noisy-gradient-backgrounds";
import type { GradientColor } from "@/components/ui/noisy-gradient-backgrounds";
import { getAgentAccentColor } from "@/lib/personalization/accent-colors";
import { useCharacter, DEFAULT_CHARACTER } from "./character-context";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";

export const ThreadWelcome: FC = () => {
  const { character } = useCharacter();
  const displayChar = character || DEFAULT_CHARACTER;
  const welcomeRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("assistantUi");

  const accentColor = useMemo(
    () => getAgentAccentColor(displayChar.id),
    [displayChar.id]
  );

  const gradientColors = useMemo((): GradientColor[] => {
    const hex = accentColor.hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dr = Math.max(0, Math.round(r * 0.3));
    const dg = Math.max(0, Math.round(g * 0.3));
    const db = Math.max(0, Math.round(b * 0.3));
    return [
      { color: `rgba(${dr},${dg},${db},1)`, stop: "0%" },
      { color: `rgba(${r},${g},${b},1)`, stop: "60%" },
      { color: `rgba(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)},1)`, stop: "100%" },
    ];
  }, [accentColor.hex]);

  // Extract short labels for suggestion buttons (first 2-3 words or truncate)
  const getSuggestionLabel = (prompt: string): string => {
    const words = prompt.split(" ");
    if (words.length <= 3) return prompt;
    return words.slice(0, 3).join(" ") + "...";
  };

  // Entrance animation — fade in only (no translateY to prevent layout jump on tab switch)
  useEffect(() => {
    if (!welcomeRef.current || prefersReducedMotion) return;

    animate(welcomeRef.current, {
      opacity: [0, 1],
      duration: ZLUTTY_DURATIONS.normal,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  // Ambient avatar animation
  useEffect(() => {
    if (!avatarRef.current || prefersReducedMotion) return;

    const anim = animate(avatarRef.current, {
      translateY: [-3, 3, -3],
      rotateY: [-2, 2, -2],
      duration: ZLUTTY_DURATIONS.ambientLoop,
      loop: true,
      ease: ZLUTTY_EASINGS.float,
    });

    return () => {
      anim.pause();
    };
  }, [prefersReducedMotion]);

  return (
    <ThreadPrimitive.Empty>
      <div ref={welcomeRef} className="flex flex-grow basis-full flex-col items-center justify-center" style={{ opacity: prefersReducedMotion ? 1 : 0 }}>
        {/* Character Avatar */}
        <div ref={avatarRef} className="transform-gpu" style={{ perspective: "500px" }}>
          <Avatar className="size-16 shadow-md">
            {displayChar.avatarUrl || displayChar.primaryImageUrl ? (
              <AvatarImage
                src={displayChar.avatarUrl || displayChar.primaryImageUrl || undefined}
                alt={displayChar.name}
              />
            ) : null}
            <AvatarFallback className="relative overflow-hidden">
              <GradientBackground
                colors={gradientColors}
                gradientOrigin="bottom-middle"
                gradientSize="150% 150%"
                noiseIntensity={0.9}
                noisePatternAlpha={45}
                noisePatternSize={60}
                noisePatternRefreshInterval={7}
                className="rounded-full"
              />
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Character Name */}
        <p className="mt-4 text-xl font-semibold font-mono text-terminal-dark">
          {displayChar.displayName || displayChar.name}
        </p>

        {/* Tagline / Greeting */}
        <p className="mt-2 text-center text-terminal-muted font-mono text-sm max-w-md">
          {displayChar.exampleGreeting ||
            displayChar.tagline ||
            t("welcome.start", { name: displayChar.name })}
        </p>

        {/* Suggested Prompts */}
        {displayChar.suggestedPrompts && displayChar.suggestedPrompts.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {displayChar.suggestedPrompts.map((prompt, index) => (
              <ThreadPrimitive.Suggestion
                key={index}
                prompt={prompt}
                autoSend
                asChild
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs text-terminal-dark hover:bg-terminal-dark hover:text-terminal-cream transition-colors"
                >
                  {getSuggestionLabel(prompt)}
                </Button>
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        )}
      </div>
    </ThreadPrimitive.Empty>
  );
};
