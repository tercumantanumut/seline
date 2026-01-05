/**
 * Web Browse Tool
 *
 * AI tool that fetches web content and synthesizes answers in a single operation.
 * Replaces the old pattern of multiple visible tool calls (fetchWebpage → docsSearch).
 *
 * Features:
 * - Fetches one or more URLs
 * - Stores content in session-scoped cache (not permanent embeddings)
 * - Uses secondary LLM to synthesize consolidated answer
 * - Single response returned to primary agent
 */

import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import {
  browseAndSynthesize,
  querySessionContent,
  getSessionContent,
  getSessionRecentUrls,
} from "./index";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import type { WebBrowseOptions } from "./types";
import { getWebScraperProvider } from "@/lib/ai/web-scraper/provider";

// ============================================================================
// Input Schema
// ============================================================================

const webBrowseSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .max(5)
    .describe("URLs to fetch and analyze (1-5 URLs)"),
  query: z
    .string()
    .describe(
      "The question or information you want to extract from the web pages. Be specific about what you're looking for."
    ),
});

const webQuerySchema = z.object({
  query: z
    .string()
    .describe(
      "Question to answer using previously fetched web content in this session. Use when you've already fetched URLs and need more information from them."
    ),
});

// ============================================================================
// Result Types
// ============================================================================

interface WebBrowseToolResult {
  status: "success" | "error" | "no_content" | "no_api_key";
  synthesis?: string;
  fetchedUrls?: string[];
  failedUrls?: string[];
  message?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

// Input args type for webBrowse
interface WebBrowseArgs {
  urls: string[];
  query: string;
}

// Input args type for webQuery
interface WebQueryArgs {
  query: string;
}

/**
 * Core webBrowse execution logic (extracted for logging wrapper)
 */
async function executeWebBrowse(
  options: WebBrowseOptions,
  args: WebBrowseArgs,
  toolCallOptions?: ToolExecutionOptions
): Promise<WebBrowseToolResult> {
  const { sessionId, userId, characterId } = options;
  const { urls, query } = args;

  // Check if Firecrawl is configured when selected
  const provider = getWebScraperProvider();
  if (provider === "firecrawl" && !process.env.FIRECRAWL_API_KEY) {
    return {
      status: "no_api_key",
      message:
        "Web browsing is not configured. Please set FIRECRAWL_API_KEY in Settings > API Keys.",
    };
  }

  const result = await browseAndSynthesize({
    urls,
    query,
    options: { sessionId, userId, characterId },
    abortSignal: toolCallOptions?.abortSignal,
  });

  if (!result.success) {
    return {
      status: "error",
      fetchedUrls: result.fetchedUrls,
      failedUrls: result.failedUrls,
      message: result.error || "Failed to browse and synthesize content",
    };
  }

  return {
    status: "success",
    synthesis: result.synthesis,
    fetchedUrls: result.fetchedUrls,
    failedUrls: result.failedUrls.length > 0 ? result.failedUrls : undefined,
  };
}

/**
 * Core webQuery execution logic (extracted for logging wrapper)
 */
async function executeWebQuery(
  sessionId: string,
  args: WebQueryArgs,
  toolCallOptions?: ToolExecutionOptions
): Promise<WebBrowseToolResult> {
  const { query } = args;

  // Check if there's any content in the session
  const content = await getSessionContent(sessionId);
  if (content.length === 0) {
    return {
      status: "no_content",
      message:
        "No web content has been fetched in this conversation. Use webBrowse to fetch URLs first.",
    };
  }

  const recentUrls = await getSessionRecentUrls(sessionId);
  const result = await querySessionContent(
    sessionId,
    query,
    recentUrls.length > 0 ? recentUrls : undefined,
    toolCallOptions?.abortSignal
  );

  if (!result.success) {
    return {
      status: "error",
      message: result.error || "Failed to query session content",
    };
  }

  return {
    status: "success",
    synthesis: result.synthesis,
    fetchedUrls: result.fetchedUrls,
  };
}

/**
 * Create the webBrowse tool for fetching and synthesizing web content.
 */
export function createWebBrowseTool(options: WebBrowseOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "webBrowse",
    sessionId,
    (args: WebBrowseArgs, toolCallOptions?: ToolExecutionOptions) =>
      executeWebBrowse(options, args, toolCallOptions)
  );

  return tool({
    description: `Fetch web pages and synthesize information from them in a single operation.

**Use this tool when you need to:**
- Read and analyze content from specific URLs
- Extract information from web pages
- Research topics by reading multiple sources

**How it works:**
1. Fetches the requested URLs
2. Analyzes the content using AI
3. Returns a synthesized answer to your query

**Parameters:**
- urls: List of 1-5 URLs to fetch
- query: What you want to know from the content

**Important:**
- Content is stored temporarily for this conversation only
- For general web search (finding URLs), use webSearch instead
- For follow-up questions about already-fetched content, use webQuery`,
    inputSchema: webBrowseSchema,
    execute: executeWithLogging,
  });
}

/**
 * Create the webQuery tool for querying previously fetched content.
 */
export function createWebQueryTool(options: WebBrowseOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "webQuery",
    sessionId,
    (args: WebQueryArgs, toolCallOptions?: ToolExecutionOptions) =>
      executeWebQuery(sessionId, args, toolCallOptions)
  );

  return tool({
    description: `Query previously fetched web content from this conversation.

**Use this tool when:**
- You've already used webBrowse to fetch URLs
- You have follow-up questions about the same content
- You want to extract different information from already-fetched pages

**Note:** This only works with content fetched in the current conversation.
If you need new pages, use webBrowse instead.`,
    inputSchema: webQuerySchema,
    execute: executeWithLogging,
  });
}

