/**
 * Read File Tool
 *
 * A standalone AI tool for reading file content from:
 * 1. Knowledge Base documents (uploaded PDFs, text, Markdown, HTML)
 * 2. Synced folder files (indexed for vector search)
 *
 * Extracted from tool.ts to keep the main tool file focused on vector search.
 */

import { tool, jsonSchema } from "ai";
import { getSyncFolders } from "@/lib/vectordb";
import { readFile } from "fs/promises";
import { extname, basename } from "path";
import { findAgentDocumentByName, getAgentDocumentChunksByDocumentId } from "@/lib/db/queries";
import { isPathAllowed, findSimilarFiles, recordFileRead } from "@/lib/ai/filesystem";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// File read limits
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_LINE_COUNT = 5000;
const MAX_LINE_WIDTH = 2000;

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
  sessionId: string | null | undefined,
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
  const validPath = await isPathAllowed(filePath, allowedFolderPaths);
  if (!validPath) {
    // Try to suggest similar files
    const suggestions = await findSimilarFiles(characterId, filePath);
    const suggestionText = suggestions.length > 0
      ? ` Did you mean: ${suggestions.map(s => `"${s}"`).join(", ")}?`
      : "";

    return {
      status: "error" as const,
      error: `File not found in Knowledge Base or synced folders. Tried matching "${filePath}" against KB documents and synced folder paths.${suggestionText}`,
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
      .map((line, idx) => {
        const lineNum = `${String(actualStartLine + idx).padStart(4, " ")} | `;
        const truncatedLine = line.length > MAX_LINE_WIDTH
          ? line.slice(0, MAX_LINE_WIDTH) + `... [${line.length - MAX_LINE_WIDTH} chars truncated]`
          : line;
        return lineNum + truncatedLine;
      })
      .join("\n");

    const truncated = selectedLines.length < lines.length;

    // Record read time for stale detection by editFile/writeFile
    if (sessionId) {
      recordFileRead(sessionId, validPath);
    }

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
      executeReadFile(characterId, sessionId, args)
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
