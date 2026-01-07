/**
 * Tool Search Tool
 *
 * Based on Anthropic's Advanced Tool Use patterns (Nov 2025):
 * The Tool Search Tool allows Claude to discover available tools on-demand
 * instead of loading all tool definitions upfront.
 *
 * This reduces token usage and improves context efficiency when you have
 * many tools available.
 */

import { tool, jsonSchema } from "ai";
import { ToolRegistry } from "./registry";
import type { ToolSearchResult, ToolCategory } from "./types";

/**
 * Context for search/list tools to know which tools are actually available
 * in the current session (not just registered in the global registry).
 */
export interface ToolSearchContext {
  /**
   * Set of tool names that are initially active (non-deferred tools).
   * These tools are available for immediate use.
   */
  initialActiveTools?: Set<string>;

  /**
   * Mutable set of tool names that have been discovered via searchTools.
   * When searchTools finds a deferred tool, it adds the tool name here.
   * The prepareStep callback reads this to dynamically enable discovered tools.
   */
  discoveredTools?: Set<string>;

  /**
   * Set of tool names that are enabled for this specific agent/character.
   * If provided, search results are filtered to only show tools in this set
   * (plus tools with alwaysLoad: true like searchTools/listAllTools).
   * If undefined, all enabled tools are shown (for agents without tool restrictions).
   */
  enabledTools?: Set<string>;

  /**
   * @deprecated Use initialActiveTools instead
   * Set of tool names that are actually loaded in the current session.
   * If provided, only these tools will be reported as available.
   * If undefined, all enabled tools are shown (legacy behavior).
   */
  loadedTools?: Set<string>;
}

/**
 * Schema for the tool search input
 */
