/**
 * Prompt Enhancement System
 *
 * Enriches user queries with relevant context from synced folders
 * using vector search. This is triggered manually by the user via
 * the "Enhance" button in the chat composer.
 *
 * Enhanced Features:
 * - Cross-file dependency detection (finds imported/referenced files)
 * - Related concept expansion (expands queries to related terms)
 * - Content snippets (includes actual code/text within token budget)
 *
 * The system is domain-agnostic and works with any type of content:
 * - Code and technical documentation
 * - Research papers and academic content
 * - Business documents and reports
 * - Creative writing and notes
 * - Any other indexed content
 */

import { searchWithRouter, type VectorSearchHit } from "@/lib/vectordb";
import { isVectorDBEnabled } from "@/lib/vectordb/client";
import { getSyncFolders } from "@/lib/vectordb/sync-service";

// Re-export utilities for backward compatibility
export type {
  TokenBudget,
  FileDependency,
  ConceptExpansionResult,
  RankedSnippet,
  FileGroup,
} from "./prompt-enhancement-utils";

export {
  DEFAULT_TOKEN_BUDGET,
  estimateTokens,
  truncateToTokenBudget,
  DOMAIN_EXPANSIONS,
  extractDependenciesFromChunk,
  normalizeDependencyPath,
  resolveDependencies,
  expandQueryConcepts,
  selectSnippets,
  getCodeLanguage,
  formatSnippetsAsContext,
  getFileType,
  groupResultsByFile,
  extractBriefDescription,
  formatAsStructuredContext,
  buildEnhancedPrompt,
  buildEnhancedPromptV2,
} from "./prompt-enhancement-utils";

import {
  DEFAULT_TOKEN_BUDGET,
  type TokenBudget,
  expandQueryConcepts,
  extractDependenciesFromChunk,
  resolveDependencies,
  groupResultsByFile,
  formatAsStructuredContext,
  selectSnippets,
  formatSnippetsAsContext,
  buildEnhancedPromptV2,
  buildEnhancedPrompt,
} from "./prompt-enhancement-utils";

export interface PromptEnhancementResult {
  /** Whether enhancement was applied */
  enhanced: boolean;
  /** The final prompt to send to the AI */
  prompt: string;
  /** Original user query */
  originalQuery: string;
  /** Number of relevant files found */
  filesFound?: number;
  /** Number of chunks retrieved */
  chunksRetrieved?: number;
  /** Concepts that were expanded from the query */
  expandedConcepts?: string[];
  /** Number of dependencies resolved */
  dependenciesResolved?: number;
  /** Reason if enhancement was skipped */
  skipReason?: string;
}

export interface EnhancedPromptOptions {
  /** Token budget override */
  tokenBudget?: Partial<TokenBudget>;
  /** Whether to expand query with related concepts (default: true) */
  expandConcepts?: boolean;
  /** Whether to resolve cross-file dependencies (default: true) */
  resolveDependencies?: boolean;
  /** Whether to include content snippets (default: true) */
  includeSnippets?: boolean;
}

/**
 * Check if the query has enough substance to benefit from enhancement.
 * Since enhancement is now manual (user clicks button), we mainly check
 * that the query isn't empty or trivially short.
 */
export function canEnhanceQuery(query: string): boolean {
  const trimmed = query.trim();
  // Need at least 3 characters to do meaningful search
  return trimmed.length >= 3;
}

/**
 * Check if an agent has indexed files
 */
export async function hasIndexedFiles(characterId: string): Promise<boolean> {
  if (!isVectorDBEnabled()) {
    return false;
  }

  try {
    const folders = await getSyncFolders(characterId);
    return folders.length > 0;
  } catch {
    return false;
  }
}

/**
 * Enhance a user prompt with relevant context from vectorDB.
 * This is called when the user manually clicks the "Enhance" button.
 *
 * Enhanced features:
 * - Cross-file dependency detection
 * - Related concept expansion
 * - Content snippets within token budget
 */
