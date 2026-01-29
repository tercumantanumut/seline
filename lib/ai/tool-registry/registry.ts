/**
 * Tool Registry
 *
 * Centralized registry for tool management with support for:
 * - Tool registration with metadata
 * - Deferred loading for context optimization
 * - Search and discovery
 * - Dynamic tool instantiation
 */

import type { Tool } from "ai";
import type {
  RegisteredTool,
  ToolMetadata,
  ToolFactory,
  ToolContext,
  ToolSearchResult,
  ToolCategory,
} from "./types";
/**
 * Global registry storage to persist across Next.js hot reloads in dev mode
 * Without this, each hot reload would create a new empty registry
 */
const globalForRegistry = globalThis as unknown as {
  toolRegistryInstance: ToolRegistry | undefined;
};

/**
 * Singleton tool registry for managing all available tools
 */
class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  private constructor() { }

  /**
   * Get the singleton registry instance
   * Uses globalThis to persist across Next.js hot reloads in dev mode
   */
  static getInstance(): ToolRegistry {
    if (!globalForRegistry.toolRegistryInstance) {
      globalForRegistry.toolRegistryInstance = new ToolRegistry();
    }
    return globalForRegistry.toolRegistryInstance;
  }

  /**
   * Reset the registry (for testing)
   */
  static reset(): void {
    globalForRegistry.toolRegistryInstance = undefined;
  }

  /**
   * Register a tool with its metadata and factory
   */
  register(name: string, metadata: ToolMetadata, factory: ToolFactory): void {
    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Tool "${name}" is already registered, overwriting`);
    }

    this.tools.set(name, { name, metadata, factory });
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a registered tool definition
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.metadata.category === category
    );
  }

  /**
   * Unregister a single tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Unregister all tools in a category
   * @returns Number of tools unregistered
   */
  unregisterByCategory(category: ToolCategory): number {
    const toolsToRemove = this.getToolsByCategory(category);
    let count = 0;

    for (const tool of toolsToRemove) {
      if (this.tools.delete(tool.name)) {
        count++;
      }
    }

    if (count > 0) {
      console.log(`[ToolRegistry] Unregistered ${count} tools in category "${category}"`);
    }

    return count;
  }

  /**
   * Unregister tools matching a prefix (e.g., "mcp_serverName_")
   * @returns Number of tools unregistered
   */
  unregisterByPrefix(prefix: string): number {
    let count = 0;

    for (const name of this.tools.keys()) {
      if (name.startsWith(prefix)) {
        this.tools.delete(name);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[ToolRegistry] Unregistered ${count} tools with prefix "${prefix}"`);
    }

    return count;
  }

  /**
   * Check if a tool is enabled based on environment variables
   */
  isToolEnabled(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    const { enableEnvVar } = tool.metadata;
    if (!enableEnvVar) return true;

    const envValue = process.env[enableEnvVar];

    // For API key env vars, check presence (non-empty)
    if (enableEnvVar.includes('API_KEY')) {
      if (enableEnvVar === "FIRECRAWL_API_KEY") {
        const provider = process.env.WEB_SCRAPER_PROVIDER || "firecrawl";
        if (provider === "local") {
          return true;
        }
      }
      return !!envValue && envValue.trim().length > 0;
    }

    // For ENABLE_* flags, enabled unless explicitly "false"
    return envValue !== "false";
  }

  /**
   * Search for tools matching a query
   */
  search(query: string, limit = 5): ToolSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    const results: ToolSearchResult[] = [];

    for (const [name, tool] of this.tools) {
      // Skip disabled tools
      if (!this.isToolEnabled(name)) continue;

      // Calculate relevance score
      let score = 0;
      const { metadata } = tool;

      // Exact name match (highest weight)
      if (name.toLowerCase() === queryLower) {
        score += 1.0;
      } else if (name.toLowerCase().includes(queryLower)) {
        score += 0.7;
      }

      // Display name match
      if (metadata.displayName.toLowerCase().includes(queryLower)) {
        score += 0.6;
      }

      // Category match
      if (metadata.category.toLowerCase().includes(queryLower)) {
        score += 0.5;
      }

      // Keyword matches - prioritize exact matches over partial
      for (const keyword of metadata.keywords) {
        const keywordLower = keyword.toLowerCase();

        // Exact full query match in keyword (highest keyword score)
        if (keywordLower === queryLower) {
          score += 0.6;
        } else if (keywordLower.includes(queryLower)) {
          score += 0.4;
        }

        // Check individual query words against keywords
        for (const word of queryWords) {
          // Exact word match (higher weight for precise matches)
          if (keywordLower === word) {
            score += 0.5;
          } else if (keywordLower.includes(word)) {
            score += 0.2;
          }
        }
      }

      // Description match
      if (metadata.shortDescription.toLowerCase().includes(queryLower)) {
        score += 0.3;
      }

      if (score > 0) {
        results.push({
          name,
          displayName: metadata.displayName,
          category: metadata.category,
          description: metadata.shortDescription,
          relevance: Math.min(score, 1.0), // Cap at 1.0
          fullInstructions: metadata.fullInstructions,
        });
      }
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Create tool instances based on context and loading configuration
   *
   * @param context - Tool creation context (session, character info, etc.)
   * @returns Record of tool name to tool instance
   */
  getTools(context: ToolContext): Record<string, Tool> {
    const tools: Record<string, Tool> = {};
    const { sessionId, includeTools, includeDeferredTools, agentEnabledTools } = context;

    for (const [name, registeredTool] of this.tools) {
      const { metadata, factory } = registeredTool;

      // Check if tool is enabled (via env vars)
      if (!this.isToolEnabled(name)) continue;

      // CRITICAL: Agent-specific tool filtering
      // If agentEnabledTools is provided, ONLY load:
      // 1. Core utility tools (alwaysLoad: true) - searchTools, listAllTools
      // 2. Tools explicitly in the agentEnabledTools set
      if (agentEnabledTools) {
        const isAlwaysLoad = metadata.loading.alwaysLoad === true;
        const isAgentEnabled = agentEnabledTools.has(name);

        if (!isAlwaysLoad && !isAgentEnabled) {
          continue; // Skip tools not enabled for this agent
        }
      }

      // Check loading configuration (for deferred loading)
      const shouldLoad =
        metadata.loading.alwaysLoad ||
        includeTools?.includes(name) ||
        (!metadata.loading.deferLoading || includeDeferredTools);

      if (!shouldLoad) continue;

      // Validate session requirement
      if (metadata.requiresSession && !sessionId) {
        console.warn(`[ToolRegistry] Tool "${name}" requires session but none provided`);
        continue;
      }

      // Create tool instance
      try {
        tools[name] = factory({
          sessionId,
          userId: context.userId,
          characterId: context.characterId,
          characterAvatarUrl: context.characterAvatarUrl,
          characterAppearanceDescription: context.characterAppearanceDescription,
        });
      } catch (error) {
        console.error(`[ToolRegistry] Failed to create tool "${name}":`, error);
      }
    }

    return tools;
  }

  /**
   * Get concise list of available tools (for listAllTools - token efficient)
   */
  getAvailableToolsList(): Array<{
    name: string;
    displayName: string;
    category: ToolCategory;
    description: string;
    isDeferred: boolean;
  }> {
    const list: Array<{
      name: string;
      displayName: string;
      category: ToolCategory;
      description: string;
      isDeferred: boolean;
    }> = [];

    for (const [name, tool] of this.tools) {
      if (!this.isToolEnabled(name)) continue;

      list.push({
        name,
        displayName: tool.metadata.displayName,
        category: tool.metadata.category,
        description: tool.metadata.shortDescription,
        isDeferred: tool.metadata.loading.deferLoading ?? false,
      });
    }

    return list;
  }

  /**
   * Get detailed tool info including full instructions (for searchTools - detailed lookup)
   */
  getToolDetails(toolName: string): {
    name: string;
    displayName: string;
    category: ToolCategory;
    description: string;
    isDeferred: boolean;
    fullInstructions?: string;
  } | null {
    const tool = this.tools.get(toolName);
    if (!tool || !this.isToolEnabled(toolName)) return null;

    return {
      name: toolName,
      displayName: tool.metadata.displayName,
      category: tool.metadata.category,
      description: tool.metadata.shortDescription,
      isDeferred: tool.metadata.loading.deferLoading ?? false,
      fullInstructions: tool.metadata.fullInstructions,
    };
  }
}

export { ToolRegistry };

