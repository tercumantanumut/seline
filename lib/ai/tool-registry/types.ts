/**
 * Tool Registry Type Definitions
 *
 * Based on Anthropic's Advanced Tool Use patterns (Nov 2025):
 * - Tool Search Tool: On-demand tool discovery with deferred loading
 * - Tool categorization for better searchability
 * - Metadata for tool management
 */

import type { Tool } from "ai";

/**
 * Tool category for grouping and search
 */
export type ToolCategory =
  | "image-generation"
  | "image-editing"
  | "video-generation"
  | "analysis"
  | "knowledge"
  | "utility"
  | "search"
  | "mcp";

/**
 * Configuration for when a tool should be loaded
 */
export interface ToolLoadingConfig {
  /**
   * If true, this tool is excluded from the initial context and only
   * loaded when discovered via the tool search tool.
   * Default: false (always loaded)
   */
  deferLoading?: boolean;

  /**
   * If true, this tool is always included in the context regardless
   * of other settings. Used for core/essential tools.
   * Default: false
   */
  alwaysLoad?: boolean;
}

/**
 * Metadata for a registered tool
 */
export interface ToolMetadata {
  /** Human-readable display name */
  displayName: string;

  /** Tool category for grouping */
  category: ToolCategory;

  /** Keywords for search matching */
  keywords: string[];

  /** Brief description for search results (max 100 chars) */
  shortDescription: string;

  /**
   * Full usage instructions returned by searchTools.
   * Contains detailed parameter docs, usage examples, and guidelines.
   * This replaces verbose tool descriptions and system prompt instructions.
   */
  fullInstructions?: string;

  /** Loading configuration */
  loading: ToolLoadingConfig;

  /** Whether this tool requires a session ID */
  requiresSession: boolean;

  /** Environment variable that enables/disables this tool */
  enableEnvVar?: string;
}

/**
 * Options passed to tool factory functions
 */
export interface ToolFactoryOptions {
  /** Session ID for database tracking */
  sessionId?: string;

  /** Character avatar URL for character-aware tools */
  characterAvatarUrl?: string;

  /** Character appearance description */
  characterAppearanceDescription?: string;
}

/**
 * Factory function type for creating tools
 */
export type ToolFactory = (options: ToolFactoryOptions) => Tool;

/**
 * A registered tool definition
 */
export interface RegisteredTool {
  /** Unique tool name/identifier */
  name: string;

  /** Tool metadata for search and management */
  metadata: ToolMetadata;

  /** Factory function to create the tool instance */
  factory: ToolFactory;
}

/**
 * Context for tool instantiation
 */
export interface ToolContext {
  /** Current session ID */
  sessionId: string;

  /** Character context (optional) */
  characterAvatarUrl?: string;
  characterAppearanceDescription?: string;

  /** Which tools to include (overrides deferred loading) */
  includeTools?: string[];

  /** Whether to include deferred tools */
  includeDeferredTools?: boolean;

  /**
   * Agent-specific enabled tools filter.
   * If provided, ONLY tools in this set (plus alwaysLoad tools) will be loaded.
   * This enforces per-agent tool restrictions selected via the UI.
   */
  agentEnabledTools?: Set<string>;
}

/**
 * Search result from the tool search tool
 */
export interface ToolSearchResult {
  /** Tool name */
  name: string;

  /** Display name */
  displayName: string;

  /** Category */
  category: ToolCategory;

  /** Short description */
  description: string;

  /** Match score (0-1) */
  relevance: number;

  /** Full usage instructions (detailed parameters, examples, guidelines) */
  fullInstructions?: string;
}

