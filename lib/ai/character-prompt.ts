/**
 * Character System Prompt Builder
 *
 * Builds dynamic system prompts for user-created agents.
 * Uses shared blocks from lib/ai/prompts for consistency.
 */

import type { CharacterFull } from "@/lib/db/schema";
import { getTemporalContextBlock } from "./datetime-context";
import { formatMemoriesForPrompt } from "@/lib/agent-memory";
import {
  MEDIA_DISPLAY_RULES,
  RESPONSE_STYLE,
  LANGUAGE_HANDLING,
  TOOL_INVOCATION_FORMAT,
  TOOL_DISCOVERY_MINIMAL,
  TOOL_DISCOVERY_ALWAYS,
  MULTI_IMAGE_TOOL_USAGE,
} from "./prompts";
import { combineBlocks } from "./prompts/shared-blocks";
import type { CacheableSystemBlock } from "./cache/types";

/**
 * Gets the primary avatar URL for a character
 */
export function getCharacterAvatarUrl(character: CharacterFull): string | null {
  if (!character.images || character.images.length === 0) return null;

  // Find primary image first
  const primaryImage = character.images.find(img => img.isPrimary);
  if (primaryImage) return primaryImage.url;

  // Fallback to first portrait or avatar type
  const portraitOrAvatar = character.images.find(
    img => img.imageType === "portrait" || img.imageType === "avatar"
  );
  if (portraitOrAvatar) return portraitOrAvatar.url;

  // Fallback to first image
  return character.images[0]?.url || null;
}

/**
 * Builds a dynamic system prompt from character data
 * Used for user-created agents on Styly Agents
 */
export function buildCharacterSystemPrompt(
  character: CharacterFull,
  options: { toolLoadingMode?: "deferred" | "always" } = {}
): string {
  const sections: string[] = [];

  // Agent identity
  sections.push(`You are an AI agent named ${character.name}${character.displayName ? ` (also known as "${character.displayName}")` : ""}.`);

  if (character.tagline) {
    sections.push(character.tagline);
  }

  // Build agent profile section
  const profileParts: string[] = [];

  profileParts.push(`## Agent Profile\n`);
  profileParts.push(`**Name:** ${character.name}`);
  if (character.displayName) {
    profileParts.push(`**Also Known As:** ${character.displayName}`);
  }

  // Include avatar URL so the character knows what they look like
  const avatarUrl = getCharacterAvatarUrl(character);
  if (avatarUrl) {
    profileParts.push(`**Your Avatar Image URL:** ${avatarUrl}`);
  }

  // Add metadata/purpose if available
  const metadata = character.metadata as Record<string, any> || {};
  if (metadata.purpose) {
    profileParts.push(`**Your Purpose:** ${metadata.purpose}`);
  }

  sections.push(profileParts.join("\n"));

  // Agent Memory - learned preferences and patterns
  const { markdown: memoryMarkdown, tokenEstimate, memoryCount } = formatMemoriesForPrompt(character.id);
  if (memoryMarkdown) {
    sections.push(memoryMarkdown);
    console.log(`[Character Prompt] Injected ${memoryCount} memories (~${tokenEstimate} tokens) for ${character.name}`);
  }

  // Universal guidelines from shared blocks
  sections.push(RESPONSE_STYLE);
  sections.push(LANGUAGE_HANDLING);
  sections.push(MEDIA_DISPLAY_RULES);
  sections.push(TOOL_INVOCATION_FORMAT); // Critical: Prevent tool syntax in text output
  sections.push(options.toolLoadingMode === "always" ? TOOL_DISCOVERY_ALWAYS : TOOL_DISCOVERY_MINIMAL);
  sections.push(MULTI_IMAGE_TOOL_USAGE); // Multi-image guidance for edit/reference tools

  // Prepend temporal context for accurate date/time awareness
  const temporalContext = getTemporalContextBlock();
  return `${temporalContext}\n\n${sections.join("\n\n")}`;
}

