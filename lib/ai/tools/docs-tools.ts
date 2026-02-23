import { tool, jsonSchema } from "ai";
import { searchAgentDocumentsForCharacter } from "@/lib/documents/embeddings";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { retrieveFullContent as getFullContent, listStoredContent } from "@/lib/ai/truncated-content-store";

// ==========================================================================
// Agent Docs Search Tool
// ==========================================================================

export interface DocsSearchToolOptions {
  /** Current authenticated user ID (owner of the agent and documents) */
  userId: string;
  /** Optional agent/character ID to scope the search. If missing, tool is disabled. */
  characterId?: string | null;
  /** Session ID for logging */
  sessionId?: string;
}

const docsSearchSchema = jsonSchema<{
  query: string;
  maxResults?: number;
  minSimilarity?: number;
}>({
  type: "object",
  title: "DocsSearchInput",
  description: "Input schema for searching agent documents and knowledge base",
  properties: {
    query: {
      type: "string",
      description:
        "Natural language query to search the agent's attached documents (PDF, text, Markdown, HTML). Use this to look up facts, policies, or domain knowledge.",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 20,
      default: 6,
      description:
        "Maximum number of passages to return (default: 6, max: 20).",
    },
    minSimilarity: {
      type: "number",
      minimum: 0,
      maximum: 1,
      default: 0.2,
      description:
        "Minimum cosine similarity threshold (0-1). Higher values return only very close matches.",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

// Args interface for docsSearch
interface DocsSearchArgs {
  query: string;
  maxResults?: number;
  minSimilarity?: number;
}

/**
 * Core docsSearch execution logic (extracted for logging wrapper)
 */
async function executeDocsSearch(
  options: DocsSearchToolOptions,
  args: DocsSearchArgs
) {
  const { userId, characterId } = options;
  const { query, maxResults, minSimilarity } = args;

  if (!characterId) {
    return {
      status: "no_agent",
      query,
      hits: [],
      message:
        "Docs Search is only available inside an agent chat. Ask the user to select or create an agent before searching its documents.",
    };
  }

  const hits = await searchAgentDocumentsForCharacter({
    userId,
    characterId,
    query,
    options: {
      topK: maxResults,
      minSimilarity,
    },
  });

  if (!hits.length) {
    return {
      status: "no_results",
      query,
      hits: [],
      message:
        "No relevant document passages were found for this query in this agent's knowledge base.",
    };
  }

  const results = hits.map((hit) => ({
    documentId: hit.documentId,
    chunkId: hit.chunkId,
    chunkIndex: hit.chunkIndex,
    similarity: hit.similarity,
    text: hit.text,
    source: {
      originalFilename: hit.originalFilename,
      title: hit.title,
      description: hit.description,
      tags: hit.tags,
    },
  }));

  return {
    status: "success",
    query,
    hitCount: results.length,
    hits: results,
  };
}

export function createDocsSearchTool(options: DocsSearchToolOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "docsSearch",
    sessionId,
    (args: DocsSearchArgs) => executeDocsSearch(options, args)
  );

  return tool({
    description:
      "Search this agent's attached documents (PDF, text, Markdown, HTML) for relevant passages. Use this whenever you need authoritative information from the user's knowledge base.",
    inputSchema: docsSearchSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// Retrieve Full Content Tool
// ==========================================================================
// This tool allows the AI to retrieve full untruncated content when text
// was truncated for token efficiency. The full content is stored in the
// session and can be retrieved using the reference ID.

const retrieveFullContentSchema = jsonSchema<{
  contentId: string;
}>({
  type: "object",
  title: "RetrieveFullContentInput",
  description: "Input schema for retrieving full untruncated content",
  properties: {
    contentId: {
      type: "string",
      description:
        "The reference ID of the truncated content to retrieve (format: trunc_XXXXXXXX). This ID is provided in truncation notices.",
    },
  },
  required: ["contentId"],
  additionalProperties: false,
});

export interface RetrieveFullContentToolOptions {
  /** Current session ID for retrieving content */
  sessionId: string;
}

interface RetrieveFullContentArgs {
  contentId: string;
}

/**
 * Core retrieveFullContent execution logic
 */
async function executeRetrieveFullContent(
  options: RetrieveFullContentToolOptions,
  args: RetrieveFullContentArgs
) {
  const { sessionId } = options;
  const { contentId } = args;

  // Retrieve the full content
  const entry = getFullContent(sessionId, contentId);

  if (!entry) {
    // Check if there's any stored content for debugging
    const storedContent = listStoredContent(sessionId);

    return {
      status: "not_found",
      contentId,
      message: `Content with ID "${contentId}" was not found. It may have expired (TTL: 1 hour) or the ID is incorrect.`,
      availableContentIds: storedContent.map(c => ({
        id: c.id,
        context: c.context,
        fullLength: c.fullLength,
      })),
    };
  }

  return {
    status: "success",
    contentId: entry.id,
    context: entry.context,
    fullLength: entry.fullLength,
    truncatedLength: entry.truncatedLength,
    fullContent: entry.fullContent,
    message: `Successfully retrieved full content (${entry.fullLength.toLocaleString()} characters). The content was originally truncated to ${entry.truncatedLength.toLocaleString()} characters.`,
  };
}

export function createRetrieveFullContentTool(options: RetrieveFullContentToolOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "retrieveFullContent",
    sessionId,
    (args: RetrieveFullContentArgs) => executeRetrieveFullContent(options, args)
  );

  return tool({
    description: `**⚠️ ONLY for truncated content, NOT for file reading!**

This retrieves content that was previously TRUNCATED in a tool response.

**When to use:**
- You see "Content truncated. Reference ID: trunc_XXXXXXXX" in a previous tool result
- You need the full content that was cut off

**When NOT to use (WRONG):**
- ❌ Reading file contents (use readFile instead)
- ❌ Getting full file paths (use localGrep or vectorSearch)
- ❌ Any contentId that doesn't start with "trunc_"

**Parameter:** contentId must be exactly like "trunc_ABC123" from a truncation notice.`,
    inputSchema: retrieveFullContentSchema,
    execute: executeWithLogging,
  });
}
