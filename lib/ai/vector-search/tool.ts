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
import { extname, basename, dirname } from "path";

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
  const { sessionId, characterId } = options;

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

  // Get session for this character
  const session = getVectorSearchSession(characterId);
  const searchHistory = getSearchHistory(characterId, 3);

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
    addSearchHistory(characterId, {
      query,
      strategy: "semantic",
      resultsCount: 0,
    });

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
    addSearchHistory(characterId, {
      query,
      strategy: "semantic",
      resultsCount: rawHits.length,
    });

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
    allowedFolderPaths,
    fileTreeSummary,
  });

  if (!synthesisResult.success) {
    // Fallback: return basic results without synthesis
    console.warn("[VectorSearchV2] Synthesis failed, returning raw results");

    addSearchHistory(characterId, {
      query,
      strategy: "semantic",
      resultsCount: rawHits.length,
    });

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
  addSearchHistory(characterId, {
    query,
    strategy: synthesisResult.strategy,
    resultsCount: synthesisResult.findings.length,
  });

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
  const { characterId } = options;

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

      const searchHistory = getSearchHistory(characterId, 5);

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

// ============================================================================
// Read File Tool - Reads from synced folders AND Knowledge Base documents
// ============================================================================

import { readFile } from "fs/promises";
import { resolve, join } from "path";
import { findAgentDocumentByName, getAgentDocumentChunksByDocumentId } from "@/lib/db/queries";

// File read limits
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_LINE_COUNT = 5000;

// Schema for readFile tool
const readFileSchema = jsonSchema<{
  filePath: string;
  startLine?: number;
  endLine?: number;
}>({
  type: "object",
  title: "ReadFileInput",
  description: "Input schema for reading files from synced folders or knowledge base",
  properties: {
    filePath: {
      type: "string",
      description: "File path or document name to read. Can be: (1) Knowledge Base document filename or title, (2) relative path from synced folder, or (3) absolute path within synced folders",
    },
    startLine: {
      type: "number",
      description: "Start line number (1-indexed, optional)",
    },
    endLine: {
      type: "number",
      description: "End line number (1-indexed, optional)",
    },
  },
  required: ["filePath"],
  additionalProperties: false,
});

/**
 * Validate that a file path is within allowed folders (security check)
 *
 * Handles both:
 * 1. Absolute paths - checks if within any allowed folder
 * 2. Relative paths - tries resolving relative to each allowed folder
 */
function isPathAllowed(filePath: string, allowedFolderPaths: string[]): string | null {
  const { isAbsolute, join, normalize, sep } = require("path");

  // Case 1: Path is already absolute
  if (isAbsolute(filePath)) {
    const normalizedPath = normalize(filePath);
    for (const allowedPath of allowedFolderPaths) {
      const resolvedAllowed = resolve(allowedPath);
      // Use platform-specific path separator for Windows compatibility
      if (normalizedPath.startsWith(resolvedAllowed + sep) || normalizedPath === resolvedAllowed) {
        return normalizedPath;
      }
    }
    return null;
  }

  // Case 2: Relative path - try resolving relative to each allowed folder
  for (const allowedPath of allowedFolderPaths) {
    const resolvedAllowed = resolve(allowedPath);
    const candidatePath = normalize(join(resolvedAllowed, filePath));

    // Security: Ensure the resolved path is still within the allowed folder
    // (prevents path traversal attacks like "../../../etc/passwd")
    // Use platform-specific path separator for Windows compatibility
    if (candidatePath.startsWith(resolvedAllowed + sep) || candidatePath === resolvedAllowed) {
      return candidatePath;
    }
  }

  return null;
}

/**
 * Get code language for syntax highlighting
 */
function getCodeLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", md: "markdown", json: "json", html: "html",
    css: "css", sql: "sql", yaml: "yaml", yml: "yaml", sh: "bash", bash: "bash",
  };
  return langMap[ext] || ext || "text";
}

export interface ReadFileToolOptions {
  sessionId: string;
  userId: string;
  characterId?: string | null;
}

// Result type for readFile tool
interface ReadFileResult {
  status: "success" | "error";
  filePath?: string;
  language?: string;
  lineRange?: string;
  totalLines?: number;
  content?: string;
  truncated?: boolean;
  message?: string;
  error?: string;
  allowedFolders?: string[];
  source?: "synced_folder" | "knowledge_base"; // Indicates where the file was read from
  documentTitle?: string; // For KB documents, the document title if available
}

