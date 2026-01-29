/**
 * Base System Prompt Builder
 *
 * Creates minimal, efficient system prompts for AI agents.
 * Focuses on core identity and universal behaviors.
 * Task-specific instructions live in tool descriptions.
 */

import { getTemporalContextBlock } from "../datetime-context";
import {
  MEDIA_DISPLAY_RULES,
  LANGUAGE_HANDLING,
  RESPONSE_STYLE,
  TOOL_INVOCATION_FORMAT,
  TOOL_DISCOVERY_MINIMAL,
  TOOL_DISCOVERY_ALWAYS,
  MULTI_IMAGE_TOOL_USAGE,
  combineBlocks,
} from "./shared-blocks";
import type { CacheableSystemBlock } from "../cache/types";

export interface BaseSystemPromptOptions {
  /** Agent's display name */
  agentName: string;
  /** Brief role description */
  agentRole: string;
  /** Optional personality/vibe description */
  agentVibe?: string;
  /** Optional personality traits */
  personalityTraits?: string[];
  /** Whether to include tool discovery instructions */
  includeToolDiscovery?: boolean;
  /** Tool loading strategy (deferred = prompt mentions searchTools, always = tools already loaded) */
  toolLoadingMode?: "deferred" | "always";
  /** Additional context to append (e.g., character memories, custom instructions) */
  additionalContext?: string;
  /** Enable prompt caching for system blocks (Anthropic only) */
  enableCaching?: boolean;
  /** Cache TTL (5m or 1h) */
  cacheTtl?: "5m" | "1h";
}

/**
 * Build a minimal, efficient base system prompt.
 *
 * Structure (~500 tokens total):
 * 1. Temporal context (~150 tokens)
 * 2. Core identity (~50 tokens)
 * 3. Response style (~80 tokens)
 * 4. Language handling (~50 tokens)
 * 5. Media display rules (~100 tokens)
 * 6. Tool discovery hint (~70 tokens, optional)
 */
export function buildBaseSystemPrompt(options: BaseSystemPromptOptions): string {
  const {
    agentName,
    agentRole,
    agentVibe,
    personalityTraits,
    includeToolDiscovery = true,
    toolLoadingMode = "deferred",
    additionalContext,
  } = options;

  // Build core identity section
  const identityParts: string[] = [`You are ${agentName}, ${agentRole}.`];

  if (agentVibe) {
    identityParts.push(`**Vibe:** ${agentVibe}`);
  }

  if (personalityTraits && personalityTraits.length > 0) {
    identityParts.push(`**Personality:** ${personalityTraits.join(", ")}`);
  }

  const coreIdentity = identityParts.join("\n");

  // Assemble the prompt
  const sections = [
    getTemporalContextBlock(),
    coreIdentity,
    RESPONSE_STYLE,
    LANGUAGE_HANDLING,
    MEDIA_DISPLAY_RULES,
    TOOL_INVOCATION_FORMAT, // Critical: Prevent tool syntax in text output
    MULTI_IMAGE_TOOL_USAGE, // Multi-image guidance for edit/reference tools
  ];

  // Add tool discovery if enabled
  if (includeToolDiscovery) {
    sections.push(toolLoadingMode === "always" ? TOOL_DISCOVERY_ALWAYS : TOOL_DISCOVERY_MINIMAL);
  }

  // Add any additional context
  if (additionalContext) {
    sections.push(additionalContext);
  }

  return combineBlocks(...sections);
}

/**
 * Default Seline agent configuration
 */
export const DEFAULT_AGENT_CONFIG: BaseSystemPromptOptions = {
  agentName: "Seline",
  agentRole: "a helpful AI agent on Seline – a platform for creating and chatting with configurable AI agents",
  agentVibe: "Clear, capable, and friendly – oriented toward getting real work done",
  personalityTraits: [
    "Creative & imaginative – offers suggestions, examples, and alternatives when helpful",
  ],
  includeToolDiscovery: true,
};

/**
 * Build the default Seline agent system prompt
 */
export function buildDefaultSystemPrompt(
  options: { includeToolDiscovery?: boolean; toolLoadingMode?: "deferred" | "always" } = {}
): string {
  return buildBaseSystemPrompt({
    ...DEFAULT_AGENT_CONFIG,
    includeToolDiscovery: options.includeToolDiscovery ?? true,
    toolLoadingMode: options.toolLoadingMode ?? "deferred",
  });
}

/**
 * Build system prompt as cacheable blocks for Anthropic prompt caching.
 * Returns array format with cache_control markers.
 *
 * Cache structure:
 * 1. Temporal context (changes daily, not cached)
 * 2. Core identity + response rules (static, highly cacheable)
 * 3. Tool discovery (optional, changes with mode)
 * 4. Additional context (character memories, etc., cacheable)
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function buildCacheableSystemPrompt(
  options: BaseSystemPromptOptions
): CacheableSystemBlock[] {
  const {
    agentName,
    agentRole,
    agentVibe,
    personalityTraits,
    includeToolDiscovery = true,
    toolLoadingMode = "deferred",
    additionalContext,
    enableCaching = false,
    cacheTtl = "5m",
  } = options;

  const blocks: CacheableSystemBlock[] = [];

  // Build core identity section
  const identityParts: string[] = [`You are ${agentName}, ${agentRole}.`];

  if (agentVibe) {
    identityParts.push(`**Vibe:** ${agentVibe}`);
  }

  if (personalityTraits && personalityTraits.length > 0) {
    identityParts.push(`**Personality:** ${personalityTraits.join(", ")}`);
  }

  const coreIdentity = identityParts.join("\n");

  // Block 1: Temporal context (changes daily, not cached)
  blocks.push({
    role: "system",
    content: getTemporalContextBlock(),
  });

  // Block 2: Core identity + response rules (static, highly cacheable)
  const staticBlocks = combineBlocks(
    coreIdentity,
    RESPONSE_STYLE,
    LANGUAGE_HANDLING,
    MEDIA_DISPLAY_RULES,
    TOOL_INVOCATION_FORMAT,
    MULTI_IMAGE_TOOL_USAGE
  );

  blocks.push({
    role: "system",
    content: staticBlocks,
    // Cache this block if caching is enabled
    ...(enableCaching && {
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral", ttl: cacheTtl } },
      },
    }),
  });

  // Block 3: Tool discovery (optional, changes with mode)
  if (includeToolDiscovery) {
    blocks.push({
      role: "system",
      content: toolLoadingMode === "always" ? TOOL_DISCOVERY_ALWAYS : TOOL_DISCOVERY_MINIMAL,
    });
  }

  // Block 4: Additional context (character memories, etc.)
  if (additionalContext) {
    blocks.push({
      role: "system",
      content: additionalContext,
      // Cache additional context if enabled (character instructions are stable)
      ...(enableCaching && {
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: cacheTtl } },
        },
      }),
    });
  }

  return blocks;
}

/**
 * Build the default Seline agent system prompt as cacheable blocks
 */
export function buildDefaultCacheableSystemPrompt(
  options: {
    includeToolDiscovery?: boolean;
    toolLoadingMode?: "deferred" | "always";
    enableCaching?: boolean;
    cacheTtl?: "5m" | "1h";
  } = {}
): CacheableSystemBlock[] {
  return buildCacheableSystemPrompt({
    ...DEFAULT_AGENT_CONFIG,
    includeToolDiscovery: options.includeToolDiscovery ?? true,
    toolLoadingMode: options.toolLoadingMode ?? "deferred",
    enableCaching: options.enableCaching ?? false,
    cacheTtl: options.cacheTtl ?? "5m",
  });
}
