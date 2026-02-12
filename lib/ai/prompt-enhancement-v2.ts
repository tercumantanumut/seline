/**
 * LLM-Driven Prompt Enhancement (V2)
 *
 * Replaces the heuristic-based prompt enhancement with an LLM-driven approach.
 * Uses a secondary LLM (utility model) to analyze and synthesize search results
 * into coherent, contextually relevant prompt enhancements.
 *
 * Architecture:
 * 1. Stage 1: Initial semantic search (existing infrastructure)
 * 2. Stage 2: LLM refinement with optional tool calls
 * 3. Stage 3: Output integration with fallback to heuristic approach
 */

import { generateText } from "ai";
import { getUtilityModel, getProviderTemperature } from "./providers";
import {
  getEnhancementSession,
  addSessionMessage,
  buildEnhancementRequest,
  ENHANCEMENT_SYSTEM_PROMPT,
} from "./prompt-enhancement-llm";
import { getFileTreeForAgent, formatFileTreeCompact } from "./file-tree";
import { formatMemoriesForPrompt } from "@/lib/agent-memory/prompt-injection";
import { searchWithRouter, type VectorSearchHit } from "@/lib/vectordb";
import { isVectorDBEnabled } from "@/lib/vectordb/client";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import { extname, basename } from "path";

// =============================================================================
// Types
// =============================================================================

export interface LLMEnhancementOptions {
  /** Maximum time to wait for LLM enhancement (default: 45000ms) */
  timeoutMs?: number;
  /** Recent conversation messages for context */
  conversationContext?: Array<{ role: string; content: string }>;
  /** User ID for tool access */
  userId?: string;
  /** Whether to include file tree in context (default: true) */
  includeFileTree?: boolean;
  /** Whether to include memories in context (default: true) */
  includeMemories?: boolean;
}

