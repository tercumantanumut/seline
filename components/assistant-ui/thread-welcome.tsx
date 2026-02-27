"use client";

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_DURATIONS, ZLUTTY_EASINGS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";
import {
  dispatchChatModalEvent,
  OPEN_CHANNELS_DIALOG_EVENT,
  OPEN_SYNC_FOLDERS_DIALOG_EVENT,
} from "@/components/chat/quick-start-events";
import { DEFAULT_CHARACTER, useCharacter, type CharacterDisplayPrompt } from "./character-context";

const CHANNEL_MARKER = "[[open-channels]]";
const SYNC_FOLDERS_MARKER = "[[open-sync-folders]]";

type PromptLane = "hard" | "simple";

interface PromptViewModel extends CharacterDisplayPrompt {
  cleanText: string;
  titleText: string;
  lane: PromptLane;
  needsChannelsSetup: boolean;
  needsSyncFolderSetup: boolean;
}

function toPromptViewModel(prompt: CharacterDisplayPrompt): PromptViewModel {
  const cleanText = prompt.text
    .replace(CHANNEL_MARKER, "")
    .replace(SYNC_FOLDERS_MARKER, "")
    .trim();

  const titleText = prompt.title || cleanText.split(":")[0] || cleanText;

  return {
    ...prompt,
    cleanText,
    titleText,
    lane: prompt.lane || "simple",
    needsChannelsSetup: Boolean(prompt.needsChannelsSetup || prompt.text.includes(CHANNEL_MARKER)),
    needsSyncFolderSetup: Boolean(prompt.needsSyncFolderSetup || prompt.text.includes(SYNC_FOLDERS_MARKER)),
  };
}