const toolSearchSchema = jsonSchema<{
  query: string;
  category?: ToolCategory;
  limit?: number;
}>({
  type: "object",
  title: "ToolSearchInput",
  description: "Input schema for searching available tools",
  properties: {
    query: {
      type: "string",
      description:
        "Search query to find relevant tools. Use descriptive terms like 'generate image', 'edit photo', 'create video', etc.",
    },
    category: {
      type: "string",
      enum: [
        "image-generation",
        "image-editing",
        "video-generation",
        "analysis",
        "knowledge",
        "utility",
        "search",
      ],
      description: "Optional category filter to narrow down results",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 10,
      default: 5,
      description: "Maximum number of tools to return (default: 5)",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

/**
 * Extended search result with availability info
 */
interface SearchResultWithAvailability extends ToolSearchResult {
  isAvailable: boolean;
  fullInstructions?: string;
}

/**
 * Result type for the search tool
 */
interface SearchToolResult {
  status: "success" | "no_results";
  query: string;
  results: SearchResultWithAvailability[];
  message: string;
}

/**
 * Create the tool search tool
 *
 * This tool is always loaded (alwaysLoad: true) and allows the AI
 * to discover other tools on-demand.
 *
 * When a deferred tool is discovered, it's added to the discoveredTools set,
 * which enables it for use in subsequent steps via the prepareStep callback.
 *
 * @param context - Optional context specifying which tools are active and discovered
 */
export function createToolSearchTool(context?: ToolSearchContext) {
  const registry = ToolRegistry.getInstance();
  const initialActiveTools = context?.initialActiveTools ?? context?.loadedTools;
  const discoveredTools = context?.discoveredTools;
  const enabledTools = context?.enabledTools;

  return tool({
    description: `Search for available AI tools by functionality.

**⚠️ CRITICAL: This is NOT for searching the codebase!**
- To search CODE/FILES, use: \`localGrep\` (exact text) or \`vectorSearch\` (semantic)
- This tool discovers YOUR AI CAPABILITIES (image generation, web search, etc)

**DEFERRED LOADING:**
- You only see a fraction of your tools initially (to save tokens)
- If a user says "use grep", "search the web", "edit an image", search here first
- **NEVER deny having a capability without searching first**

**Search queries (describe the CAPABILITY, not content):**
- "grep", "regex", "pattern search" → finds localGrep
- "semantic search", "vector search" → finds vectorSearch
- "generate image", "create image" → finds image generation tools
- "web search", "search internet" → finds web search tools

**❌ WRONG:** searchTools({ query: "tutorial tooltip positioning" })
**✅ RIGHT:** localGrep({ pattern: "tooltip", fileTypes: ["ts"] })

**After finding a tool:** Use it immediately. Do NOT call searchTools again for the same task.`,
    inputSchema: toolSearchSchema,
    execute: async ({ query, category, limit = 5 }): Promise<SearchToolResult> => {
      // Search ALL registered tools (including deferred ones) - this enables tool discovery
      let results = registry.search(query, limit * 2); // Fetch more to account for filtering

      // Apply category filter if provided (with fuzzy fallback)
      if (category) {
        const categoryLower = category.toLowerCase();
        const beforeCategoryFilter = results.length;

        // First try exact category match
        const exactMatches = results.filter((r) => r.category === category);

        // If few exact matches, also include tools with category-related keywords
        if (exactMatches.length < 3) {
          // Fuzzy fallback: include tools whose keywords contain the category term
          const fuzzyMatches = results.filter((r) => {
            if (r.category === category) return true; // Already included
            // Check if any keyword relates to the category
            const toolMeta = registry.get(r.name);
            if (!toolMeta) return false;
            return toolMeta.metadata.keywords.some(kw =>
              kw.toLowerCase().includes(categoryLower) ||
              categoryLower.includes(kw.toLowerCase())
            );
          });

          if (fuzzyMatches.length > exactMatches.length) {
            console.log(`[searchTools] Category "${category}" expanded from ${exactMatches.length} exact to ${fuzzyMatches.length} fuzzy matches`);
            results = fuzzyMatches;
          } else {
            results = exactMatches;
          }
        } else {
          results = exactMatches;
        }

        // Warn if category filter was too narrow
        if (results.length < beforeCategoryFilter && results.length < 3) {
          console.warn(`[searchTools] Category "${category}" narrowed ${beforeCategoryFilter} -> ${results.length} results. Consider query-only search for better discovery.`);
        }
      }

      // CRITICAL: Filter results to only show tools enabled for this agent
      // This prevents agents from discovering tools they shouldn't have access to
      if (enabledTools) {
        const beforeCount = results.length;
        results = results.filter((r) => {
          // Always show tools with alwaysLoad: true (searchTools, listAllTools)
          const toolMeta = registry.get(r.name);
          if (toolMeta?.metadata.loading.alwaysLoad) {
            return true;
          }
          // Only show tools that are in the enabledTools set
          return enabledTools.has(r.name);
        });
        console.log(`[searchTools] Filtered ${beforeCount} -> ${results.length} results (agent has ${enabledTools.size} enabled tools)`);
      }

      // Apply final limit after filtering
      results = results.slice(0, limit);

      if (results.length === 0) {
        // Return available tools list when no matches (filtered by enabledTools)
        let availableTools = registry.getAvailableToolsList();
        if (enabledTools) {
          availableTools = availableTools.filter((t) => {
            const toolMeta = registry.get(t.name);
            return toolMeta?.metadata.loading.alwaysLoad || enabledTools.has(t.name);
          });
        }
        const categoryList = [...new Set(availableTools.map((t) => t.category))];

        return {
          status: "no_results",
          query,
          results: [],
          message: `No tools found matching "${query}". Available categories: ${categoryList.join(", ")}. Try a different search term or browse by category.`,
        };
      }

      // For each result, determine if it's currently available
      // A tool is available if it's in initialActiveTools OR has been discovered
      const resultsWithAvailability: SearchResultWithAvailability[] = results.map((r) => {
        const isDeferred = registry.get(r.name)?.metadata.loading.deferLoading ?? false;
        const isInitiallyActive = initialActiveTools?.has(r.name) ?? !isDeferred;
        const wasDiscovered = discoveredTools?.has(r.name) ?? false;

        return {
          ...r,
          isAvailable: isInitiallyActive || wasDiscovered,
          fullInstructions: r.fullInstructions,
        };
      });

      // IMPORTANT: Add discovered deferred tools to the discoveredTools set
      // This enables them for use in subsequent steps via prepareStep
      if (discoveredTools) {
        for (const result of results) {
          const toolMeta = registry.get(result.name);
          if (toolMeta?.metadata.loading.deferLoading) {
            discoveredTools.add(result.name);
            console.log(`[searchTools] Discovered deferred tool: ${result.name}`);
          }
        }
      }

      // Count available tools (after discovery)
      const availableCount = resultsWithAvailability.filter((r) => r.isAvailable || discoveredTools?.has(r.name)).length;
      const unavailableCount = resultsWithAvailability.length - availableCount;

      let message = `Found ${results.length} tool(s) matching "${query}".`;
      if (availableCount > 0) {
        message += ` ${availableCount} tool(s) are now available for use.`;
      }
      if (unavailableCount > 0) {
        message += ` ${unavailableCount} tool(s) could not be activated.`;
      }
      message += " Use the tool name directly to execute available tools.";

      // Update availability status after discovery
      for (const result of resultsWithAvailability) {
        if (discoveredTools?.has(result.name)) {
          result.isAvailable = true;
        }
      }

      return {
        status: "success",
        query,
        results: resultsWithAvailability,
        message,
      };
    },
  });
}

/**
 * Concise tool summary for listAllTools (excludes verbose instructions)
 */
interface ConciseToolSummary {
  name: string;
  displayName: string;
  category: string;
  description: string;
  isAvailable: boolean;
}

/**
 * Create a tool that lists all available tools
 * Returns concise summaries - use searchTools for detailed instructions
 *
 * @param context - Optional context specifying which tools are active and discovered
 */
export function createListToolsTool(context?: ToolSearchContext) {
  const registry = ToolRegistry.getInstance();
  const initialActiveTools = context?.initialActiveTools ?? context?.loadedTools;
  const discoveredTools = context?.discoveredTools;
  const enabledTools = context?.enabledTools;

  return tool({
    description: `List all available tools organized by category. Returns concise summaries.

 **TOKEN WARNING:** This tool returns a large amount of text and is expensive to call. Only use it as a last resort if \`searchTools\` with specific queries failed to find what you need.

 Tools marked as "isAvailable: true" can be called directly.
 For detailed usage instructions, use searchTools('<tool-name>').`,
    inputSchema: jsonSchema<{ includeDisabled?: boolean }>({
      type: "object",
      title: "ListAllToolsInput",
      description: "Input schema for listing all available tools",
      properties: {
        includeDisabled: {
          type: "boolean",
          description: "Whether to include disabled tools in the list (default: false). This parameter is optional and rarely needed.",
        },
      },
      required: [],
      additionalProperties: false,
    }),
    execute: async () => {
      let tools = registry.getAvailableToolsList();

      // CRITICAL: Filter tools to only show those enabled for this agent
      if (enabledTools) {
        tools = tools.filter((t) => {
          // Always show tools with alwaysLoad: true (searchTools, listAllTools)
          const toolMeta = registry.get(t.name);
          if (toolMeta?.metadata.loading.alwaysLoad) {
            return true;
          }
          // Only show tools that are in the enabledTools set
          return enabledTools.has(t.name);
        });
      }

      // Create concise summaries without fullInstructions
      // Availability is determined by initialActiveTools + discoveredTools
      const conciseSummaries: ConciseToolSummary[] = tools.map((t) => {
        const isInitiallyActive = initialActiveTools?.has(t.name) ?? !t.isDeferred;
        const wasDiscovered = discoveredTools?.has(t.name) ?? false;

        return {
          name: t.name,
          displayName: t.displayName,
          category: t.category,
          description: t.description,
          isAvailable: isInitiallyActive || wasDiscovered,
        };
      });

      // Group by category
      const byCategory: Record<string, ConciseToolSummary[]> = {};
      for (const t of conciseSummaries) {
        if (!byCategory[t.category]) {
          byCategory[t.category] = [];
        }
        byCategory[t.category].push(t);
      }

      const availableCount = conciseSummaries.filter((t) => t.isAvailable).length;
      const unavailableCount = conciseSummaries.length - availableCount;

      return {
        status: "success",
        totalTools: tools.length,
        availableCount,
        unavailableCount,
        categories: byCategory,
        message: `Found ${tools.length} tools across ${Object.keys(byCategory).length} categories. ${availableCount} available for immediate use.`,
        hint: "Use searchTools('<tool-name>') for detailed usage instructions on any specific tool.",
      };
    },
  });
}

