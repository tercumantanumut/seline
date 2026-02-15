/**
 * Write File Tool
 *
 * AI tool for writing full file content within synced folders.
 * Creates new files or overwrites existing ones.
 * Includes stale detection and post-write diagnostics.
 */

import { tool, jsonSchema } from "ai";
import { readFile, writeFile, access } from "fs/promises";
import { basename } from "path";
import {
  isPathAllowed,
  resolveSyncedFolderPaths,
  ensureParentDirectories,
  recordFileRead,
  recordFileWrite,
  wasFileReadBefore,
  isFileStale,
  runPostWriteDiagnostics,
  generateBeforeAfterDiff,
  type DiagnosticResult,
} from "@/lib/ai/filesystem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteFileToolOptions {
  sessionId: string;
  characterId?: string | null;
}

interface WriteFileInput {
  filePath: string;
  content: string;
}

interface WriteFileResult {
  status: "success" | "error" | "no_folders";
  filePath?: string;
  message?: string;
  error?: string;
  bytesWritten?: number;
  lineCount?: number;
  created?: boolean;
  diagnostics?: DiagnosticResult;
  diff?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const writeFileSchema = jsonSchema<WriteFileInput>({
  type: "object",
  title: "WriteFileInput",
  description: "Input for writing full file content",
  properties: {
    filePath: {
      type: "string",
      description:
        "Absolute or relative path to the file within synced folders",
    },
    content: {
      type: "string",
      description: "The full content to write to the file",
    },
  },
  required: ["filePath", "content"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createWriteFileTool(options: WriteFileToolOptions) {
  const { sessionId, characterId } = options;

  return tool({
    description: `Write full content to a file within synced folders (create or overwrite).

**Use Cases:**
- Create a new file with specific content
- Completely rewrite an existing file
- For targeted edits, prefer editFile instead (preserves unmodified content)

**Safety:**
- For existing files: warns if file was modified since last read
- Paths restricted to synced folders
- Max file size: 1MB
- No-op detection: rejects writes of identical content

**After writing:** Diagnostics are run automatically (tsc, eslint) and errors are reported.`,

    inputSchema: writeFileSchema,

    execute: async (input: WriteFileInput): Promise<WriteFileResult> => {
      if (!characterId) {
        return {
          status: "error",
          error:
            "No agent context. Write File requires an agent with synced folders.",
        };
      }

      const { filePath, content } = input;

      // Size limit
      if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE_BYTES) {
        return {
          status: "error",
          error: `Content too large (${Math.round(Buffer.byteLength(content, "utf-8") / 1024)}KB). Max: ${MAX_FILE_SIZE_BYTES / 1024}KB.`,
        };
      }

      // Get synced folders
      let syncedFolders: string[];
      try {
        syncedFolders = await resolveSyncedFolderPaths(characterId);
        if (syncedFolders.length === 0) {
          return {
            status: "no_folders",
            error:
              "No synced folders configured. Add synced folders in agent settings.",
          };
        }
      } catch (error) {
        return {
          status: "error",
          error: `Failed to get synced folders: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }

      // Validate path
      const validPath = isPathAllowed(filePath, syncedFolders);
      if (!validPath) {
        return {
          status: "error",
          error: `Path "${filePath}" is not within any synced folder.`,
        };
      }

      // Check if file exists
      let fileExists = false;
      try {
        await access(validPath);
        fileExists = true;
      } catch {
        // File doesn't exist — will be created
      }

      if (fileExists) {
        // Read existing content for no-op detection
        try {
          const existingContent = await readFile(validPath, "utf-8");
          if (existingContent === content) {
            return {
              status: "error",
              error: `File content is identical — no changes to write.`,
            };
          }
        } catch {
          // Can't read — proceed with write anyway
        }

        // Stale detection: warn if file was modified since last read
        if (wasFileReadBefore(sessionId, validPath)) {
          if (await isFileStale(sessionId, validPath)) {
            return {
              status: "error",
              error: `File "${basename(validPath)}" has been modified since you last read it. Read it again with readFile before overwriting.`,
            };
          }
        }
      }

      // Write the file
      try {
        let previousContent = "";
        if (fileExists) {
          try {
            previousContent = await readFile(validPath, "utf-8");
          } catch {
            previousContent = "";
          }
        } else {
          await ensureParentDirectories(validPath);
        }

        await writeFile(validPath, content, "utf-8");
        recordFileWrite(sessionId, validPath);
        recordFileRead(sessionId, validPath); // Mark as read after our own write

        const lineCount = content.split("\n").length;
        const bytesWritten = Buffer.byteLength(content, "utf-8");
        const diff = generateBeforeAfterDiff(validPath, previousContent, content);

        // Run diagnostics
        const diagnostics = await runPostWriteDiagnostics(
          validPath,
          syncedFolders
        ).catch(() => null);

        const action = fileExists ? "Wrote" : "Created";
        const parts = [`${action} ${basename(validPath)} (${lineCount} lines, ${Math.round(bytesWritten / 1024)}KB)`];
        if (diagnostics?.hasErrors) {
          parts.push(`— ${diagnostics.errorCount} error(s) detected`);
        }

        return {
          status: "success",
          filePath: validPath,
          message: parts.join(" "),
          bytesWritten,
          lineCount,
          created: !fileExists,
          diagnostics: diagnostics ?? undefined,
          diff,
        };
      } catch (error) {
        return {
          status: "error",
          error: `Failed to write file: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });
}