/**
 * Try to read a file from Knowledge Base documents.
 *
 * For Knowledge Base documents (especially PDFs), we read the extracted text
 * from the document chunks stored in the database, NOT the raw file bytes.
 * This ensures we return human-readable text that was parsed during upload.
 *
 * Returns the file content if found, null otherwise.
 */
async function tryReadFromKnowledgeBase(
  characterId: string,
  filePath: string,
  startLine?: number,
  endLine?: number
): Promise<ReadFileResult | null> {
  try {
    // Try to find a matching KB document
    const document = await findAgentDocumentByName(characterId, filePath);

    if (!document) {
      return null;
    }

    // Fetch the parsed text chunks from the database
    // These chunks contain the extracted text from PDFs, not raw binary data
    const chunks = await getAgentDocumentChunksByDocumentId(document.id, document.userId);

    if (!chunks.length) {
      console.log(`[ReadFile] KB document "${filePath}" has no text chunks - may not have been processed yet`);
      return null;
    }

    // Combine all chunks into a single text content
    // Chunks are ordered by chunkIndex, so we just join them
    const content = chunks.map(chunk => chunk.text).join("\n\n---\n\n");
    const lines = content.split("\n");

    // Check file size
    if (content.length > MAX_FILE_SIZE_BYTES) {
      return {
        status: "error" as const,
        error: `Document content too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_FILE_SIZE_BYTES / 1024}KB. Try reading a specific line range.`,
        source: "knowledge_base",
      };
    }

    // Apply line range if specified
    let selectedLines = lines;
    let actualStartLine = 1;
    let actualEndLine = lines.length;

    if (startLine !== undefined || endLine !== undefined) {
      actualStartLine = Math.max(1, startLine ?? 1);
      actualEndLine = Math.min(lines.length, endLine ?? lines.length);

      if (actualEndLine - actualStartLine + 1 > MAX_LINE_COUNT) {
        actualEndLine = actualStartLine + MAX_LINE_COUNT - 1;
      }

      selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
    } else if (lines.length > MAX_LINE_COUNT) {
      selectedLines = lines.slice(0, MAX_LINE_COUNT);
      actualEndLine = MAX_LINE_COUNT;
    }

    // Format with line numbers
    const lang = getCodeLanguage(document.originalFilename);
    const formattedContent = selectedLines
      .map((line, idx) => `${String(actualStartLine + idx).padStart(4, " ")} | ${line}`)
      .join("\n");

    const truncated = selectedLines.length < lines.length;
    const displayName = document.title || document.originalFilename;

    return {
      status: "success" as const,
      filePath: document.originalFilename,
      language: lang,
      lineRange: `${actualStartLine}-${actualEndLine}`,
      totalLines: lines.length,
      content: formattedContent,
      truncated,
      message: truncated
        ? `Showing lines ${actualStartLine}-${actualEndLine} of ${lines.length} total lines from Knowledge Base document "${displayName}" (${chunks.length} chunks)`
        : `Read ${lines.length} lines from Knowledge Base document "${displayName}" (${chunks.length} chunks)`,
      source: "knowledge_base",
      documentTitle: document.title || undefined,
    };
  } catch (error) {
    // Document not found or query error - return null to fall through to synced folders
    console.log(`[ReadFile] KB document read failed for "${filePath}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Core readFile execution logic (extracted for logging wrapper)
 *
 * Supports reading from two sources:
 * 1. Knowledge Base documents - uploaded documents with embeddings
 * 2. Synced folders - file system folders indexed for vector search
 *
 * The tool first tries to find a matching Knowledge Base document,
 * then falls back to synced folders if not found.
 */
async function executeReadFile(
  characterId: string | null | undefined,
  args: { filePath: string; startLine?: number; endLine?: number }
): Promise<ReadFileResult> {
  const { filePath, startLine, endLine } = args;

  if (!characterId) {
    return {
      status: "error" as const,
      error: "Read File requires an agent context. Select or create an agent first.",
    };
  }

  // STEP 1: Try to read from Knowledge Base documents first
  // This allows users to reference KB documents by their filename or title
  const kbResult = await tryReadFromKnowledgeBase(characterId, filePath, startLine, endLine);
  if (kbResult) {
    console.log(`[ReadFile] Found document in Knowledge Base: "${filePath}"`);
    return kbResult;
  }

  // STEP 2: Fall back to synced folders
  // Get allowed folder paths for this character
  const syncedFolders = await getSyncFolders(characterId);
  const allowedFolderPaths = syncedFolders.map(f => f.folderPath);

  // Check if we have any sources available
  if (allowedFolderPaths.length === 0) {
    return {
      status: "error" as const,
      error: "No matching documents found. This agent has no synced folders configured and no Knowledge Base document matches this filename. Upload documents to the Knowledge Base or add synced folders in agent settings.",
    };
  }

  // Security: Check if path is allowed
  const validPath = isPathAllowed(filePath, allowedFolderPaths);
  if (!validPath) {
    return {
      status: "error" as const,
      error: `File not found in Knowledge Base or synced folders. Tried matching "${filePath}" against KB documents and synced folder paths.`,
      allowedFolders: allowedFolderPaths,
    };
  }

  // Read file from synced folder
  try {
    const content = await readFile(validPath, "utf-8");
    const lines = content.split("\n");

    // Check file size
    if (content.length > MAX_FILE_SIZE_BYTES) {
      return {
        status: "error" as const,
        error: `File too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_FILE_SIZE_BYTES / 1024}KB. Try reading a specific line range.`,
        source: "synced_folder",
      };
    }

    // Apply line range if specified
    let selectedLines = lines;
    let actualStartLine = 1;
    let actualEndLine = lines.length;

    if (startLine !== undefined || endLine !== undefined) {
      actualStartLine = Math.max(1, startLine ?? 1);
      actualEndLine = Math.min(lines.length, endLine ?? lines.length);

      if (actualEndLine - actualStartLine + 1 > MAX_LINE_COUNT) {
        actualEndLine = actualStartLine + MAX_LINE_COUNT - 1;
      }

      selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
    } else if (lines.length > MAX_LINE_COUNT) {
      selectedLines = lines.slice(0, MAX_LINE_COUNT);
      actualEndLine = MAX_LINE_COUNT;
    }

    // Format with line numbers
    const lang = getCodeLanguage(filePath);
    const formattedContent = selectedLines
      .map((line, idx) => `${String(actualStartLine + idx).padStart(4, " ")} | ${line}`)
      .join("\n");

    const truncated = selectedLines.length < lines.length;

    return {
      status: "success" as const,
      filePath,
      language: lang,
      lineRange: `${actualStartLine}-${actualEndLine}`,
      totalLines: lines.length,
      content: formattedContent,
      truncated,
      message: truncated
        ? `Showing lines ${actualStartLine}-${actualEndLine} of ${lines.length} total lines`
        : `Read ${lines.length} lines from ${basename(filePath)}`,
      source: "synced_folder",
    };
  } catch (error) {
    return {
      status: "error" as const,
      error: `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Create a standalone read file tool for agents to read from:
 * 1. Knowledge Base documents (uploaded PDFs, text, Markdown, HTML)
 * 2. Synced folder files (indexed for vector search)
 */
export function createReadFileTool(options: ReadFileToolOptions) {
  const { sessionId, characterId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "readFile",
    sessionId,
    (args: { filePath: string; startLine?: number; endLine?: number }) =>
      executeReadFile(characterId, args)
  );

  return tool({
    description: `Read full file content or a specific line range from Knowledge Base documents or synced folders.

**Supported Sources:**
1. **Knowledge Base documents** - Uploaded PDFs, text, Markdown, HTML files. Reference by filename (e.g., "report.pdf") or title.
2. **Synced folder files** - Files from indexed folders. Use paths from vectorSearch results.

**When to use:**
- After docsSearch finds relevant passages, read the full document for complete context
- After vectorSearch finds code snippets, read complete files for deeper understanding
- When you need to reference a specific document the user mentioned
- To follow imports, exports, or code relationships between files

**Parameters:**
- filePath: Document name or file path (tries Knowledge Base first, then synced folders)
- startLine (optional): Start line (1-indexed)
- endLine (optional): End line (1-indexed)

**Returns:** File content with line numbers, language detection, source indicator, and truncation info.`,

    inputSchema: readFileSchema,

    execute: executeWithLogging,
  });
}
