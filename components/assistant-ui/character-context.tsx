"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Character data for display in the chat UI
 * This is a subset of CharacterFull focused on display needs
 */
export interface CharacterDisplayPrompt {
  id: string;
  text: string;
  title?: string;
  description?: string;
  lane?: "hard" | "simple";
  requiresChannels?: boolean;
  requiresSyncFolder?: boolean;
  hideWhenHasSyncFolder?: boolean;
  needsChannelsSetup?: boolean;
  needsSyncFolderSetup?: boolean;
}

export interface CharacterDisplayData {
  id: string;
  name: string;
  displayName?: string | null;
  tagline?: string | null;
  avatarUrl?: string | null;
  primaryImageUrl?: string | null;

  // For welcome message customization
  exampleGreeting?: string | null;

  // For suggested prompts
  suggestedPrompts?: CharacterDisplayPrompt[];

  // Initials for avatar fallback
  initials?: string;
}

interface CharacterContextValue {
  character: CharacterDisplayData | null;
}

const CharacterContext = createContext<CharacterContextValue>({
  character: null,
});

export function useCharacter() {
  return useContext(CharacterContext);
}

interface CharacterProviderProps {
  children: ReactNode;
  character: CharacterDisplayData | null;
}

export function CharacterProvider({ children, character }: CharacterProviderProps) {
  const value = useMemo(() => ({ character }), [character]);
  return (
    <CharacterContext.Provider value={value}>
      {children}
    </CharacterContext.Provider>
  );
}

/**
 * Helper to extract initials from a character name
 */
export { getCharacterInitials } from "@/lib/utils";

/**
   * Default agent data for the Styly Agents workspace assistant
   */
export const DEFAULT_CHARACTER: CharacterDisplayData = {
  id: "default",
  name: "Workspace Assistant",
  displayName: "Workspace Assistant",
  tagline: "I help you think, write, and build faster—using tools when they’re useful.",
  initials: "WA",
  suggestedPrompts: [
    {
      id: "default-risk-audit",
      text: "Run a practical risk audit of this codebase: identify auth/session/regression hotspots with file references and a concrete patch plan.",
    },
    {
      id: "default-launch-plan",
      text: "Build a launch readiness plan with checklist, risk scoring, go/no-go criteria, and reminders for owners.",
    },
    {
      id: "default-memory-style",
      text: "Memorize my working style for future chats: concise, risk-first, and actionable responses.",
    },
  ],
};

