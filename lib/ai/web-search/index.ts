/**
 * Unified Web Tool
 *
 * Single web entrypoint that can:
 * - Search the web for relevant URLs
 * - Fetch page content
 * - Synthesize a grounded answer from fetched content
 *
 * This replaces the old multi-tool web flow.
 */

import { tool, jsonSchema, type ToolExecutionOptions } from "ai";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { browseAndSynthesize } from "@/lib/ai/web-browse";
import { getSearchProvider, getWebSearchProviderStatus, isAnySearchProviderAvailable } from "./providers";

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
  status: "success" | "error" | "no_provider";
  query: string;
  sources: WebSearchSource[];
  answer?: string;
  message?: string;
  iterationPerformed: boolean;
  formattedResults?: string;
  provider?: string;
  fetchedUrls?: string[];
  failedUrls?: string[];
}

function formatSearchResults(sources: WebSearchSource[], answer?: string): string {
  if (sources.length === 0) {
    return "No results found.";
  }

  let formatted = "";

  if (answer) {
    formatted += `${answer}\n\n`;
  }

  formatted += "Sources:\n";
  sources.forEach((source, index) => {
    formatted += `${index + 1}. ${source.title} - ${source.url}\n`;
  });

  return formatted.trim();
}

function normalizeProvidedUrls(urls?: string[] | string): string[] {
  if (!urls) return [];

  const rawList = Array.isArray(urls)
    ? urls
    : urls
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const candidate of rawList) {
    try {
      const parsed = new URL(candidate);
      const value = parsed.toString();
      if (!seen.has(value)) {
        seen.add(value);
        normalized.push(value);
      }
    } catch {
      // Ignore invalid URL candidates to keep tool resilient.
    }
  }

  return normalized;
}

function hostAsTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
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
  urls?: string[] | string;
  includeMarkdown?: boolean | string;
}>({
  type: "object",
  title: "WebSearchInput",
  description: "Input schema for unified web search and browsing",
  properties: {
    query: {
      type: "string",
      description: "What you need from the web content",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of search results to use (1-10, default: 5)",
    },
    includeAnswer: {
      type: "boolean",
      description: "Whether provider-level summary should be requested when available",
    },
    iterateIfLowQuality: {
      type: "boolean",
      description: "Whether to run one refinement pass if initial search quality is low",
    },
    urls: {
      oneOf: [
        {
          type: "array",
          items: { type: "string", format: "uri" },
          minItems: 1,
          maxItems: 5,
          description: "Optional direct URLs to browse (skips search step)",
        },
        {
          type: "string",
          description: "Optional comma-separated URLs to browse",
        },
      ],
    },
    includeMarkdown: {
      type: ["boolean", "string"],
      description: "Ignored for compatibility with legacy callers",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

// ============================================================================
// Tool Factory
// ============================================================================

const MIN_QUALITY_THRESHOLD = 0.3;
const MAX_BROWSE_URLS = 5;

export interface WebSearchToolOptions {
  sessionId?: string;
  userId?: string;
  characterId?: string | null;
}

interface WebSearchArgs {
  query: string;
  maxResults?: number;
  includeAnswer?: boolean;
  iterateIfLowQuality?: boolean;
  urls?: string[] | string;
  includeMarkdown?: boolean | string;
}

async function executeWebSearch(
  options: WebSearchToolOptions,
  args: WebSearchArgs,
  toolCallOptions?: ToolExecutionOptions
): Promise<WebSearchResult> {
  const { sessionId, userId, characterId } = options;
  const { query, maxResults = 5, includeAnswer = true, iterateIfLowQuality = false } = args;

  const browseOptions = {
    sessionId: sessionId || "UNSCOPED",
    userId: userId || "UNSCOPED",
    characterId: characterId || null,
  };

  // 1) Optional direct browse mode (single tool, explicit URLs)
  const providedUrls = normalizeProvidedUrls(args.urls).slice(0, MAX_BROWSE_URLS);
  if (providedUrls.length > 0) {
    const browseResult = await browseAndSynthesize({
      urls: providedUrls,
      query,
      options: browseOptions,
      abortSignal: toolCallOptions?.abortSignal,
    });

    const syntheticSources: WebSearchSource[] = providedUrls.map((url, idx) => ({
      url,
      title: hostAsTitle(url),
      snippet: "",
      relevanceScore: Math.max(0.5, 1 - idx * 0.1),
    }));

    if (!browseResult.success) {
      return {
        status: "error",
        query,
        sources: syntheticSources,
        message: browseResult.error || "Failed to browse provided URLs",
        iterationPerformed: false,
        fetchedUrls: browseResult.fetchedUrls,
        failedUrls: browseResult.failedUrls,
      };
    }

    return {
      status: "success",
      query,
      sources: syntheticSources,
      answer: browseResult.synthesis,
      iterationPerformed: false,
      formattedResults: browseResult.synthesis,
      provider: "direct-urls",
      fetchedUrls: browseResult.fetchedUrls,
      failedUrls: browseResult.failedUrls.length > 0 ? browseResult.failedUrls : undefined,
    };
  }

  // 2) Search phase
  const providerStatus = getWebSearchProviderStatus();
  const provider = getSearchProvider();

  if (!provider.isAvailable()) {
    return {
      status: "no_provider",
      query,
      sources: [],
      message:
        "Web search is currently unavailable because Tavily is selected without an API key. Switch Web Search Provider to Auto or DuckDuckGo, or add your Tavily key in Settings.",
      iterationPerformed: false,
    };
  }

  const initialResult = await provider.search(query, {
    maxResults,
    includeAnswer,
    searchDepth: "basic",
  });

  let finalResult = initialResult;
  let finalSources = finalResult.sources;
  let iterationPerformed = false;

  if (
    providerStatus.configuredProvider === "auto" &&
    provider.name === "tavily" &&
    finalSources.length === 0 &&
    finalResult.error
  ) {
    console.warn(`[WEB] Auto fallback to DuckDuckGo after Tavily failure: ${finalResult.error}`);
    const fallbackProvider = getSearchProvider("duckduckgo");
    const fallbackResult = await fallbackProvider.search(query, {
      maxResults,
      includeAnswer: false,
      searchDepth: "basic",
    });

    if (fallbackResult.sources.length > 0) {
      finalResult = fallbackResult;
      finalSources = fallbackResult.sources;
    }
  }

  if (
    iterateIfLowQuality &&
    provider.name === "tavily" &&
    finalResult.providerUsed === "tavily" &&
    finalResult.sources.length > 0
  ) {
    const avgScore =
      finalResult.sources.reduce((sum, s) => sum + s.relevanceScore, 0) /
      finalResult.sources.length;

    if (avgScore < MIN_QUALITY_THRESHOLD) {
      const refinedQuery = `${query} (detailed information)`;
      const refinedResult = await provider.search(refinedQuery, {
        maxResults,
        includeAnswer,
        searchDepth: "advanced",
      });

      const allSources = [...finalResult.sources, ...refinedResult.sources];
      const uniqueSources = allSources.reduce((acc, source) => {
        if (!acc.find((s) => s.url === source.url)) {
          acc.push(source);
        }
        return acc;
      }, [] as WebSearchSource[]);

      finalSources = uniqueSources
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxResults);

      iterationPerformed = true;
    }
  }

  if (finalSources.length === 0) {
    return {
      status: "success",
      query,
      sources: [],
      answer: finalResult.answer,
      iterationPerformed,
      formattedResults: "No results found.",
      provider: finalResult.providerUsed ?? provider.name,
      message: finalResult.error,
    };
  }

  // 3) Browse + synthesize phase (single-tool behavior)
  const urlsToBrowse = finalSources.slice(0, Math.min(maxResults, MAX_BROWSE_URLS)).map((s) => s.url);
  const browseResult = await browseAndSynthesize({
    urls: urlsToBrowse,
    query,
    options: browseOptions,
    abortSignal: toolCallOptions?.abortSignal,
  });

  if (!browseResult.success) {
    return {
      status: "success",
      query,
      sources: finalSources,
      answer: finalResult.answer,
      iterationPerformed,
      formattedResults: formatSearchResults(finalSources, finalResult.answer),
      provider: finalResult.providerUsed ?? provider.name,
      message: browseResult.error || "Search succeeded but browsing failed",
      fetchedUrls: browseResult.fetchedUrls,
      failedUrls: browseResult.failedUrls,
    };
  }

  return {
    status: "success",
    query,
    sources: finalSources,
    answer: browseResult.synthesis,
    iterationPerformed,
    formattedResults: browseResult.synthesis,
    provider: finalResult.providerUsed ?? provider.name,
    fetchedUrls: browseResult.fetchedUrls,
    failedUrls: browseResult.failedUrls.length > 0 ? browseResult.failedUrls : undefined,
  };
}

export function createWebSearchTool(options: WebSearchToolOptions = {}) {
  const { sessionId } = options;

  const executeWithLogging = withToolLogging(
    "webSearch",
    sessionId,
    (args: WebSearchArgs, toolCallOptions?: ToolExecutionOptions) =>
      executeWebSearch(options, args, toolCallOptions)
  );

  return tool({
    description: `Unified web tool for finding and reading web content in one call.

Use for:
- searching current information
- reading specific URLs
- getting a synthesized answer grounded in fetched pages

Behavior:
- if urls are provided: fetch + synthesize those URLs
- if urls are omitted: search first, then fetch top results, then synthesize`,
    inputSchema: webSearchSchema,
    execute: executeWithLogging,
  });
}

export function isWebSearchAvailable(): boolean {
  return isAnySearchProviderAvailable();
}
