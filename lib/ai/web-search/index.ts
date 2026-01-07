/**
 * Web Search Tool
 *
 * Lightweight web search tool using Tavily API.
 * Designed for quick lookups, not comprehensive research.
 *
 * Key differences from Deep Research:
 * - Max 10 pages per search
 * - Max 1 iteration (only iterate if absolutely necessary)
 * - No report generation, just raw search results
 * - Faster and more lightweight
 *
 * When userId and characterId are provided, results are cached
 * in the embeddings system for later retrieval via docsSearch.
 */

import { tool, jsonSchema } from "ai";
import { cacheWebSearchResults, formatBriefSearchResults, cleanupExpiredWebCache } from "@/lib/ai/web-cache";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { loadSettings } from "@/lib/settings/settings-manager";

// ============================================================================
// Tavily API Integration
// ============================================================================

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
  answer?: string;
}

const TAVILY_API_URL = "https://api.tavily.com/search";

function getTavilyApiKey(): string | undefined {
  // Ensure settings are loaded so process.env is updated (Electron standalone).
  loadSettings();
  return process.env.TAVILY_API_KEY;
}

// ============================================================================
// Types
// ============================================================================

export interface WebSearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export interface WebSearchResult {
  status: "success" | "error" | "no_api_key";
  query: string;
  sources: WebSearchSource[];
  answer?: string;
  message?: string;
  iterationPerformed: boolean;
  formattedResults?: string;  // Pre-formatted markdown with source links
}

/**
 * Format search results as markdown with source URLs
 * Similar to how deep research presents its findings
 */
function formatSearchResults(sources: WebSearchSource[], answer?: string): string {
  if (sources.length === 0) {
    return "No results found.";
  }

  let formatted = "";

  if (answer) {
    formatted += `**Summary:** ${answer}\n\n`;
  }

  formatted += "**Sources:**\n\n";
  sources.forEach((source, index) => {
    formatted += `${index + 1}. **${source.title}**\n`;
    formatted += `   - [${source.url}](${source.url})\n`;
    formatted += `   - ${source.snippet}\n\n`;
  });

  return formatted;
}

// ============================================================================
// Core Search Function
// ============================================================================

/**
 * Perform a web search using Tavily API
 */
async function performWebSearch(
  query: string,
  options: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
    apiKey?: string;
  } = {}
): Promise<{ sources: WebSearchSource[]; answer?: string }> {
  const apiKey = options.apiKey ?? getTavilyApiKey();
  if (!apiKey) {
    console.warn("[WEB-SEARCH] Tavily API key not configured");
    return { sources: [] };
  }

  const { maxResults = 10, searchDepth = "basic", includeAnswer = true } = options;

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        include_answer: includeAnswer,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WEB-SEARCH] Tavily search failed:", errorText);
      throw new Error(`Tavily search failed: ${response.status}`);
    }

    const data: TavilyResponse = await response.json();

    return {
      sources: data.results.map((result) => ({
        url: result.url,
        title: result.title,
        snippet: result.content,
        relevanceScore: result.score,
      })),
      answer: data.answer,
    };
  } catch (error) {
    console.error("[WEB-SEARCH] Search error:", error);
    return { sources: [] };
  }
}

// ============================================================================
// Tool Schema
// ============================================================================

