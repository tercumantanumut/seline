/**
 * Read File Tool
 *
 * AI tool for reading file content from Synced Folders or Knowledge Base.
 * Enhanced with:
 * - Binary file detection (prevents dumping binary garbage)
 * - Head/Tail support for reading large files
 * - Line range support
 * - Knowledge Base integration
 */

import { tool, jsonSchema } from "ai";
import { readFile, open } from "fs/promises";
import { basename, extname } from "path";
import {
  isPathAllowed,
  resolveSyncedFolderPaths,
  recordFileRead,
  findSimilarFiles,
} from "@/lib/ai/filesystem";
import { findAgentDocumentByName, getAgentDocumentChunksByDocumentId } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_LINE_COUNT = 5000;
const MAX_LINE_WIDTH = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadFileToolOptions {
  sessionId: string;
  characterId?: string | null;
  userId: string;
}

interface ReadFileInput {
  filePath: string;
  startLine?: number;
  endLine?: number;
  head?: number;
  tail?: number;
}

interface ReadFileResult {
  status: "success" | "error";
  filePath?: string;
  language?: string;
  lineRange?: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  content?: string;
  truncated?: boolean;
  message?: string;
  error?: string;
  source?: "synced_folder" | "knowledge_base";
  documentTitle?: string;
  allowedFolders?: string[];
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const readFileSchema = jsonSchema<ReadFileInput>({
  type: "object",
  title: "ReadFileInput",
  description: "Input schema for reading files from synced folders or knowledge base",
  properties: {
    filePath: {
      type: "string",
      description:
        "File path or document name to read. Can be: (1) Knowledge Base document filename or title, (2) relative path from synced folder, or (3) absolute path within synced folders",
    },
    startLine: {
      type: "number",
      description: "Start line number (1-indexed, optional)",
    },
    endLine: {
      type: "number",
      description: "End line number (1-indexed, optional)",
    },
    head: {
      type: "number",
      description: "Read the first N lines of the file (optional)",
    },
    tail: {
      type: "number",
      description: "Read the last N lines of the file (optional)",
    },
  },
  required: ["filePath"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCodeLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  return langMap[ext] || ext || "text";
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await fileHandle.read(buffer, 0, 1024, 0);
    
    // Check for null bytes in the first chunk
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false; // Assume text if we can't read (or let readFile handle error)
  } finally {
    await fileHandle?.close();
  }
}

// ---------------------------------------------------------------------------
// Knowledge Base Logic
// ---------------------------------------------------------------------------

async function tryReadFromKnowledgeBase(
  characterId: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
  head?: number,
  tail?: number
): Promise<ReadFileResult | null> {
  try {
    const document = await findAgentDocumentByName(characterId, filePath);

    if (!document) {
      return null;
    }

    const chunks = await getAgentDocumentChunksByDocumentId(document.id, document.userId);

    if (!chunks.length) {
      return null;
    }

    const content = chunks.map((chunk) => chunk.text).join("\n\n---\n\n");
    const lines = content.split("\n");

    // Apply Logic
    let selectedLines = lines;
    let actualStartLine = 1;
    let actualEndLine = lines.length;

    if (head) {
      actualEndLine = Math.min(lines.length, head);
      selectedLines = lines.slice(0, actualEndLine);
    } else if (tail) {
      actualStartLine = Math.max(1, lines.length - tail + 1);
      selectedLines = lines.slice(actualStartLine - 1);
    } else if (startLine !== undefined || endLine !== undefined) {
      actualStartLine = Math.max(1, startLine ?? 1);
      actualEndLine = Math.min(lines.length, endLine ?? lines.length);
      selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
    } else if (lines.length > MAX_LINE_COUNT) {
      selectedLines = lines.slice(0, MAX_LINE_COUNT);
      actualEndLine = MAX_LINE_COUNT;
    }

    // Format
    const lang = getCodeLanguage(document.originalFilename);
    const formattedContent = selectedLines
      .map((line, idx) => `${String(actualStartLine + idx).padStart(4, " ")} | ${line}`)
      .join("\n");

    const truncated = selectedLines.length < lines.length;
    const displayName = document.title || document.originalFilename;

    return {
      status: "success",
      filePath: document.originalFilename,
      language: lang,
      lineRange: `${actualStartLine}-${actualEndLine}`,
      startLine: actualStartLine,
      endLine: actualEndLine,
      totalLines: lines.length,
      content: formattedContent,
      truncated,
      message: truncated
        ? `Showing lines ${actualStartLine}-${actualEndLine} of ${lines.length} total lines from Knowledge Base document "${displayName}"`
        : `Read ${lines.length} lines from Knowledge Base document "${displayName}"`,
      source: "knowledge_base",
      documentTitle: document.title || undefined,
    };
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createReadFileTool(options: ReadFileToolOptions) {
  const { sessionId, characterId } = options;

  return tool({
    description: `Read full file content or a specific line range from Knowledge Base documents or synced folders.

**Supported Sources:**
1. **Knowledge Base documents** - Uploaded PDFs, text, Markdown, HTML files. Reference by filename or title.
2. **Synced folder files** - Files from indexed folders.

**Features:**
- **Smart Limiting**: Reads first 5000 lines by default.
- **Head/Tail**: Use 'head' to read first N lines, 'tail' to read last N lines.
- **Line Range**: Use 'startLine'/'endLine' for specific sections.
- **Binary Detection**: Automatically prevents reading binary files.

**Returns:** File content with line numbers, language detection, and truncation info.`,

    inputSchema: readFileSchema,

    execute: async (input: ReadFileInput): Promise<ReadFileResult> => {
      if (!characterId) {
        return {
          status: "error",
          error: "Read File requires an agent context.",
        };
      }

      const { filePath, startLine, endLine, head, tail } = input;

      // Validation
      if ((head || tail) && (startLine || endLine)) {
         return {
           status: "error",
           error: "Cannot specify both head/tail and startLine/endLine parameters.",
         };
      }
      if (head && tail) {
        return {
          status: "error",
          error: "Cannot specify both head and tail parameters.",
        };
      }

      // Guard: reject absurdly large range requests to prevent context bloat
      const MAX_RANGE_LINES = 10_000;
      if (head && head > MAX_RANGE_LINES) {
        return {
          status: "error",
          error: `Requested head=${head} exceeds maximum range of ${MAX_RANGE_LINES} lines. Use a smaller range or startLine/endLine.`,
        };
      }
      if (tail && tail > MAX_RANGE_LINES) {
        return {
          status: "error",
          error: `Requested tail=${tail} exceeds maximum range of ${MAX_RANGE_LINES} lines. Use a smaller range or startLine/endLine.`,
        };
      }
      if (startLine && endLine && (endLine - startLine + 1) > MAX_RANGE_LINES) {
        return {
          status: "error",
          error: `Requested range (${startLine}-${endLine} = ${endLine - startLine + 1} lines) exceeds maximum of ${MAX_RANGE_LINES} lines. Use a smaller range.`,
        };
      }

      // STEP 1: Knowledge Base
      const kbResult = await tryReadFromKnowledgeBase(
        characterId,
        filePath,
        startLine,
        endLine,
        head,
        tail
      );
      if (kbResult) {
        return kbResult;
      }

      // STEP 2: Synced Folders
      let syncedFolders: string[];
      try {
        syncedFolders = await resolveSyncedFolderPaths(characterId);
        if (syncedFolders.length === 0) {
          return {
            status: "error",
            error: "No matching documents found. No synced folders configured and no Knowledge Base document matches this filename.",
          };
        }
      } catch (error) {
        return {
          status: "error",
          error: `Failed to get synced folders: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }

      // Validate Path
      const validPath = await isPathAllowed(filePath, syncedFolders);
      if (!validPath) {
        const suggestions = await findSimilarFiles(characterId, filePath);
        const suggestionText = suggestions.length > 0
          ? ` Did you mean: ${suggestions.map(s => `"${s}"`).join(", ")}?`
          : "";

        return {
          status: "error",
          error: `File not found in Knowledge Base or synced folders.${suggestionText}`,
          allowedFolders: syncedFolders,
        };
      }

      // Binary Check
      if (await isBinaryFile(validPath)) {
        return {
          status: "error",
          error: `File "${basename(validPath)}" appears to be binary. Reading binary files is not supported to prevent context window pollution.`,
          filePath: validPath,
        };
      }

      // Read File
      try {
        const content = await readFile(validPath, "utf-8");
        const lines = content.split("\n");

        if (content.length > MAX_FILE_SIZE_BYTES) {
           // If too large, but user asked for head/tail/range, we might still be able to serve it if we streamed it.
           // But here we already read it into memory (node fs.readFile).
           // Optimization: We could use fs.read with buffer for huge files, but 1MB limit is small enough for memory.
           // If content > 1MB, we reject unless it's a specific range?
           // Actually, let's just warn.
           if (!head && !tail && !startLine && !endLine) {
              return {
                status: "error",
                error: `File too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_FILE_SIZE_BYTES / 1024}KB. Try using 'head' or 'tail' to read a portion.`,
                source: "synced_folder",
              };
           }
        }

        // Apply Logic
        let selectedLines = lines;
        let actualStartLine = 1;
        let actualEndLine = lines.length;

        if (head) {
          actualEndLine = Math.min(lines.length, head);
          selectedLines = lines.slice(0, actualEndLine);
        } else if (tail) {
          actualStartLine = Math.max(1, lines.length - tail + 1);
          selectedLines = lines.slice(actualStartLine - 1);
        } else if (startLine !== undefined || endLine !== undefined) {
          actualStartLine = Math.max(1, startLine ?? 1);
          actualEndLine = Math.min(lines.length, endLine ?? lines.length);
          selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
        } else if (lines.length > MAX_LINE_COUNT) {
          selectedLines = lines.slice(0, MAX_LINE_COUNT);
          actualEndLine = MAX_LINE_COUNT;
        }

        // Format
        const lang = getCodeLanguage(validPath);
        const formattedContent = selectedLines
          .map((line, idx) => {
            const lineNum = `${String(actualStartLine + idx).padStart(4, " ")} | `;
            const truncatedLine = line.length > MAX_LINE_WIDTH
              ? line.slice(0, MAX_LINE_WIDTH) + `... [truncated]`
              : line;
            return lineNum + truncatedLine;
          })
          .join("\n");

        const truncated = selectedLines.length < lines.length;

        // Record Read
        recordFileRead(sessionId, validPath);

        return {
          status: "success",
          filePath: validPath,
          language: lang,
          lineRange: `${actualStartLine}-${actualEndLine}`,
          startLine: actualStartLine,
          endLine: actualEndLine,
          totalLines: lines.length,
          content: formattedContent,
          truncated,
          message: truncated
            ? `Showing lines ${actualStartLine}-${actualEndLine} of ${lines.length} total lines`
            : `Read ${lines.length} lines from ${basename(validPath)}`,
          source: "synced_folder",
        };
      } catch (error) {
        return {
          status: "error",
          error: `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });
}
