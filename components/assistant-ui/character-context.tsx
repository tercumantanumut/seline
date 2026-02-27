"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Character data for display in the chat UI
 * This is a subset of CharacterFull focused on display needs
 */
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
  suggestedPrompts?: string[];

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
  return (
    <CharacterContext.Provider value={{ character }}>
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
    "Summarize this document and highlight key risks.",
    "Draft a product update email for our SaaS customers.",
    "Help me break down this project into milestones and tasks.",
  ],
};

