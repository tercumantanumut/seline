"use client";

import type { FC } from "react";
import { useEffect, useRef } from "react";
import { ThreadPrimitive } from "@assistant-ui/react";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

  // Extract short labels for suggestion buttons (first 2-3 words or truncate)
  const getSuggestionLabel = (prompt: string): string => {
    const words = prompt.split(" ");
    if (words.length <= 3) return prompt;
    return words.slice(0, 3).join(" ") + "...";
  };

  // Entrance animation
  useEffect(() => {
    if (!welcomeRef.current || prefersReducedMotion) return;

    animate(welcomeRef.current, {
      opacity: [0, 1],
      translateY: [20, 0],
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
            <AvatarFallback className="bg-terminal-green/10 text-2xl font-mono text-terminal-green">
              {displayChar.initials || <User className="size-8 text-terminal-green" />}
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
