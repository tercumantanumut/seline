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

import { tool, jsonSchema, generateObject } from "ai";
import { z } from "zod";
import { getUtilityModel } from "@/lib/ai/providers";
import { ToolRegistry } from "./registry";
import type { ToolSearchResult, ToolCategory } from "./types";
import { parseSubagentDirectory, searchSubagents, type SubagentSearchResult } from "./search-tool-subagent-types";

const TOOL_SEARCH_LOGGING_ENABLED =
  process.env.TOOL_SEARCH_LOGGING === "true" || process.env.TOOL_SEARCH_LOGGING === "1";

function logSearchTools(message: string): void {
  if (!TOOL_SEARCH_LOGGING_ENABLED) return;
  console.log(message);
}

function warnSearchTools(message: string): void {
  if (!TOOL_SEARCH_LOGGING_ENABLED) return;
  console.warn(message);
}

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

  /**
   * Workflow subagent directory for subagent discovery.
   * When provided, searchTools will also search available subagents
   * by matching query against subagent names and purposes.
   * Format: ["- AgentName (id: agent-id): Purpose description", ...]
   */
  subagentDirectory?: string[];
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
  title: "searchToolsInput",
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
        "mcp",
      ],
      description: "Optional category filter to narrow down results. Use 'mcp' for MCP server tools (linear, filesystem, etc).",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 50,
      default: 20,
      description: "Maximum number of tools to return (default: 20)",
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
  resultType: "tool";
}

/**
 * Subagent result with availability (always available if in directory)
 */
interface SubagentResultWithAvailability extends SubagentSearchResult {
  isAvailable: true;
  resultType: "subagent";
}

/**
 * Unified result type for both tools and subagents
 */
type UnifiedResultWithAvailability =
  | SearchResultWithAvailability
  | SubagentResultWithAvailability;

/**
 * Result type for the search tool
 */
interface SearchToolResult {
  status: "success" | "no_results";
  query: string;
  results: UnifiedResultWithAvailability[];
  message: string;
  summary?: string;
}

const TOOL_SEARCH_ROUTER_MODEL_ENABLED =
  process.env.TOOL_SEARCH_ROUTER_MODEL !== "false";

const TOOL_SEARCH_ROUTER_TIMEOUT_MS = 5000;
const TOOL_SEARCH_ROUTER_MAX_CANDIDATES = 80;

const toolSearchRouterSchema = z.object({
  directToolNames: z.array(z.string()).max(12),
  normalizedQuery: z.string().min(1).max(200),
  relatedTerms: z.array(z.string().min(1).max(80)).max(8),
  rationale: z.string().max(320),
});

type ToolSearchRouterDecision = z.infer<typeof toolSearchRouterSchema>;
const TOOL_SEARCH_GENERIC_TERMS = new Set([
  "search",
  "find",
  "lookup",
  "tool",
  "tools",
  "capability",
  "capabilities",
]);

function normalizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

function tokenizeToolQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreIntentMatch(
  candidate: ToolSearchResult,
  queryTerms: string[],
  registry: ToolRegistry
): number {
  if (!queryTerms.length) return 0;

  const metadata = registry.get(candidate.name)?.metadata;
  const haystack = [
    candidate.name,
    candidate.displayName,
    candidate.description,
    ...(metadata?.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (!haystack.includes(term)) continue;
    score += TOOL_SEARCH_GENERIC_TERMS.has(term) ? 0.25 : 1;
  }
  return score;
}

function narrowResultsForSpecificIntent(
  query: string,
  candidates: ToolSearchResult[],
  registry: ToolRegistry
): ToolSearchResult[] {
  if (candidates.length <= 5) {
    return candidates;
  }

  const queryTerms = tokenizeToolQuery(query);
  const specificTerms = queryTerms.filter((term) => !TOOL_SEARCH_GENERIC_TERMS.has(term));
  const activeTerms = specificTerms.length > 0 ? specificTerms : queryTerms;

  if (!activeTerms.length) {
    return candidates;
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      intentScore: scoreIntentMatch(candidate, activeTerms, registry),
    }))
    .filter((entry) => entry.intentScore > 0);

  if (!scored.length) {
    return candidates;
  }

  scored.sort((a, b) => {
    if (b.intentScore !== a.intentScore) {
      return b.intentScore - a.intentScore;
    }
    return b.candidate.relevance - a.candidate.relevance;
  });

  return scored.map((entry) => entry.candidate);
}

function dedupeResultsByName(results: ToolSearchResult[]): ToolSearchResult[] {
  const seen = new Set<string>();
  const deduped: ToolSearchResult[] = [];

  for (const result of results) {
    if (seen.has(result.name)) continue;
    seen.add(result.name);
    deduped.push(result);
  }

  return deduped;
}

