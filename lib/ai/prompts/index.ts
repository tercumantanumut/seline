/**
 * AI Prompts Module
 *
 * Centralized system prompt architecture following these principles:
 *
 * 1. MINIMAL SYSTEM PROMPT - Core identity and universal behaviors only (~500 tokens)
 * 2. RICH TOOL DESCRIPTIONS - Task-specific instructions live with their tools
 * 3. SINGLE SOURCE OF TRUTH - Shared blocks imported everywhere, no duplication
 * 4. LAZY LOADING - Detailed tool instructions revealed via searchTools
 */

// Shared instruction blocks
export {
  MEDIA_DISPLAY_RULES,
  LANGUAGE_HANDLING,
  RESPONSE_STYLE,
  TOOL_INVOCATION_FORMAT,
  TOOL_DISCOVERY_MINIMAL,
  TOOL_DISCOVERY_ALWAYS,
  MULTI_IMAGE_TOOL_USAGE,
  combineBlocks,
} from "./shared-blocks";

// Channel-aware formatting rules
export {
  getChannelFormattingBlock,
  channelNeedsFormattingGuidance,
} from "./channel-formatting";

// Base system prompt builder
export {
  buildBaseSystemPrompt,
  buildDefaultSystemPrompt,
  DEFAULT_AGENT_CONFIG,
  type BaseSystemPromptOptions,
} from "./base-system-prompt";