const webSearchSchema = jsonSchema<{
  query: string;
  maxResults?: number;
  includeAnswer?: boolean;
  iterateIfLowQuality?: boolean;
}>({
  type: "object",
  title: "WebSearchInput",
  description: "Input schema for web search queries",
  properties: {
    query: {
      type: "string",
      description: "The search query to look up on the web",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of results to return (1-10, default: 5)",
    },
    includeAnswer: {
      type: "boolean",
      description: "Whether to include an AI-generated answer summary (default: true)",
    },
    iterateIfLowQuality: {
      type: "boolean",
      description: "Whether to perform a follow-up search if initial results have low relevance (default: false)",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

// ============================================================================
// Tool Factory
// ============================================================================

const MIN_QUALITY_THRESHOLD = 0.3; // Minimum average relevance score to consider results "good"

export interface WebSearchToolOptions {
  sessionId?: string;
  userId?: string;
  characterId?: string | null;
}

// Input args type for webSearch
interface WebSearchArgs {
  query: string;
  maxResults?: number;
  includeAnswer?: boolean;
  iterateIfLowQuality?: boolean;
}

/**
 * Core webSearch execution logic (extracted for logging wrapper)
 */
async function executeWebSearch(
  options: WebSearchToolOptions,
  args: WebSearchArgs
): Promise<WebSearchResult> {
  const { userId, characterId } = options;
  const { query, maxResults = 5, includeAnswer = true, iterateIfLowQuality = false } = args;
  const apiKey = getTavilyApiKey();

  // Check API key
  if (!apiKey) {
    return {
      status: "no_api_key",
      query,
      sources: [],
      message: "Web search is not configured. Please set the TAVILY_API_KEY environment variable.",
      iterationPerformed: false,
    };
  }

  // Perform initial search
  const initialResult = await performWebSearch(query, {
    maxResults,
    includeAnswer,
    searchDepth: "basic",
    apiKey,
  });

  let finalSources = initialResult.sources;
  let iterationPerformed = false;

  // Check if we should iterate (only if enabled and results are low quality)
  if (iterateIfLowQuality && initialResult.sources.length > 0) {
    const avgScore =
      initialResult.sources.reduce((sum, s) => sum + s.relevanceScore, 0) /
      initialResult.sources.length;

    if (avgScore < MIN_QUALITY_THRESHOLD) {
      console.log(
        `[WEB-SEARCH] Low quality results (avg score: ${avgScore.toFixed(2)}), performing refined search`
      );

      // Refine the query for better results
      const refinedQuery = `${query} (detailed information)`;
      const refinedResult = await performWebSearch(refinedQuery, {
        maxResults,
        includeAnswer,
        searchDepth: "advanced",
        apiKey,
      });

      // Merge results, preferring higher scoring ones
      const allSources = [...initialResult.sources, ...refinedResult.sources];
      const uniqueSources = allSources.reduce((acc, source) => {
        if (!acc.find((s) => s.url === source.url)) {
          acc.push(source);
        }
        return acc;
      }, [] as WebSearchSource[]);

      // Sort by relevance and take top results
      finalSources = uniqueSources
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxResults);

      iterationPerformed = true;
    }
  }

  // Cache results if we have user context
  if (userId && characterId && finalSources.length > 0) {
    // Cache in background, don't block response
    cacheWebSearchResults(
      { status: "success", query, sources: finalSources, iterationPerformed },
      { userId, characterId, expiryHours: 1 }
    ).catch((err) => {
      console.error("[WEB-SEARCH] Failed to cache results:", err);
    });

    // Cleanup expired cache in background
    cleanupExpiredWebCache().catch((err) => {
      console.error("[WEB-SEARCH] Failed to cleanup expired cache:", err);
    });

    // Return brief results to save context
    return {
      status: "success",
      query,
      sources: finalSources,
      answer: initialResult.answer,
      iterationPerformed,
      formattedResults: formatBriefSearchResults(finalSources),
    };
  }

  // No caching context - return full results
  return {
    status: "success",
    query,
    sources: finalSources,
    answer: initialResult.answer,
    iterationPerformed,
    formattedResults: formatSearchResults(finalSources, initialResult.answer),
  };
}

/**
 * Create the web search tool instance.
 * When userId and characterId are provided, results are cached in embeddings
 * and a brief summary is returned instead of full results.
 */
export function createWebSearchTool(options: WebSearchToolOptions = {}) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "webSearch",
    sessionId,
    (args: WebSearchArgs) => executeWebSearch(options, args)
  );

  return tool({
    description: `Search the web for current information using Tavily. Use for quick lookups, fact-checking, or finding recent information. Maximum 10 results per search.

**DO NOT use for:**
- Image or video generation tasks (use the appropriate generation/editing tools directly)
- Researching how to write prompts or use creative tools (tool instructions are provided via searchTools)
- Looking up artistic styles, techniques, or visual concepts that you can describe directly in generation prompts

**DO use for:**
- Finding current trends, popular styles, or recent cultural references when the user explicitly asks for them
- Fact-checking specific details (e.g., "What does a 1960s Danish modern chair look like?")
- Looking up real-world information needed for accurate generation (e.g., "Current fashion trends 2024")

The key distinction: Use webSearch for factual lookups that inform your creative work, but NOT as a substitute for directly using generation tools once you know what to create.

For comprehensive research, use the Deep Research feature instead.`,
    inputSchema: webSearchSchema,
    execute: executeWithLogging,
  });
}

/**
 * Check if web search is available (API key configured)
 */
export function isWebSearchAvailable(): boolean {
  return !!getTavilyApiKey();
}