function buildToolSearchCandidateContext(
  candidates: ToolSearchResult[]
): string {
  if (!candidates.length) return "No candidates.";

  return candidates
    .map((candidate, index) => {
      const details = [
        `${index + 1}. ${candidate.name}`,
        `displayName=${candidate.displayName}`,
        `category=${candidate.category}`,
        `description=${candidate.description}`,
      ];
      return details.join(" | ");
    })
    .join("\n");
}

async function routeToolSearchWithUtilityModel(
  query: string,
  candidates: ToolSearchResult[]
): Promise<ToolSearchRouterDecision | null> {
  if (!TOOL_SEARCH_ROUTER_MODEL_ENABLED) {
    return null;
  }

  if (!candidates.length) {
    return null;
  }

  const candidateContext = buildToolSearchCandidateContext(candidates);
  const routerPrompt = [
    `User query: ${query}`,
    "Select the best tools for this query from the candidate list.",
    "Prioritize direct tool name matches and precise capability intent.",
    "Return normalized query and 3-8 related terms for additional keyword search.",
    "Candidate tools:",
    candidateContext,
  ].join("\n\n");

  try {
    const decisionPromise = generateObject({
      model: getUtilityModel(),
      schema: toolSearchRouterSchema,
      temperature: 0,
      prompt: routerPrompt,
    });

    const decision = await Promise.race([
      decisionPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TOOL_SEARCH_ROUTER_TIMEOUT_MS)
      ),
    ]);

    if (!decision || !("object" in decision)) {
      warnSearchTools("[searchTools] Utility router timed out; falling back to registry scoring");
      return null;
    }

    return decision.object;
  } catch (error) {
    warnSearchTools(
      `[searchTools] Utility router failed; falling back to registry scoring: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

function applyUtilityRouterRanking(
  query: string,
  limit: number,
  candidates: ToolSearchResult[]
): { results: ToolSearchResult[]; routed: boolean } {
  const queryLower = query.toLowerCase();
  const queryCompact = normalizeToolName(query);

  const directMatches = candidates.filter((candidate) => {
    const nameLower = candidate.name.toLowerCase();
    const displayNameLower = candidate.displayName.toLowerCase();
    return (
      nameLower === queryLower ||
      displayNameLower === queryLower ||
      normalizeToolName(candidate.name) === queryCompact
    );
  });

  if (directMatches.length > 0) {
    const fallback = dedupeResultsByName([...directMatches, ...candidates]);
    return { results: fallback.slice(0, limit), routed: true };
  }

  return { results: dedupeResultsByName(candidates).slice(0, limit), routed: false };
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
  const subagentDirectory = context?.subagentDirectory;

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
- "delegate", "subagent", "agent" → finds delegation tools AND available subagents

**❌ WRONG:** searchTools({ query: "tutorial tooltip positioning" })
**✅ RIGHT:** localGrep({ pattern: "tooltip", fileTypes: ["ts"] })

**After finding a tool:** Use it immediately. Do NOT call searchTools again for the same task.`,
    inputSchema: toolSearchSchema,
    execute: async ({ query, category, limit = 20 }): Promise<SearchToolResult> => {
      const effectiveLimit = Math.min(Math.max(limit, 1), 50);

      // Start with a broad candidate set, then let the utility model narrow and rank.
      let results = registry.search(query, TOOL_SEARCH_ROUTER_MAX_CANDIDATES);

      const routerDecision = await routeToolSearchWithUtilityModel(query, results);
      if (routerDecision) {
        const queryTerms = [
          query,
          routerDecision.normalizedQuery,
          ...routerDecision.relatedTerms,
        ]
          .map((term) => term.trim())
          .filter((term) => term.length > 0);

        for (const term of queryTerms) {
          const termResults = registry.search(term, TOOL_SEARCH_ROUTER_MAX_CANDIDATES);
          results = dedupeResultsByName([...results, ...termResults]);
        }

        const directNameMatches = new Set(
          routerDecision.directToolNames.map((name) => normalizeToolName(name))
        );
        const normalizedQuery = normalizeToolName(routerDecision.normalizedQuery);

        const scored = results.map((candidate) => {
          let score = candidate.relevance;
          const candidateName = normalizeToolName(candidate.name);
          const candidateDisplayName = normalizeToolName(candidate.displayName);

          if (directNameMatches.has(candidateName) || directNameMatches.has(candidateDisplayName)) {
            score += 3;
          }

          if (candidateName === normalizedQuery || candidateDisplayName === normalizedQuery) {
            score += 1.5;
          }

          return {
            candidate,
            score,
          };
        });

        scored.sort((a, b) => b.score - a.score);
        results = scored.map((entry) => entry.candidate);

        logSearchTools(
          `[searchTools] Utility router reranked ${results.length} candidates (${routerDecision.rationale})`
        );
      }

      // Preserve deterministic direct-name prioritization even when model routing is skipped.
      results = applyUtilityRouterRanking(query, TOOL_SEARCH_ROUTER_MAX_CANDIDATES, results).results;

      // Secondary utility-stage narrowing:
      // keep only tools that actually match specific intent terms (e.g. browser/chrome/web)
      // to avoid flooding the main agent with unrelated utilities.
      results = narrowResultsForSpecificIntent(query, results, registry);

      // Apply category filter if provided - but never filter out strong query matches
      // Models often guess the wrong category, so treat it as a soft hint, not a hard filter
      if (category) {
        // Split results: those matching category and those that don't
        const categoryMatches = results.filter((r) => r.category === category);
        const otherMatches = results.filter((r) => r.category !== category);

        if (categoryMatches.length > 0) {
          // Category matches exist - prefer them but keep high-relevance others
          const highRelevanceOthers = otherMatches.filter((r) => r.relevance >= 0.4);
          results = [...categoryMatches, ...highRelevanceOthers];
        }
        // If zero category matches, keep ALL results (query match is more important)
        // This prevents wrong category guesses from hiding relevant tools

        logSearchTools(`[searchTools] Category "${category}": ${categoryMatches.length} category matches, ${otherMatches.length} other matches, returning ${results.length} total`);
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
        logSearchTools(`[searchTools] Filtered ${beforeCount} -> ${results.length} results (agent has ${enabledTools.size} enabled tools)`);
      }

      // Apply final limit after filtering
      results = results.slice(0, effectiveLimit);

      // Search subagents if workflow context is available
      const subagentResults: SubagentSearchResult[] = subagentDirectory
        ? searchSubagents(query, parseSubagentDirectory(subagentDirectory))
        : [];

      if (results.length === 0 && subagentResults.length === 0) {
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

      // Convert tool results to unified format with availability
      const toolResultsWithAvailability: UnifiedResultWithAvailability[] = results.map((r) => {
        const isDeferred = registry.get(r.name)?.metadata.loading.deferLoading ?? false;
        const isInitiallyActive = initialActiveTools?.has(r.name) ?? !isDeferred;
        const wasDiscovered = discoveredTools?.has(r.name) ?? false;

        return {
          ...r,
          resultType: "tool" as const,
          isAvailable: isInitiallyActive || wasDiscovered,
          fullInstructions: r.fullInstructions,
        };
      });

      // Convert subagent results to unified format (always available)
      const subagentResultsWithAvailability: UnifiedResultWithAvailability[] = subagentResults.map((s) => ({
        ...s,
        resultType: "subagent" as const,
        isAvailable: true,
      }));

      // Merge and sort by relevance
      const allResults = [...toolResultsWithAvailability, ...subagentResultsWithAvailability];
      allResults.sort((a, b) => {
        const aRel = a.resultType === "tool" ? a.relevance : a.relevance;
        const bRel = b.resultType === "tool" ? b.relevance : b.relevance;
        return bRel - aRel;
      });

      // Apply final limit
      const limitedResults = allResults.slice(0, effectiveLimit);

      // IMPORTANT: Add discovered deferred tools to the discoveredTools set
      // This enables them for use in subsequent steps via prepareStep
      if (discoveredTools) {
        for (const result of limitedResults) {
          if (result.resultType === "tool") {
            const toolMeta = registry.get(result.name);
            if (toolMeta?.metadata.loading.deferLoading) {
              discoveredTools.add(result.name);
              logSearchTools(`[searchTools] Discovered deferred tool: ${result.name}`);
            }
          }
        }
      }

      // Count available items
      const toolCount = limitedResults.filter((r) => r.resultType === "tool").length;
      const subagentCount = limitedResults.filter((r) => r.resultType === "subagent").length;
      const availableCount = limitedResults.filter((r) => r.isAvailable).length;

      let message = `Found ${limitedResults.length} result(s) matching "${query}".`;
      if (toolCount > 0 && subagentCount > 0) {
        message += ` ${toolCount} tool(s) and ${subagentCount} subagent(s).`;
      } else if (toolCount > 0) {
        message += ` ${toolCount} tool(s).`;
      } else if (subagentCount > 0) {
        message += ` ${subagentCount} subagent(s).`;
      }
      if (availableCount > 0) {
        message += ` ${availableCount} are now available for use.`;
      }

      // Build summary with subagent delegation instructions
      let summary = "";
      if (subagentCount > 0) {
        summary = "To delegate to a subagent, use: delegateToSubagent({ action: 'start', agentId: '<id>', task: '<description>' })";
      }

      return {
        status: "success",
        query,
        results: limitedResults,
        message,
        summary,
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
