/**
 * Vector Search Tool V2 - LLM-Powered Intelligent Search
 *
 * AI tool that performs semantic search and synthesizes results using a secondary LLM.
 * Replaces direct vector DB queries with intelligent analysis and organization.
 *
 * Features:
 * - Semantic search over indexed folders
 * - LLM-driven result synthesis and explanation
 * - Search history for contextual refinement
 * - Organized findings with confidence scores
 */

import { tool, jsonSchema } from "ai";
import { searchWithRouter, type VectorSearchHit, getSyncFolders } from "@/lib/vectordb";
import { isVectorDBEnabled } from "@/lib/vectordb/client";
import { getVectorSearchSession, addSearchHistory, getSearchHistory } from "./session-store";
import { synthesizeSearchResults } from "./synthesizer";
import { getFileTreeSummaryForSearch } from "./file-tree-cache";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import type {
  VectorSearchOptions,
  VectorSearchResult,
  VectorSearchEvent,
  VectorSearchEventEmitter,
  VectorSearchPhase,
  RawSearchResult,
} from "./types";
import { extname } from "path";

// Re-export the readFile tool for backward compatibility
export type { ReadFileToolOptions } from "./read-file-tool";
export { createReadFileTool } from "./read-file-tool";

// ============================================================================
// Input Schema
// ============================================================================