/**
 * Builds a cacheable character system prompt as blocks for Anthropic prompt caching.
 * Returns array format with cache_control markers on stable content.
 *
 * Cache structure:
 * 1. Temporal context (changes daily, not cached)
 * 2. Character identity + profile (static, highly cacheable)
 * 3. Agent memories (updates periodically, cacheable)
 * 4. Universal guidelines (static, highly cacheable)
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function buildCacheableCharacterPrompt(
  character: CharacterFull,
  options: {
    toolLoadingMode?: "deferred" | "always";
    enableCaching?: boolean;
    cacheTtl?: "5m" | "1h";
  } = {}
): CacheableSystemBlock[] {
  const {
    toolLoadingMode = "deferred",
    enableCaching = false,
    cacheTtl = "5m",
  } = options;

  const blocks: CacheableSystemBlock[] = [];

  // Block 1: Temporal context (changes daily, not cached)
  blocks.push({
    role: "system",
    content: getTemporalContextBlock(),
  });

  // Block 2: Character identity + profile (HIGHLY CACHEABLE)
  const identityParts: string[] = [];

  identityParts.push(
    `You are an AI agent named ${character.name}${
      character.displayName ? ` (also known as "${character.displayName}")` : ""
    }.`
  );

  if (character.tagline) {
    identityParts.push(character.tagline);
  }

  // Build agent profile section
  const profileParts: string[] = [`## Agent Profile\n`];
  profileParts.push(`**Name:** ${character.name}`);
  if (character.displayName) {
    profileParts.push(`**Also Known As:** ${character.displayName}`);
  }

  // Include avatar URL so the character knows what they look like
  const avatarUrl = getCharacterAvatarUrl(character);
  if (avatarUrl) {
    profileParts.push(`**Your Avatar Image URL:** ${avatarUrl}`);
  }

  // Add metadata/purpose if available
  const metadata = (character.metadata as Record<string, any>) || {};
  if (metadata.purpose) {
    profileParts.push(`**Your Purpose:** ${metadata.purpose}`);
  }

  identityParts.push(profileParts.join("\n"));

  blocks.push({
    role: "system",
    content: identityParts.join("\n\n"),
    // Cache character identity (stable, rarely changes)
    ...(enableCaching && {
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral", ttl: cacheTtl } },
      },
    }),
  });

  // Block 3: Agent Memory (if available, CACHEABLE)
  const { markdown: memoryMarkdown, tokenEstimate, memoryCount } =
    formatMemoriesForPrompt(character.id);

  if (memoryMarkdown) {
    blocks.push({
      role: "system",
      content: memoryMarkdown,
      // Cache memories (they update periodically, not every request)
      ...(enableCaching && {
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: cacheTtl } },
        },
      }),
    });
    console.log(
      `[Character Prompt] Injected ${memoryCount} memories (~${tokenEstimate} tokens) for ${character.name}`
    );
  }

  // Block 4: Universal guidelines (static, highly cacheable)
  const guidelines = combineBlocks(
    RESPONSE_STYLE,
    LANGUAGE_HANDLING,
    MEDIA_DISPLAY_RULES,
    TOOL_INVOCATION_FORMAT,
    toolLoadingMode === "always" ? TOOL_DISCOVERY_ALWAYS : TOOL_DISCOVERY_MINIMAL,
    MULTI_IMAGE_TOOL_USAGE
  );

  blocks.push({
    role: "system",
    content: guidelines,
    // Cache guidelines (never change)
    ...(enableCaching && {
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral", ttl: cacheTtl } },
      },
    }),
  });

  return blocks;
}

/**
 * Combines character prompt with tool-specific instructions
 */
export interface CharacterPromptOptions {
  character: CharacterFull;
  geminiEnabled?: boolean;
  flux2Enabled?: boolean;
  toolInstructions?: string;
  toolLoadingMode?: "deferred" | "always";
}

export function buildFullSystemPrompt(options: CharacterPromptOptions): string {
  const { character, toolInstructions, toolLoadingMode } = options;

  let prompt = buildCharacterSystemPrompt(character, { toolLoadingMode });

  if (toolInstructions) {
    prompt += "\n\n" + toolInstructions;
  }

  return prompt;
}

