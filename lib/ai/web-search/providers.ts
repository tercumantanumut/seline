/**
 * Web Search Providers
 *
 * Abstraction layer for multiple web search backends.
 * Currently supports Tavily (API-based, paid) and DuckDuckGo (scraping-based, free).
 *
 * DuckDuckGo uses `@phukon/duckduckgo-search` with the `lite` backend for reliability.
 * It returns { title, href, body } per result — no relevance scores or AI answers.
 */

import type { WebSearchSource } from "./index";
import { loadSettings } from "@/lib/settings/settings-manager";

// ============================================================================
// Provider Interface
// ============================================================================

export interface WebSearchProviderResult {
  sources: WebSearchSource[];
  /** AI-generated answer summary (Tavily only) */
  answer?: string;
}

export interface WebSearchProviderOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
}

export interface WebSearchProvider {
  name: string;
  search(query: string, options?: WebSearchProviderOptions): Promise<WebSearchProviderResult>;
  isAvailable(): boolean;
}

// ============================================================================
// Tavily Provider
// ============================================================================

const TAVILY_API_URL = "https://api.tavily.com/search";

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

function getTavilyApiKey(): string | undefined {
  loadSettings();
  return process.env.TAVILY_API_KEY;
}

export class TavilyProvider implements WebSearchProvider {
  name = "tavily";

  isAvailable(): boolean {
    return !!getTavilyApiKey();
  }

  async search(query: string, options: WebSearchProviderOptions = {}): Promise<WebSearchProviderResult> {
    const apiKey = getTavilyApiKey();
    if (!apiKey) {
      console.warn("[WEB-SEARCH] Tavily API key not configured");
      return { sources: [] };
    }

    const { maxResults = 10, searchDepth = "basic", includeAnswer = true } = options;

    try {
      const response = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      console.error("[WEB-SEARCH] Tavily search error:", error);
      return { sources: [] };
    }
  }
}

// ============================================================================
// DuckDuckGo Provider
// ============================================================================

export class DuckDuckGoProvider implements WebSearchProvider {
  name = "duckduckgo";

  isAvailable(): boolean {
    // DDG is always available (no API key needed)
    return true;
  }

  async search(query: string, options: WebSearchProviderOptions = {}): Promise<WebSearchProviderResult> {
    const { maxResults = 10 } = options;

    try {
      // Dynamic import to avoid loading DDGS dependencies unless needed
      const { DDGS } = await import("@phukon/duckduckgo-search");
      const ddgs = new DDGS();

      const raw = await ddgs.text({
        keywords: query,
        maxResults,
        backend: "lite", // Most reliable backend — html gets rate-limited faster
      });

      const sources = raw
        // Filter ads and broken URLs
        .filter((r: { href: string }) => {
          if (!r.href || !r.href.startsWith("http")) return false;
          if (r.href.includes("duckduckgo.com/y.js")) return false;
          if (r.href.includes("google.com/search?q=")) return false;
          return true;
        })
        .map((r: { title: string; href: string; body: string }, index: number) => ({
          url: r.href.trim(),
          title: r.title?.trim() || "",
          snippet: r.body?.replace(/\s+/g, " ").trim().substring(0, 500) || "",
          // Position-based heuristic (DDG doesn't provide relevance scores)
          relevanceScore: Math.max(0.5, 1.0 - index * 0.05),
        }));

      console.log(`[WEB-SEARCH] DuckDuckGo returned ${sources.length} results for: ${query}`);

      return {
        sources,
        answer: undefined, // DDG doesn't provide AI answer summaries
      };
    } catch (error: any) {
      // Check for rate limit error specifically
      if (error?.message?.includes("Ratelimit") || error?.message?.includes("202")) {
        console.warn(`[WEB-SEARCH] DuckDuckGo rate limited for query: ${query}`);
      } else {
        console.error("[WEB-SEARCH] DuckDuckGo search error:", error);
      }
      return { sources: [] };
    }
  }
}

// ============================================================================
// Provider Selection
// ============================================================================

export type WebSearchProviderType = "tavily" | "duckduckgo" | "auto";

/**
 * Get the appropriate search provider based on settings.
 *
 * "auto" mode: Uses Tavily if API key is set, otherwise falls back to DuckDuckGo.
 */
export function getSearchProvider(override?: WebSearchProviderType): WebSearchProvider {
  const providerSetting = override ?? getConfiguredProvider();

  if (providerSetting === "tavily") {
    return new TavilyProvider();
  }

  if (providerSetting === "duckduckgo") {
    return new DuckDuckGoProvider();
  }

  // "auto" mode: prefer Tavily if available, fallback to DDG
  const tavily = new TavilyProvider();
  if (tavily.isAvailable()) {
    return tavily;
  }

  return new DuckDuckGoProvider();
}

/**
 * Check if any web search provider is available.
 */
export function isAnySearchProviderAvailable(): boolean {
  const provider = getSearchProvider();
  return provider.isAvailable();
}

function getConfiguredProvider(): WebSearchProviderType {
  loadSettings();
  const setting = process.env.WEB_SEARCH_PROVIDER as WebSearchProviderType | undefined;
  if (setting === "tavily" || setting === "duckduckgo") return setting;
  return "auto";
}
