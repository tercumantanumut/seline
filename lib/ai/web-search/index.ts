/**
 * Unified Web Search Tool
 *
 * Single web entrypoint that supports action-based workflows:
 * - search: find relevant URLs and snippets
 * - browse: fetch full page content for specific URLs
 * - synthesize: fetch URLs and synthesize an answer from fetched content
 */

import { tool, jsonSchema, type ToolExecutionOptions } from "ai";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { browseAndSynthesize } from "@/lib/ai/web-browse";
import {
  createFirecrawlScrapeTool,
  type FirecrawlScrapeResult,
} from "@/lib/ai/firecrawl";
import {
  getSearchProvider,
  getWebSearchProviderStatus,
  isAnySearchProviderAvailable,
} from "./providers";

// ============================================================================
// Types
// ============================================================================

export interface WebSearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export type WebSearchAction = "search" | "browse" | "synthesize";

export interface WebSearchPage {
  url: string;
  title: string;
  markdown: string;
  contentLength: number;
  images?: string[];
  ogImage?: string;
}

export interface WebSearchResult {
  status: "success" | "error" | "no_provider";
  action: WebSearchAction;
  query: string;
  sources: WebSearchSource[];
  pages?: WebSearchPage[];
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

function formatBrowseResults(pages: WebSearchPage[]): string {
  if (pages.length === 0) {
    return "No pages fetched.";
  }

  return pages
    .map(
      (page, index) =>
        `${index + 1}. ${page.title} - ${page.url} (${Math.round(page.contentLength / 1024)}KB)`
    )
    .join("\n");
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

function snippetFromMarkdown(markdown: string, maxLength: number = 320): string {
  const flattened = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!flattened) return "";
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 3)}...`;
}

function buildSourcesFromPages(pages: WebSearchPage[]): WebSearchSource[] {
  return pages.map((page, index) => ({
    url: page.url,
    title: page.title,
    snippet: snippetFromMarkdown(page.markdown),
    relevanceScore: Math.max(0.5, 1 - index * 0.1),
  }));
}

function normalizeAction(action?: string, hasUrls: boolean = false): WebSearchAction {
  if (action === "search" || action === "browse" || action === "synthesize") {
    return action;
  }

  // Preserve legacy direct-URL behavior for callers that do not provide action.
  if (hasUrls) {
    return "synthesize";
  }

  return "search";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Operation cancelled");
    error.name = "AbortError";
    throw error;
  }
}

// ============================================================================
// Tool Schema
// ============================================================================

const webSearchSchema = jsonSchema<{
  action?: WebSearchAction;
  query?: string;
  maxResults?: number;
  includeAnswer?: boolean;
  iterateIfLowQuality?: boolean;
  urls?: string[] | string;
  includeMarkdown?: boolean | string;
}>({
  type: "object",
  title: "WebSearchInput",
  description: "Input schema for action-based web search and browsing",
  properties: {
    action: {
      type: "string",
      enum: ["search", "browse", "synthesize"],
      description:
        "Action to run: search (find URLs/snippets), browse (fetch full pages), synthesize (fetch pages and produce an AI synthesis). Default: search unless urls are provided.",
    },
    query: {
      type: "string",
      description:
        "Search query or question. Required for search and synthesize actions.",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of search results to use (1-10, default: 5)",
    },
    includeAnswer: {
      type: "boolean",
      description:
        "Whether provider-level summary should be requested when available (search action only)",
    },
    iterateIfLowQuality: {
      type: "boolean",
      description:
        "Whether to run one refinement pass if initial search quality is low (search action only)",
    },
    urls: {
      oneOf: [
        {
          type: "array",
          items: { type: "string", format: "uri" },
          minItems: 1,
          maxItems: 5,
          description:
            "URLs to browse/synthesize (required for browse and synthesize actions)",
        },
        {
          type: "string",
          description: "Comma-separated URLs to browse/synthesize",
        },
      ],
    },
    includeMarkdown: {
      type: ["boolean", "string"],
      description:
        "Compatibility flag. Kept for legacy callers; browse action always returns markdown.",
    },
  },
  required: [],
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
  action?: WebSearchAction;
  query?: string;
  maxResults?: number;
  includeAnswer?: boolean;
  iterateIfLowQuality?: boolean;
  urls?: string[] | string;
  includeMarkdown?: boolean | string;
}

async function executeBrowseAction(
  options: WebSearchToolOptions,
  query: string,
  urls: string[],
  toolCallOptions?: ToolExecutionOptions
): Promise<WebSearchResult> {
  const scrapeTool = createFirecrawlScrapeTool(options);
  const pages: WebSearchPage[] = [];
  const failedUrls: string[] = [];
  let failureMessage: string | undefined;

  for (const url of urls) {
    throwIfAborted(toolCallOptions?.abortSignal);

    const result = (await (scrapeTool.execute as any)(
      {
        url,
        onlyMainContent: true,
        extractImages: true,
      },
      toolCallOptions
    )) as FirecrawlScrapeResult;

    if (result.status === "success") {
      const markdown = result.markdown || "";
      pages.push({
        url: result.url,
        title: result.title || hostAsTitle(result.url),
        markdown,
        contentLength: markdown.length,
        images: result.images,
        ogImage: result.ogImage,
      });
      continue;
    }

    failedUrls.push(url);
    if (!failureMessage && result.message) {
      failureMessage = result.message;
    }
  }

  const sources = buildSourcesFromPages(pages);

  if (pages.length === 0) {
    return {
      status: "error",
      action: "browse",
      query,
      sources: [],
      pages: [],
      message: failureMessage || "Failed to fetch any of the requested URLs",
      iterationPerformed: false,
      formattedResults: "No pages fetched.",
      provider: "browse",
      fetchedUrls: [],
      failedUrls,
    };
  }

  const warning =
    failedUrls.length > 0
      ? `Fetched ${pages.length} page(s); failed to fetch ${failedUrls.length} URL(s).`
      : undefined;

  return {
    status: "success",
    action: "browse",
    query,
    sources,
    pages,
    message: warning,
    iterationPerformed: false,
    formattedResults: formatBrowseResults(pages),
    provider: "browse",
    fetchedUrls: pages.map((page) => page.url),
    failedUrls: failedUrls.length > 0 ? failedUrls : undefined,
  };
}

async function executeSynthesizeAction(
  options: WebSearchToolOptions,
  query: string,
  urls: string[],
  toolCallOptions?: ToolExecutionOptions
): Promise<WebSearchResult> {
  const browseOptions = {
    sessionId: options.sessionId || "UNSCOPED",
    userId: options.userId || "UNSCOPED",
    characterId: options.characterId || null,
  };

  const browseResult = await browseAndSynthesize({
    urls,
    query,
    options: browseOptions,
    abortSignal: toolCallOptions?.abortSignal,
  });

  const syntheticSources: WebSearchSource[] = urls.map((url, idx) => ({
    url,
    title: hostAsTitle(url),
    snippet: "",
    relevanceScore: Math.max(0.5, 1 - idx * 0.1),
  }));

  if (!browseResult.success) {
    return {
      status: "error",
      action: "synthesize",
      query,
      sources: syntheticSources,
      message: browseResult.error || "Failed to browse and synthesize content",
      iterationPerformed: false,
      provider: "synthesize",
      fetchedUrls: browseResult.fetchedUrls,
      failedUrls: browseResult.failedUrls,
    };
  }

  return {
    status: "success",
    action: "synthesize",
    query,
    sources: syntheticSources,
    answer: browseResult.synthesis,
    iterationPerformed: false,
    formattedResults: browseResult.synthesis,
    provider: "synthesize",
    fetchedUrls: browseResult.fetchedUrls,
    failedUrls:
      browseResult.failedUrls.length > 0 ? browseResult.failedUrls : undefined,
  };
}

async function executeSearchAction(
  query: string,
  maxResults: number,
  includeAnswer: boolean,
  iterateIfLowQuality: boolean
): Promise<WebSearchResult> {
  const providerStatus = getWebSearchProviderStatus();
  const provider = getSearchProvider();

  if (!provider.isAvailable()) {
    return {
      status: "no_provider",
      action: "search",
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
    console.warn(
      `[WEB] Auto fallback to DuckDuckGo after Tavily failure: ${finalResult.error}`
    );
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
      finalResult.sources.reduce((sum, source) => sum + source.relevanceScore, 0) /
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
        if (!acc.find((existing) => existing.url === source.url)) {
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
      action: "search",
      query,
      sources: [],
      answer: finalResult.answer,
      iterationPerformed,
      formattedResults: "No results found.",
      provider: finalResult.providerUsed ?? provider.name,
      message: finalResult.error,
    };
  }

  return {
    status: "success",
    action: "search",
    query,
    sources: finalSources,
    answer: finalResult.answer,
    iterationPerformed,
    formattedResults: formatSearchResults(finalSources, finalResult.answer),
    provider: finalResult.providerUsed ?? provider.name,
    message:
      "Use action='browse' with selected URLs when you need full-page content, or action='synthesize' to get an analyzed answer from specific URLs.",
  };
}

async function executeWebSearch(
  options: WebSearchToolOptions,
  args: WebSearchArgs,
  toolCallOptions?: ToolExecutionOptions
): Promise<WebSearchResult> {
  const providedUrls = normalizeProvidedUrls(args.urls).slice(0, MAX_BROWSE_URLS);
  const action = normalizeAction(args.action, providedUrls.length > 0);
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const maxResults = args.maxResults ?? 5;
  const includeAnswer = args.includeAnswer ?? true;
  const iterateIfLowQuality = args.iterateIfLowQuality ?? false;

  if (action === "search") {
    if (!query) {
      return {
        status: "error",
        action,
        query,
        sources: [],
        message: "query is required when action is 'search'.",
        iterationPerformed: false,
      };
    }

    return executeSearchAction(query, maxResults, includeAnswer, iterateIfLowQuality);
  }

  if (providedUrls.length === 0) {
    return {
      status: "error",
      action,
      query,
      sources: [],
      message: "urls is required when action is 'browse' or 'synthesize'.",
      iterationPerformed: false,
    };
  }

  if (action === "browse") {
    return executeBrowseAction(options, query, providedUrls, toolCallOptions);
  }

  if (!query) {
    return {
      status: "error",
      action,
      query,
      sources: [],
      message: "query is required when action is 'synthesize'.",
      iterationPerformed: false,
    };
  }

  throwIfAborted(toolCallOptions?.abortSignal);
  return executeSynthesizeAction(options, query, providedUrls, toolCallOptions);
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
    description: `Unified Web Search tool with action-based behavior.

Use actions:
- search: find web results (URLs + snippets)
- browse: fetch full markdown content from specific URLs
- synthesize: fetch URLs and return a consolidated analysis

Recommended workflow:
1) search to discover relevant URLs
2) browse selected URLs for full page content
3) synthesize only when you need an analyzed summary`,
    inputSchema: webSearchSchema,
    execute: executeWithLogging,
  });
}

export function isWebSearchAvailable(): boolean {
  return isAnySearchProviderAvailable();
}
