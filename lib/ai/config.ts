/**
 * AI Configuration
 *
 * Simplified configuration module following the new prompt architecture:
 * - Minimal system prompts (~500 tokens vs ~4000 previously)
 * - Task-specific instructions live in tool descriptions
 * - Shared blocks imported from lib/ai/prompts
 *
 * See lib/ai/prompts/ for the prompt architecture.
 */

import { buildDefaultSystemPrompt } from "./prompts";

// ============================================================================
// System Prompt Functions
// ============================================================================

interface SystemPromptOptions {
  stylyApiEnabled?: boolean;
  toolLoadingMode?: "deferred" | "always";
}

/**
 * Get tool-specific instructions based on enabled tools.
 *
 * @deprecated Tool instructions are now embedded in tool descriptions.
 * This function returns an empty string for backward compatibility.
 * Detailed instructions are provided via searchTools fullInstructions.
 */
export function getToolInstructions(_options: SystemPromptOptions): string {
  // All tool instructions now live in tool-definitions.ts fullInstructions.
  // This function is kept for backward compatibility but returns empty.
  return "";
}

/**
 * Get the default system prompt (fallback when no custom agent is selected).
 *
 * The new architecture:
 * - Core identity, personality, and universal behaviors (~500 tokens)
 * - Task-specific workflows are in tool fullInstructions
 * - Use searchTools to discover available capabilities
 */
export function getSystemPrompt(options: SystemPromptOptions = {}): string {
  return buildDefaultSystemPrompt({
    includeToolDiscovery: options.stylyApiEnabled ?? true,
    toolLoadingMode: options.toolLoadingMode ?? "deferred",
  });
}

// Default system prompt export (for backward compatibility)
export const SYSTEM_PROMPT = getSystemPrompt({ stylyApiEnabled: true });

// ============================================================================
// AI Model Configuration
// ============================================================================

import { getConfiguredModel, getConfiguredProvider } from "./providers";

export const AI_CONFIG = {
  // Model is now dynamically configured via environment variables
  get model() {
    return getConfiguredModel();
  },
  get provider() {
    return getConfiguredProvider();
  },
  // Maximum tool call steps per request
  // Set to 100 to allow extensive multi-step operations
  // Previously: 10 (very limiting for complex tasks)
  // Note: AI SDK requires a finite number for stopWhen: stepCountIs()
  maxSteps: 100,
  // Temperature settings
  // Default temperature for creative responses
  temperature: 0.85,
  // Lower temperature for tool-heavy operations (more deterministic)
  // This can help reduce "fake tool call" issues where model outputs tool syntax as text
  toolTemperature: 0.7,
  // Tool choice configuration
  // "auto" = model decides, "none" = no tools, "required" = must use a tool
  // Default: "auto" - model can choose between tools and text
  toolChoice: "auto" as "auto" | "none" | "required",
};