export const ThreadWelcome: FC = () => {
  const { character } = useCharacter();
  const displayChar = character || DEFAULT_CHARACTER;
  const welcomeRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLElement | null)[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("assistantUi");

  const promptModels = useMemo(
    () => (displayChar.suggestedPrompts || []).map((prompt) => toPromptViewModel(prompt)),
    [displayChar.suggestedPrompts]
  );

  const hardPrompts = useMemo(() => promptModels.filter((prompt) => prompt.lane === "hard"), [promptModels]);
  const simplePrompts = useMemo(() => promptModels.filter((prompt) => prompt.lane === "simple"), [promptModels]);

  const [activeLane, setActiveLane] = useState<PromptLane>(hardPrompts.length > 0 ? "hard" : "simple");

  useEffect(() => {
    if (activeLane === "hard" && hardPrompts.length === 0) {
      setActiveLane("simple");
      return;
    }
    if (activeLane === "simple" && simplePrompts.length === 0 && hardPrompts.length > 0) {
      setActiveLane("hard");
    }
  }, [activeLane, hardPrompts.length, simplePrompts.length]);

  useEffect(() => {
    if (!welcomeRef.current || prefersReducedMotion) {
      return;
    }

    animate(welcomeRef.current, {
      opacity: [0, 1],
      translateY: [22, 0],
      duration: ZLUTTY_DURATIONS.normal,
      ease: ZLUTTY_EASINGS.reveal,
    });
  }, [prefersReducedMotion]);

  const visiblePrompts = useMemo(
    () => activeLane === "hard" ? hardPrompts : simplePrompts,
    [activeLane, hardPrompts, simplePrompts]
  );

  // Only animate cards on initial mount and when the user switches lanes —
  // NOT on every parent re-render (which happens often during tool calls).
  const prevLaneRef = useRef(activeLane);
  const hasAnimatedCardsRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const isLaneSwitch = prevLaneRef.current !== activeLane;
    if (hasAnimatedCardsRef.current && !isLaneSwitch) return;

    prevLaneRef.current = activeLane;
    hasAnimatedCardsRef.current = true;

    cardsRef.current.forEach((card, index) => {
      if (card) {
        animate(card, {
          opacity: [0, 1],
          translateY: [8, 0],
          duration: ZLUTTY_DURATIONS.normal,
          delay: index * 55,
          ease: ZLUTTY_EASINGS.reveal,
        });
      }
    });
  }, [activeLane, prefersReducedMotion]);

  return (
    <ThreadPrimitive.Empty>
      <div
        ref={welcomeRef}
        className="flex flex-grow basis-full items-center justify-center px-4 py-8 sm:px-6"
        style={{ opacity: prefersReducedMotion ? 1 : 0 }}
      >
        <div className="w-full max-w-5xl">
          <div className="flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-col gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-terminal-muted">— scenarios —</p>
              <div className="flex flex-col gap-2">
                <p className="text-xl font-semibold font-mono text-terminal-dark">
                  {displayChar.displayName || displayChar.name}
                </p>
                <p className="text-sm font-mono text-terminal-muted">
                  {displayChar.exampleGreeting || displayChar.tagline || t("welcome.start", { name: displayChar.name })}
                </p>
              </div>
            </div>

            {/* Lane Toggle */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "font-mono text-xs transition-colors duration-150",
                  activeLane === "hard" && "text-terminal-dark underline underline-offset-2"
                )}
                onClick={() => setActiveLane("hard")}
                disabled={hardPrompts.length === 0}
              >
                <Zap className="mr-1 h-3.5 w-3.5" />
                In-Depth
              </Button>
              <span className="text-terminal-muted/30">•</span>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "font-mono text-xs transition-colors duration-150",
                  activeLane === "simple" && "text-terminal-dark underline underline-offset-2"
                )}
                onClick={() => setActiveLane("simple")}
                disabled={simplePrompts.length === 0}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Quick Wins
              </Button>
            </div>

            {/* Cards Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePrompts.map((prompt, index) => {
                const setupHints: string[] = [];
                if (prompt.needsChannelsSetup) {
                  setupHints.push("Setup channels");
                }
                if (prompt.needsSyncFolderSetup) {
                  setupHints.push("Sync a folder");
                }

                const handlePromptClick = () => {
                  if (prompt.needsChannelsSetup) {
                    dispatchChatModalEvent(OPEN_CHANNELS_DIALOG_EVENT, { characterId: displayChar.id });
                  }
                  if (prompt.needsSyncFolderSetup) {
                    dispatchChatModalEvent(OPEN_SYNC_FOLDERS_DIALOG_EVENT, { characterId: displayChar.id });
                  }
                };

                return (
                  <div
                    key={prompt.id}
                    ref={(el) => { cardsRef.current[index] = el; }}
                    onMouseEnter={() => setActiveLane(prompt.lane)}
                  >
                    <ThreadPrimitive.Suggestion prompt={prompt.cleanText} autoSend asChild>
                      <Button
                        variant="ghost"
                        onClick={handlePromptClick}
                        className="group h-auto min-h-[180px] w-full justify-start rounded-xl border border-terminal-border/30 bg-white/50 px-4 py-4 text-left transition-all duration-150 hover:border-l-2 hover:border-l-terminal-green/50 hover:bg-white/70"
                      >
                        <div className="w-full whitespace-normal">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="font-mono text-sm font-semibold text-terminal-dark">{prompt.titleText}</span>
                            <ArrowRight className="h-3 w-3 flex-shrink-0 text-terminal-muted/30 transition-all duration-150 group-hover:text-terminal-dark group-hover:translate-x-0.5" />
                          </div>
                          {prompt.description && (
                            <p className="font-mono text-[11px] leading-relaxed text-terminal-muted/70 whitespace-normal">{prompt.description}</p>
                          )}
                          {setupHints.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {setupHints.map((hint) => (
                                <Badge
                                  key={`${prompt.id}-${hint}`}
                                  variant="outline"
                                  className="border-terminal-amber/40 bg-terminal-amber/10 text-[10px] text-terminal-dark"
                                >
                                  {hint}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </Button>
                    </ThreadPrimitive.Suggestion>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};
