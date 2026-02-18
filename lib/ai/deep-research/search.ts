/**
 * Deep Research Search Module
 *
 * Provides web search capabilities for the deep research workflow.
 * Supports Tavily API (primary) and DuckDuckGo (free fallback).
 */

import type { ResearchSource, ResearchFinding } from './types';
import { loadSettings } from '@/lib/settings/settings-manager';
import { getSearchProvider } from '@/lib/ai/web-search/providers';

// ============================================================================
// Tavily Search Integration (kept for direct deep research use)
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
}

const TAVILY_API_URL = 'https://api.tavily.com/search';

function getTavilyApiKey(): string | undefined {
  // Ensure settings are loaded so process.env is updated (Electron standalone).
  loadSettings();
  return process.env.TAVILY_API_KEY;
}

/**
 * Search using Tavily API
 */
export async function tavilySearch(
  query: string,
  options: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
    abortSignal?: AbortSignal;
  } = {}
): Promise<ResearchSource[]> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    console.warn('[DEEP-RESEARCH] Tavily API key not configured, falling back to DuckDuckGo');
    return duckduckgoSearch(query, options);
  }

  const { maxResults = 5, searchDepth = 'advanced', includeAnswer = false, abortSignal } = options;

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        include_answer: includeAnswer,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DEEP-RESEARCH] Tavily search failed:', errorText);
      throw new Error(`Tavily search failed: ${response.status}`);
    }

    const data: TavilyResponse = await response.json();

    return data.results.map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.content,
      relevanceScore: result.score,
    }));
  } catch (error) {
    // Re-throw abort errors so they propagate correctly
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Research cancelled');
    }
    console.error('[DEEP-RESEARCH] Search error:', error);
    // Return empty results on error rather than throwing
    return [];
  }
}

// ============================================================================
// DuckDuckGo Search Integration
// ============================================================================

/**
 * Search using DuckDuckGo (free, no API key needed)
 */
export async function duckduckgoSearch(
  query: string,
  options: {
    maxResults?: number;
    abortSignal?: AbortSignal;
  } = {}
): Promise<ResearchSource[]> {
  const { maxResults = 5 } = options;

  try {
    const provider = getSearchProvider('duckduckgo');
    const result = await provider.search(query, { maxResults });

    return result.sources.map((s) => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      relevanceScore: s.relevanceScore,
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Research cancelled');
    }
    console.error('[DEEP-RESEARCH] DuckDuckGo search error:', error);
    return [];
  }
}

// ============================================================================
// Mock Search (for development/testing)
// ============================================================================

/**
 * Mock search for development when no API key is available
 */
export function mockSearch(query: string): ResearchSource[] {
  console.log('[DEEP-RESEARCH] Using mock search for:', query);

  return [
    {
      url: 'https://example.com/article-1',
      title: `Research on: ${query}`,
      snippet: `This is a mock search result for "${query}". In production, this would contain real search results from Tavily or another search provider.`,
      relevanceScore: 0.95,
    },
    {
      url: 'https://example.com/article-2',
      title: `Analysis: ${query}`,
      snippet: `Another mock result providing analysis on "${query}". Configure TAVILY_API_KEY for real search results.`,
      relevanceScore: 0.85,
    },
  ];
}

// ============================================================================
// Provider-Aware Search
// ============================================================================

/**
 * Search using the configured provider (auto-selects based on settings)
 */
async function providerSearch(
  query: string,
  options: {
    maxResults?: number;
    abortSignal?: AbortSignal;
  } = {}
): Promise<ResearchSource[]> {
  const provider = getSearchProvider();

  if (provider.name === 'tavily') {
    return tavilySearch(query, {
      maxResults: options.maxResults,
      searchDepth: 'advanced',
      abortSignal: options.abortSignal,
    });
  }

  if (provider.name === 'duckduckgo') {
    return duckduckgoSearch(query, options);
  }

  // Fallback to mock
  return mockSearch(query);
}

// ============================================================================
// Search Orchestration
// ============================================================================

/**
 * Execute multiple searches in parallel with rate limiting.
 * Uses the configured search provider (Tavily or DuckDuckGo).
 *
 * Note: DuckDuckGo requires sequential requests — concurrent DDG searches
 * will trigger rate limiting. The function reduces concurrency to 1 for DDG.
 */
export async function executeSearches(
  queries: string[],
  options: {
    maxConcurrent?: number;
    maxResultsPerQuery?: number;
    onProgress?: (completed: number, total: number, currentQuery: string) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<ResearchFinding[]> {
  const provider = getSearchProvider();
  // DDG needs sequential requests to avoid rate limits
  const effectiveConcurrency = provider.name === 'duckduckgo' ? 1 : (options.maxConcurrent ?? 3);
  const { maxResultsPerQuery = 5, onProgress, abortSignal } = options;
  const findings: ResearchFinding[] = [];

  // Process queries in batches
  for (let i = 0; i < queries.length; i += effectiveConcurrency) {
    // Check for abort before starting each batch
    if (abortSignal?.aborted) {
      throw new Error('Research cancelled');
    }

    const batch = queries.slice(i, i + effectiveConcurrency);

    const batchResults = await Promise.all(
      batch.map(async (query, batchIndex) => {
        const globalIndex = i + batchIndex;
        onProgress?.(globalIndex, queries.length, query);

        const sources = await providerSearch(query, { maxResults: maxResultsPerQuery, abortSignal });

        return {
          query,
          sources,
          summary: '', // Will be filled by analysis step
          timestamp: new Date(),
        };
      })
    );

    findings.push(...batchResults);
  }

  // Final progress update
  onProgress?.(queries.length, queries.length, 'Complete');

  return findings;
}

/**
 * Check if search is available (any provider configured)
 */
export function isSearchAvailable(): boolean {
  const provider = getSearchProvider();
  return provider.isAvailable();
}
