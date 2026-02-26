/**
 * Web Browse Tool
 *
 * AI tool that fetches web content and synthesizes answers in a single operation.
 */

import { tool, jsonSchema, type ToolExecutionOptions } from "ai";
import { browseAndSynthesize } from "./index";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import type { WebBrowseOptions } from "./types";
import { getWebScraperProvider } from "@/lib/ai/web-scraper/provider";

// ============================================================================
// Input Schema
// ============================================================================

const webBrowseSchema = jsonSchema<{
  urls: string[] | string;
  query: string;
  includeMarkdown?: boolean | string;
}>({
  type: "object",
  title: "WebBrowseInput",
  description: "Input schema for browsing and analyzing web pages",
  properties: {
    urls: {
      oneOf: [
        {
          type: "array",
          items: { type: "string", format: "uri" },
          minItems: 1,
          maxItems: 5,
          description: "URLs to fetch and analyze (1-5 URLs)",
        },
        {
          type: "string",
          description:
            "Single URL to fetch and analyze. Will be normalized into a list.",
        },
      ],
    },
    query: {
      type: "string",
      description:
        "The question or information you want to extract from the web pages. Be specific about what you're looking for.",
    },
    includeMarkdown: {
      type: ["boolean", "string"],
      description:
        "Ignored for webBrowse. Accepted for compatibility with legacy callers.",
    },
  },
  required: ["urls", "query"],
  additionalProperties: false,
});

// ============================================================================
// Result Types
// ============================================================================

interface WebBrowseToolResult {
  status: "success" | "error" | "no_api_key";
  synthesis?: string;
  fetchedUrls?: string[];
  failedUrls?: string[];
  message?: string;
}

// ============================================================================
// Tool Factory
// ============================================================================

interface WebBrowseArgs {
  urls: string[] | string;
  query: string;
  includeMarkdown?: boolean | string;
}

/**
 * Core webBrowse execution logic (extracted for logging wrapper)
 */
async function executeWebBrowse(
  options: WebBrowseOptions,
  args: WebBrowseArgs,
  toolCallOptions?: ToolExecutionOptions
): Promise<WebBrowseToolResult> {
  const { urls, query } = args;
  const normalizedUrls = Array.isArray(urls)
    ? urls
    : urls
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

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
    urls: normalizedUrls,
    query,
    options,
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
 * Create the webBrowse tool for fetching and synthesizing web content.
 */
export function createWebBrowseTool(options: WebBrowseOptions) {
  const { sessionId } = options;

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
- For general web search (finding URLs), use webSearch instead`,
    inputSchema: webBrowseSchema,
    execute: executeWithLogging,
  });
}