export interface LLMEnhancementResult {
  enhanced: boolean;
  prompt: string;
  originalQuery: string;
  filesFound?: number;
  chunksRetrieved?: number;
  usedLLM?: boolean;
  skipReason?: string;
  error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_TIMEOUT_MS = 45000; // 45 seconds — allows for search + LLM synthesis pipeline
const MAX_SEARCH_RESULTS = 25;
const MIN_SEARCH_SCORE = 0.05;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if we can enhance the query
 */
function canEnhanceQuery(query: string): boolean {
  return query.trim().length >= 3;
}

/**
 * Check if agent has indexed files
 */
async function hasIndexedFiles(characterId: string): Promise<boolean> {
  const folders = await getSyncFolders(characterId);
  return folders.length > 0;
}

/**
 * Detect the type of user input for format-aware enhancement
 * This helps the LLM understand whether to preserve format (bug reports)
 * or transform into task briefs (short directives)
 */
function detectInputType(input: string): 'bug_report' | 'feature_request' | 'question' | 'implementation_task' {
  const lower = input.toLowerCase();

  // Bug report signals - these have structure that should be preserved
  const bugReportSignals = [
    'steps to reproduce',
    'expected result',
    'actual result',
    'expected behavior',
    'actual behavior',
    'expected:',
    'actual:',
    'reproduction steps',
    'bug report',
    'issue:',
    'problem:',
  ];

  if (bugReportSignals.some(signal => lower.includes(signal))) {
    return 'bug_report';
  }

  // Check for bug-like descriptions without explicit structure
  if (
    (lower.includes('bug') || lower.includes('broken') || lower.includes('not working') || lower.includes('fails')) &&
    (lower.includes('when') || lower.includes('after') || lower.includes('instead'))
  ) {
    return 'bug_report';
  }

  // Question signals
  if (
    lower.startsWith('how') ||
    lower.startsWith('what') ||
    lower.startsWith('why') ||
    lower.startsWith('where') ||
    lower.startsWith('can you explain') ||
    lower.startsWith('could you explain') ||
    input.includes('?')
  ) {
    return 'question';
  }

  // Feature request signals
  const featureSignals = [
    'add',
    'implement',
    'create',
    'should be able to',
    'want to',
    'would like',
    'feature request',
    'enhancement',
    'new feature',
  ];

  if (featureSignals.some(signal => lower.includes(signal))) {
    return 'feature_request';
  }

  // Default: implementation task (short directives)
  return 'implementation_task';
}

/**
 * Format search results for LLM consumption
 * Enhanced to extract and highlight identifiable patterns (classes, IDs, functions)
 */
function formatSearchResultsForLLM(hits: VectorSearchHit[]): string {
  if (hits.length === 0) {
    return "No search results found.";
  }

  const lines: string[] = [];
  lines.push("### Grounding Context (use these exact names and paths)\n");

  const fileGroups = new Map<string, VectorSearchHit[]>();

  // Group by file
  for (const hit of hits) {
    const path = hit.relativePath;
    if (!fileGroups.has(path)) {
      fileGroups.set(path, []);
    }
    fileGroups.get(path)!.push(hit);
  }

  // Format each file group with identifier extraction
  for (const [filePath, fileHits] of fileGroups) {
    const fileName = basename(filePath);
    const ext = extname(filePath).slice(1).toLowerCase();
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
      py: "python", md: "markdown", json: "json", sql: "sql",
    };
    const lang = langMap[ext] || ext || "text";

    lines.push(`#### File: \`${filePath}\``);

    // Combine all text for identifier extraction
    const allText = fileHits.map(h => h.text).join('\n');

    // Extract identifiable patterns for grounding
    const identifiers: string[] = [];

    // CSS class names (className="..." or class="...")
    const classMatches = allText.match(/class(?:Name)?=["']([^"']+)["']/g);
    if (classMatches) {
      const classes = classMatches
        .map(m => m.match(/["']([^"']+)["']/)?.[1])
        .filter(Boolean)
        .slice(0, 5);
      if (classes.length > 0) {
        identifiers.push(`Classes: ${classes.map(c => `\`${c}\``).join(', ')}`);
      }
    }

    // Element IDs
    const idMatches = allText.match(/id=["']([^"']+)["']/g);
    if (idMatches) {
      const ids = idMatches
        .map(m => m.match(/["']([^"']+)["']/)?.[1])
        .filter(Boolean)
        .slice(0, 5);
      if (ids.length > 0) {
        identifiers.push(`IDs: ${ids.map(id => `\`${id}\``).join(', ')}`);
      }
    }

    // Function/component names (function X, const X =, export function X)
    const funcMatches = allText.match(/(?:export\s+)?(?:function|const|let|var)\s+(\w+)/g);
    if (funcMatches) {
      const funcs = [...new Set(funcMatches
        .map(m => m.match(/(?:function|const|let|var)\s+(\w+)/)?.[1])
        .filter(Boolean)
      )].slice(0, 5);
      if (funcs.length > 0) {
        identifiers.push(`Functions/Vars: ${funcs.map(f => `\`${f}\``).join(', ')}`);
      }
    }

    // Props in JSX/TSX
    if (ext.includes('tsx') || ext.includes('jsx')) {
      const propMatches = allText.match(/\b(\w+)\s*[=:]\s*\{/g);
      if (propMatches) {
        const props = [...new Set(propMatches
          .map(m => m.match(/(\w+)\s*[=:]/)?.[1])
          .filter(Boolean)
        )].slice(0, 5);
        if (props.length > 0) {
          identifiers.push(`Props: ${props.map(p => `\`${p}\``).join(', ')}`);
        }
      }
    }

    if (identifiers.length > 0) {
      lines.push(`**Identifiers found:** ${identifiers.join(' | ')}`);
    }
    lines.push('');

    // Sort chunks by index and include code snippets
    fileHits.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const isCode = ["ts", "tsx", "js", "jsx", "py", "sql", "json"].includes(ext);

    // Limit to 2 snippets per file to avoid overwhelming context
    for (const hit of fileHits.slice(0, 2)) {
      if (isCode) {
        lines.push("```" + lang);
        lines.push(hit.text.trim());
        lines.push("```");
      } else {
        lines.push(hit.text.trim());
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Perform initial semantic search
 */
async function performInitialSearch(
  query: string,
  characterId: string
): Promise<{ hits: VectorSearchHit[]; filesFound: number }> {
  const results = await searchWithRouter({
    characterId,
    query,
    options: {
      topK: MAX_SEARCH_RESULTS,
      minScore: MIN_SEARCH_SCORE,
    },
  });

  const uniqueFiles = new Set(results.map((r) => r.relativePath));

  return {
    hits: results,
    filesFound: uniqueFiles.size,
  };
}

// =============================================================================
// Main LLM Enhancement Function
// =============================================================================

/**
 * Enhance a prompt using LLM-driven analysis with timeout and fallback.
 *
 * This is the main entry point for V2 prompt enhancement. It:
 * 1. Performs initial semantic search
 * 2. Gathers context (file tree, memories, conversation history)
 * 3. Calls the secondary LLM to synthesize results
 * 4. Falls back to returning raw search results on timeout/error
 */
export async function enhancePromptWithLLM(
  userInput: string,
  characterId: string | null,
  options: LLMEnhancementOptions = {}
): Promise<LLMEnhancementResult> {
  const originalQuery = userInput.trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Base result for early returns
  const baseResult: LLMEnhancementResult = {
    enhanced: false,
    prompt: originalQuery,
    originalQuery,
    usedLLM: false,
  };

  // Basic validation
  if (!canEnhanceQuery(originalQuery)) {
    return {
      ...baseResult,
      skipReason: "Query is too short. Please enter at least 3 characters.",
    };
  }

  try {
    // Determine if we can do semantic search (requires characterId, vectorDB, and indexed files)
    const canDoSemanticSearch = characterId && isVectorDBEnabled() && await hasIndexedFiles(characterId);

    let searchResults: { hits: VectorSearchHit[]; filesFound: number } | null = null;
    let fileTree: Awaited<ReturnType<typeof getFileTreeForAgent>> = [];
    let memories: { markdown: string; tokenEstimate: number; memoryCount: number } = { markdown: "", tokenEstimate: 0, memoryCount: 0 };

    // Stage 1: Semantic search (only if we have context)
    if (canDoSemanticSearch) {
      console.log(`[PromptEnhancementV2] Starting semantic search for: "${originalQuery.slice(0, 50)}..."`);
      searchResults = await performInitialSearch(originalQuery, characterId);

      // Gather additional context for LLM
      [fileTree, memories] = await Promise.all([
        options.includeFileTree !== false
          ? getFileTreeForAgent(characterId, { maxEntries: 100, maxDepth: 3 })
          : Promise.resolve([]),
        Promise.resolve(
          options.includeMemories !== false
            ? formatMemoriesForPrompt(characterId)
            : { markdown: "", tokenEstimate: 0, memoryCount: 0 }
        ),
      ]);
    } else {
      console.log(`[PromptEnhancementV2] No agent context - using LLM-only enhancement`);
    }

    const fileTreeMarkdown = formatFileTreeCompact(fileTree);
    const searchResultsFormatted = searchResults ? formatSearchResultsForLLM(searchResults.hits) : "";
    const recentMessages = options.conversationContext?.slice(-3) || [];

    // Detect input type for format-aware enhancement
    const inputType = detectInputType(originalQuery);
    console.log(`[PromptEnhancementV2] Detected input type: ${inputType}`);

    // Build enhancement request (works with or without search results)
    const enhancementRequest = buildEnhancementRequest({
      originalQuery,
      searchResults: searchResultsFormatted || "No file context available - enhance the prompt based on clarity, specificity, and best practices.",
      fileTree: fileTreeMarkdown,
      recentMessages,
      memories: memories.markdown,
      inputType,
    });

    // Get session for this character (or use a generic session key)
    const session = getEnhancementSession(characterId || "__global__");

    // Stage 2: LLM refinement with timeout
    console.log(`[PromptEnhancementV2] Calling LLM with ${timeoutMs}ms timeout...`);

    const llmResult = await Promise.race([
      generateText({
        model: getUtilityModel(),
        system: ENHANCEMENT_SYSTEM_PROMPT,
        messages: [
          ...session.messages,
          { role: "user" as const, content: enhancementRequest },
        ],
        maxOutputTokens: 3000,
        temperature: getProviderTemperature(0.3),
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (llmResult === null) {
      console.warn(`[PromptEnhancementV2] LLM timed out after ${timeoutMs}ms`);
      // If we had search results, use fallback; otherwise return original
      if (searchResults && searchResults.hits.length > 0) {
        return {
          enhanced: true,
          prompt: buildFallbackPrompt(originalQuery, searchResults.hits),
          originalQuery,
          filesFound: searchResults.filesFound,
          chunksRetrieved: searchResults.hits.length,
          usedLLM: false,
          error: "Enhancement timed out, using simplified results",
        };
      }
      return {
        ...baseResult,
        skipReason: "Enhancement timed out",
        error: "LLM enhancement timed out",
      };
    }

    // Store messages in session for continuity
    const sessionKey = characterId || "__global__";
    addSessionMessage(sessionKey, { role: "user", content: enhancementRequest });
    addSessionMessage(sessionKey, { role: "assistant", content: llmResult.text });

    console.log(`[PromptEnhancementV2] LLM enhancement complete (${llmResult.text.length} chars)`);

    return {
      enhanced: true,
      prompt: llmResult.text,
      originalQuery,
      filesFound: searchResults?.filesFound ?? 0,
      chunksRetrieved: searchResults?.hits.length ?? 0,
      usedLLM: true,
    };
  } catch (error) {
    console.error("[PromptEnhancementV2] Error:", error);
    return {
      ...baseResult,
      skipReason: `Enhancement failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build a fallback prompt when LLM enhancement fails or times out
 */
function buildFallbackPrompt(query: string, hits: VectorSearchHit[]): string {
  const lines: string[] = [];
  lines.push(`**Query:** ${query}\n`);
  lines.push(`**Relevant Files Found:**\n`);

  const uniqueFiles = [...new Set(hits.map((h) => h.relativePath))];
  for (const file of uniqueFiles.slice(0, 10)) {
    lines.push(`- \`${file}\``);
  }

  lines.push(`\n**Context Snippets:**\n`);

  // Include top 3 snippets
  for (const hit of hits.slice(0, 3)) {
    const ext = extname(hit.relativePath).slice(1).toLowerCase();
    const isCode = ["ts", "tsx", "js", "jsx", "py", "sql"].includes(ext);
    lines.push(`From \`${hit.relativePath}\`:`);
    if (isCode) {
      lines.push("```" + ext);
      lines.push(hit.text.trim().slice(0, 500));
      lines.push("```");
    } else {
      lines.push(hit.text.trim().slice(0, 500));
    }
    lines.push("");
  }

  return lines.join("\n");
}