export async function enhancePrompt(
  userInput: string,
  characterId: string | null,
  options: EnhancedPromptOptions = {}
): Promise<PromptEnhancementResult> {
  const originalQuery = userInput.trim();
  const budget = { ...DEFAULT_TOKEN_BUDGET, ...options.tokenBudget };

  // Base result for early returns
  const baseResult: PromptEnhancementResult = {
    enhanced: false,
    prompt: originalQuery,
    originalQuery,
  };

  // Skip if no character context
  if (!characterId) {
    return {
      ...baseResult,
      skipReason: "No agent context available. Please select an agent first.",
    };
  }

  // Skip if vectorDB is not enabled
  if (!isVectorDBEnabled()) {
    return {
      ...baseResult,
      skipReason: "Vector Search is not enabled. Enable it in Settings to use this feature.",
    };
  }

  // Skip if query is too short
  if (!canEnhanceQuery(originalQuery)) {
    return {
      ...baseResult,
      skipReason: "Query is too short. Please enter at least 3 characters.",
    };
  }

  // Check if agent has indexed files
  const hasFiles = await hasIndexedFiles(characterId);
  if (!hasFiles) {
    return {
      ...baseResult,
      skipReason: "No synced folders for this agent. Add folders in the agent settings to use enhancement.",
    };
  }

  try {
    // Step 1: Expand query with related concepts (if enabled)
    let searchQueries = [originalQuery];
    let conceptMap: Record<string, string[]> = {};

    if (options.expandConcepts !== false) {
      const expansion = expandQueryConcepts(originalQuery);
      searchQueries = expansion.expandedQueries;
      conceptMap = expansion.conceptMap;
      console.log(`[PromptEnhancement] Expanded query to ${searchQueries.length} variants`);
    }

    // Step 2: Perform vector searches in parallel for all expanded queries
    const searchPromises = searchQueries.map(q =>
      searchWithRouter({
        characterId,
        query: q,
        options: {
          topK: 10, // Per query
          minScore: 0.01,
        },
      })
    );
    const searchResultArrays = await Promise.all(searchPromises);

    // Merge and deduplicate results (keep highest score per chunk)
    const hitMap = new Map<string, VectorSearchHit>();
    for (const results of searchResultArrays) {
      for (const hit of results) {
        const key = `${hit.relativePath}:${hit.chunkIndex}`;
        if (!hitMap.has(key) || hitMap.get(key)!.score < hit.score) {
          hitMap.set(key, hit);
        }
      }
    }
    let allHits = Array.from(hitMap.values());

    if (allHits.length === 0) {
      return {
        ...baseResult,
        skipReason: "No relevant content found. Try different keywords or check your synced folders.",
      };
    }

    // Step 3: Resolve cross-file dependencies (if enabled)
    let dependenciesResolved = 0;
    if (options.resolveDependencies !== false) {
      const existingFiles = new Set(allHits.map(h => h.relativePath));
      const dependencies = allHits.flatMap(h =>
        extractDependenciesFromChunk(h.text, h.relativePath)
      );

      if (dependencies.length > 0) {
        console.log(`[PromptEnhancement] Found ${dependencies.length} dependencies to resolve`);
        const dependencyHits = await resolveDependencies(
          dependencies,
          characterId,
          existingFiles
        );
        dependenciesResolved = dependencyHits.length;
        allHits = [...allHits, ...dependencyHits];
        console.log(`[PromptEnhancement] Resolved ${dependenciesResolved} dependencies`);
      }
    }

    // Step 4: Group results by file
    const fileGroups = groupResultsByFile(allHits);

    // Step 5: Format output
    let enhancedPrompt: string;

    if (options.includeSnippets !== false) {
      // New V2 flow: include content snippets
      const filePointers = formatAsStructuredContext(fileGroups.slice(0, 10));
      const selectedSnippets = selectSnippets(allHits, budget.snippets);
      const snippetContext = formatSnippetsAsContext(selectedSnippets);

      enhancedPrompt = buildEnhancedPromptV2(
        originalQuery,
        filePointers,
        snippetContext,
        conceptMap
      );

      console.log(`[PromptEnhancement] Enhanced prompt with ${allHits.length} chunks, ${selectedSnippets.length} snippets from ${fileGroups.length} files`);
    } else {
      // Legacy flow: file pointers only
      const structuredContext = formatAsStructuredContext(fileGroups);
      enhancedPrompt = buildEnhancedPrompt(originalQuery, structuredContext);

      console.log(`[PromptEnhancement] Enhanced prompt with ${allHits.length} chunks from ${fileGroups.length} files`);
    }

    return {
      enhanced: true,
      prompt: enhancedPrompt,
      originalQuery,
      filesFound: fileGroups.length,
      chunksRetrieved: allHits.length,
      expandedConcepts: Object.values(conceptMap).flat(),
      dependenciesResolved,
    };
  } catch (error) {
    console.error("[PromptEnhancement] Error enhancing prompt:", error);
    return {
      ...baseResult,
      skipReason: `Enhancement failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