const vectorSearchSchema = jsonSchema<{
  query: string;
  maxResults?: number;
  minScore?: number;
  folderIds?: string[];
}>({
  type: "object",
  title: "VectorSearchInput",
  description: "Input schema for vector-based codebase search",
  properties: {
    query: {
      type: "string",
      description: "Natural language query to search the codebase. Be descriptive for best results.",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 150,
      default: 50,
      description: "Maximum number of results to return (default: 50, may increase up to 150 when you need broader coverage)",
    },
    minScore: {
      type: "number",
      minimum: 0,
      maximum: 1,
      default: 0.1,
      description: "Minimum similarity score threshold (0-1, default: 0.1)",
    },
    folderIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional: Limit search to specific synced folder IDs",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

// ============================================================================
// Helper Functions
// ============================================================================

function emitPhaseChange(
  emit: VectorSearchEventEmitter,
  phase: VectorSearchPhase,
  message: string
): void {
  emit({
    type: "phase_change",
    phase,
    message,
    timestamp: new Date(),
  });
}

/**
 * Detect the type of content based on file extension
 */
function getFileType(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const typeMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    py: "Python",
    md: "Markdown",
    txt: "Text",
    json: "JSON",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    yaml: "YAML",
    yml: "YAML",
    sh: "Shell",
    bash: "Shell",
  };
  return typeMap[ext] || ext.toUpperCase() || "Unknown";
}

/**
 * Convert VectorSearchHit to RawSearchResult
 */
function toRawSearchResult(hit: VectorSearchHit): RawSearchResult {
  return {
    text: hit.text,
    relativePath: hit.relativePath,
    chunkIndex: hit.chunkIndex,
    score: hit.score ?? 0,
    startLine: hit.startLine,
    endLine: hit.endLine,
  };
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Core vector search execution logic (extracted for logging wrapper)
 */
async function executeVectorSearch(
  options: VectorSearchOptions,
  args: { query: string; maxResults?: number; minScore?: number; folderIds?: string[] }
): Promise<VectorSearchResult> {
  const { sessionId, characterId, sessionMetadata } = options;

  if (!sessionId) {
    throw new Error("Vector search tool requires a sessionId");
  }

  const vectorSessionKey = `vector:${sessionId}`;

  // Input normalization: Handle common AI parameter mistakes
  // Similar to ripgrep tool pattern for robustness
  const rawArgs = args as unknown as Record<string, unknown>;

  // Normalize query: AI might use "search" or "searchQuery" instead of "query"
  const query = String(
    args.query || rawArgs.search || rawArgs.searchQuery || rawArgs.pattern || ""
  ).trim();

  // Normalize maxResults
  const requestedMaxResults = Number(args.maxResults || rawArgs.limit || rawArgs.topK) || 50;
  const maxResults = Math.max(1, Math.min(requestedMaxResults, 150));

  // Normalize minScore
  const minScore = Number(args.minScore || rawArgs.threshold || rawArgs.minSimilarity) || 0.1;

  // Normalize folderIds: Handle JSON-string arrays (AI sometimes stringifies arrays)
  let folderIds: string[] | undefined;
  const rawFolderIds = args.folderIds ?? rawArgs.folders ?? rawArgs.folderPaths;

  if (rawFolderIds) {
    if (Array.isArray(rawFolderIds)) {
      folderIds = rawFolderIds.map(String);
    } else if (typeof rawFolderIds === "string") {
      // Try JSON parse for stringified arrays
      if (rawFolderIds.startsWith("[")) {
        try {
          const parsed = JSON.parse(rawFolderIds);
          if (Array.isArray(parsed)) {
            folderIds = parsed.map(String);
          }
        } catch {
          // Single folder ID
          folderIds = [rawFolderIds];
        }
      } else {
        folderIds = [rawFolderIds];
      }
    }
  }

  const emptyResult: VectorSearchResult = {
    status: "no_results",
    strategy: "semantic",
    reasoning: "",
    findings: [],
    summary: "",
  };

  // Validate query
  if (!query) {
    return {
      ...emptyResult,
      status: "error" as const,
      message: "Missing or empty query. Usage: vectorSearch({ query: \"your search terms\" })",
    };
  }

  // Check if VectorDB is enabled
  if (!isVectorDBEnabled()) {
    return {
      ...emptyResult,
      status: "disabled",
      message:
        "Vector search is not enabled because VectorDB is disabled.\n\n" +
        "However, you can still access synced folders using:\n" +
        "• localGrep - Fast pattern matching and exact text search\n" +
        "• readFile - Direct file access by path\n\n" +
        "To enable semantic search, configure embeddings in Settings.",
    };
  }

  // Check if we have an agent context
  if (!characterId) {
    return {
      ...emptyResult,
      status: "no_agent",
      message: "Vector Search requires an agent context. Select or create an agent to search its synced folders.",
    };
  }

  // Get session scoped to current chat session to prevent cross-chat bleed.
  const session = getVectorSearchSession(vectorSessionKey, characterId);
  const searchHistory = getSearchHistory(vectorSessionKey, 3);

  console.log(`[VectorSearchV2] Searching for: "${query.slice(0, 50)}..." (session: ${session.id})`);

  // Execute vector search
  const rawHits: VectorSearchHit[] = await searchWithRouter({
    characterId,
    query,
    options: {
      topK: maxResults,
      minScore,
      folderIds,
    },
  });

  if (rawHits.length === 0) {
    // Add to history even if no results
    addSearchHistory(
      vectorSessionKey,
      {
        query,
        strategy: "semantic",
        resultsCount: 0,
      },
      characterId
    );

    // Check if user has folders but they might be in files-only mode
    const folders = await getSyncFolders(characterId);
    const hasFilesOnlyFolders = folders.some(f => f.indexingMode === "files-only");
    const hasAutoFoldersWithoutEmbeddings = folders.some(
      f => f.indexingMode === "auto" && !f.embeddingModel
    );

    let message = "No matching documents found. Try rephrasing or using different keywords.";

    if (hasFilesOnlyFolders || hasAutoFoldersWithoutEmbeddings) {
      message =
        "No embeddings found in synced folders. Some folders are in files-only mode.\n\n" +
        "You can still access these folders using:\n" +
        "• localGrep - Fast pattern matching\n" +
        "• readFile - Direct file access\n\n" +
        "To enable semantic search, switch folders to 'full' mode in the folder manager.";
    }

    return {
      ...emptyResult,
      message,
    };
  }

  // Convert to raw results for synthesis
  const rawResults: RawSearchResult[] = rawHits.map(toRawSearchResult);

  const config = getVectorSearchConfig();

  if (!config.enableLLMSynthesis) {
    addSearchHistory(
      vectorSessionKey,
      {
        query,
        strategy: "semantic",
        resultsCount: rawHits.length,
      },
      characterId
    );

    const fileGroups = new Map<string, typeof rawHits>();
    for (const hit of rawHits) {
      const existing = fileGroups.get(hit.relativePath) || [];
      existing.push(hit);
      fileGroups.set(hit.relativePath, existing);
    }

    const findings = Array.from(fileGroups.entries()).map(([filePath, hits]) => ({
      filePath,
      snippet: hits[0].text.slice(0, 800),
      explanation: `Found ${hits.length} matching section(s)`,
      confidence: hits[0].score ?? 0.5,
    }));

    return {
      status: "success",
      strategy: "semantic",
      reasoning: "Direct search (LLM synthesis disabled)",
      findings,
      summary: `Found ${rawHits.length} results across ${fileGroups.size} files.`,
      stats: {
        totalChunks: rawHits.length,
        totalFiles: fileGroups.size,
        fileTypes: [...new Set(Array.from(fileGroups.keys()).map(getFileType))],
      },
    };
  }

  // Get synced folder paths for the readFile tool
  const syncedFolders = await getSyncFolders(characterId);
  const allowedFolderPaths = syncedFolders.map(f => f.folderPath);
  const fileTreeSummary = await getFileTreeSummaryForSearch(characterId);

  // Synthesize results using secondary LLM
  const synthesisResult = await synthesizeSearchResults({
    sessionId,
    characterId,
    query,
    rawResults,
    searchHistory,
    sessionMetadata,
    allowedFolderPaths,
    fileTreeSummary,
  });

  if (!synthesisResult.success) {
    // Fallback: return basic results without synthesis
    console.warn("[VectorSearchV2] Synthesis failed, returning raw results");

    addSearchHistory(
      vectorSessionKey,
      {
        query,
        strategy: "semantic",
        resultsCount: rawHits.length,
      },
      characterId
    );

    // Group raw results by file for basic presentation
    const fileGroups = new Map<string, typeof rawHits>();
    for (const hit of rawHits) {
      const existing = fileGroups.get(hit.relativePath) || [];
      existing.push(hit);
      fileGroups.set(hit.relativePath, existing);
    }

    const findings = Array.from(fileGroups.entries()).map(([filePath, hits]) => ({
      filePath,
      snippet: hits[0].text.slice(0, 800),
      explanation: `Found ${hits.length} matching section(s)`,
      confidence: hits[0].score ?? 0.5,
    }));

    return {
      status: "success",
      strategy: "semantic",
      reasoning: "Direct search (synthesis unavailable)",
      findings,
      summary: `Found ${rawHits.length} results across ${fileGroups.size} files.`,
      stats: {
        totalChunks: rawHits.length,
        totalFiles: fileGroups.size,
        fileTypes: [...new Set(Array.from(fileGroups.keys()).map(getFileType))],
      },
      message: synthesisResult.error,
    };
  }

  // Add to search history
  addSearchHistory(
    vectorSessionKey,
    {
      query,
      strategy: synthesisResult.strategy,
      resultsCount: synthesisResult.findings.length,
    },
    characterId
  );

  // Collect unique file types from findings
  const fileTypes = [...new Set(
    synthesisResult.findings.map(f => getFileType(f.filePath))
  )];

  return {
    status: "success",
    strategy: synthesisResult.strategy,
    reasoning: synthesisResult.reasoning,
    findings: synthesisResult.findings,
    summary: synthesisResult.summary,
    // suggestedRefinements intentionally omitted to prevent LLM looping
    stats: {
      totalChunks: rawHits.length,
      totalFiles: new Set(rawHits.map(h => h.relativePath)).size,
      fileTypes,
    },
    message: `Found ${synthesisResult.findings.length} relevant findings. ${synthesisResult.summary}`,
  };
}

/**
 * Create the LLM-powered vector search tool
 */
export function createVectorSearchToolV2(options: VectorSearchOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "vectorSearch",
    sessionId,
    (args: { query: string; maxResults?: number; minScore?: number; folderIds?: string[] }) =>
      executeVectorSearch(options, args)
  );

  return tool({
    description: `Intelligent semantic + keyword hybrid search across your indexed codebase folders.

**Question-first queries (required):**
- Always format \`query\` as a short, precise question containing the important keywords (e.g., "Where is habit reminders cron completed today timezone handled?").
- Ask for flows, handlers, files, or explanations rather than listing single words or comma-separated terms.
- You may run multiple question-form searches to cover different angles, but limit yourself to 5 per user request and stop once you have the needed context.

**How to craft effective question queries:**
- **Exact file/folder names:** "Which file defines generate-lesson-with-audio index.ts?"
- **Function/class names:** "Where is the searchVectorDB function implemented?"
- **Code patterns:** "How does the Deno.serve async request handler work for uploads?"
- **Semantic concepts:** "Why does the retry logic for failed audio generation run 3 times?"
- **Error messages:** "Where is the \"4096 character limit string too long\" error thrown?"
- **Combined terms:** "Show me how the supabase edge function handles audio generation TTS."

**Query tips:**
- Keep each question <= 1–2 sentences, including concrete identifiers.
- Prefer multi-term questions over generic prompts.
- Technical phrases are encouraged (e.g., "OpenAI TTS stream", "Deno.serve POST", "maxRetries loop").
- Avoid bare keywords or vague phrases like "database issue".
- Default \`maxResults\` is 50. Increase it (up to 150) only when you explicitly need broader coverage for the secondary LLM.

**Capabilities:**
- Hybrid search: semantic understanding + keyword matching
- AI-powered result synthesis with explanations
- Organized findings with confidence scores

**Example queries:**
- "Where is the generate-lesson-with-audio edge function defined?"
- "How does client.audio.speech.create call the TTS API?"
- "Where is the retry 3 times after failure logic for audio generation?"
- "Which file builds the prompts table for lesson audio script generation?"

**Returns:** Organized findings with file locations, explanations, and confidence scores.`,

    inputSchema: vectorSearchSchema,

    execute: executeWithLogging,
  });
}

/**
 * Create a basic query tool for follow-up searches using existing context
 */
export function createVectorQueryTool(options: VectorSearchOptions) {
  const { sessionId, characterId } = options;

  if (!sessionId) {
    throw new Error("Vector query tool requires a sessionId");
  }

  const vectorSessionKey = `vector:${sessionId}`;

  return tool({
    description: `Quick follow-up search using existing search context.

Use this when:
- You want to refine a previous search
- You're exploring related concepts from prior results
- You need to search with context from the conversation

Note: Requires prior vectorSearch calls in this session.`,

    inputSchema: jsonSchema<{
      query: string;
      maxResults?: number;
    }>({
      type: "object",
      title: "FollowUpSearchInput",
      description: "Input schema for follow-up vector search queries",
      properties: {
        query: {
          type: "string",
          description: "Follow-up query building on previous search context",
        },
        maxResults: {
          type: "number",
          minimum: 1,
          maximum: 20,
          default: 10,
          description: "Maximum number of results to return",
        },
      },
      required: ["query"],
      additionalProperties: false,
    }),

    execute: async ({ query, maxResults }) => {
      if (!characterId) {
        return {
          status: "no_agent",
          message: "Requires an agent context",
          findings: [],
        };
      }

      const searchHistory = getSearchHistory(vectorSessionKey, 5);

      if (searchHistory.length === 0) {
        return {
          status: "no_context",
          message: "No prior searches found. Use vectorSearch first.",
          findings: [],
        };
      }

      // Delegate to the main search with context
      const mainTool = createVectorSearchToolV2(options);
      if (!mainTool.execute) {
        return {
          status: "error" as const,
          strategy: "semantic" as const,
          reasoning: "",
          findings: [],
          summary: "",
          error: "Failed to create search tool",
        };
      }
      return mainTool.execute({ query, maxResults, minScore: 0.25 }, {} as never);
    },
  });
}
