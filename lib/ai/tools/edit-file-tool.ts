/**
 * Edit File Tool
 *
 * AI tool for making targeted edits to files within synced folders.
 * Uses "Fuzzy Match & Patch" algorithm (like MCP Filesystem Server):
 * - Normalizes line endings (\r\n -> \n)
 * - Tries exact match first
 * - Fallback to fuzzy match (ignoring indentation/whitespace differences)
 * - Preserves indentation when applying edits
 * - Supports dry runs
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
  generateLineNumberDiff,
  generateBeforeAfterDiff,
  type DiagnosticResult,
  applyFileEdits,
  type FileEdit,
} from "@/lib/ai/filesystem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditFileToolOptions {
  sessionId: string;
  characterId?: string | null;
}

interface EditFileInput {
  filePath: string;
  oldString?: string;
  newString?: string;
  edits?: FileEdit[];
  dryRun?: boolean;
}

interface EditFileResult {
  status: "success" | "created" | "error" | "no_folders";
  filePath?: string;
  message?: string;
  error?: string;
  linesChanged?: number;
  diagnostics?: DiagnosticResult;
  diff?: string;
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const editFileSchema = jsonSchema<EditFileInput>({
  type: "object",
  title: "EditFileInput",
  description: "Input for editing a file by replacing a unique string",
  properties: {
    filePath: {
      type: "string",
      description:
        "Absolute or relative path to the file within synced folders",
    },
    oldString: {
      type: "string",
      description:
        "Legacy: The exact string to find and replace. Leave empty to create a new file.",
    },
    newString: {
      type: "string",
      description:
        "Legacy: The replacement string.",
    },
    edits: {
      type: "array",
      description: "List of edits to apply. Each edit has oldString and newString.",
      items: {
        type: "object",
        properties: {
          oldString: { type: "string" },
          newString: { type: "string" },
        },
        required: ["oldString", "newString"],
      },
    },
    dryRun: {
      type: "boolean",
      description: "If true, returns the diff without modifying the file.",
      default: false,
    },
  },
  required: ["filePath"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createEditFileTool(options: EditFileToolOptions) {
  const { sessionId, characterId } = options;

  return tool({
    description: `Edit a file by replacing a specific string with new content within synced folders.

**Modes:**
- **Edit**: Provide 'edits' array with oldString/newString pairs.
- **Legacy Edit**: Provide oldString and newString directly.
- **Create**: Set oldString to "" to create a new file with newString as content.
- **Dry Run**: Set dryRun: true to preview changes.

**Capabilities:**
- **Fuzzy Matching**: Matches code even if indentation differs slightly.
- **Indentation Fix**: Automatically adjusts indentation of new code to match the file.
- **Safety**: Validates paths, checks for stale files, and runs diagnostics.`,

    inputSchema: editFileSchema,

    execute: async (input: EditFileInput): Promise<EditFileResult> => {
      if (!characterId) {
        return {
          status: "error",
          error:
            "No agent context. Edit File requires an agent with synced folders.",
        };
      }

      const { filePath, oldString, newString, edits, dryRun = false } = input;

      // Normalize input: Convert legacy oldString/newString to edits array
      let fileEdits: FileEdit[] = [];
      if (edits && edits.length > 0) {
        fileEdits = edits;
      } else if (oldString !== undefined && newString !== undefined) {
        // Special case: Creation mode (oldString === "")
        if (oldString === "") {
          // Handled separately below
        } else {
          fileEdits = [{ oldString, newString }];
        }
      } else {
        return {
          status: "error",
          error: "Must provide either 'edits' array or 'oldString' and 'newString'.",
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
      const validPath = await isPathAllowed(filePath, syncedFolders);
      if (!validPath) {
        return {
          status: "error",
          error: `Path "${filePath}" is not within any synced folder. Allowed folders: ${syncedFolders.join(", ")}`,
        };
      }

      // CREATE MODE: oldString is empty (Legacy support)
      if (oldString === "" && newString !== undefined && fileEdits.length === 0) {
        if (dryRun) {
           return {
             status: "success",
             filePath: validPath,
             message: `[Dry Run] Would create ${basename(validPath)}`,
             linesChanged: newString.split("\n").length,
             diff: generateBeforeAfterDiff(validPath, "", newString),
             dryRun: true,
           };
        }

        try {
          await access(validPath);
          // File already exists
          return {
            status: "error",
            error: `File "${basename(validPath)}" already exists. Use edits to modify it, or writeFile to overwrite.`,
          };
        } catch {
          // File doesn't exist — create it
        }

        try {
          await ensureParentDirectories(validPath);
          await writeFile(validPath, newString, "utf-8");
          recordFileWrite(sessionId, validPath);
          recordFileRead(sessionId, validPath); // Mark as read after creation

          const lineCount = newString.split("\n").length;
          const diff = generateBeforeAfterDiff(validPath, "", newString);
          const diagnostics = await runPostWriteDiagnostics(
            validPath,
            syncedFolders
          ).catch(() => null);

          return {
            status: "created",
            filePath: validPath,
            message: `Created ${basename(validPath)} (${lineCount} lines)`,
            linesChanged: lineCount,
            diagnostics: diagnostics ?? undefined,
            diff,
          };
        } catch (error) {
          return {
            status: "error",
            error: `Failed to create file: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }

      // EDIT MODE: Apply edits
      
      // Check if file was previously read
      if (!wasFileReadBefore(sessionId, validPath)) {
        return {
          status: "error",
          error: `You must read "${basename(validPath)}" with readFile before editing it.`,
        };
      }

      // Check stale detection
      if (await isFileStale(sessionId, validPath)) {
        return {
          status: "error",
          error: `File "${basename(validPath)}" has been modified since you last read it. Read it again with readFile before editing.`,
        };
      }

      // Read current content
      let content: string;
      try {
        content = await readFile(validPath, "utf-8");
      } catch (error) {
        return {
          status: "error",
          error: `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }

      // Apply Edits using Fuzzy Match Logic
      const result = applyFileEdits(content, fileEdits);

      if (!result.success) {
        return {
          status: "error",
          error: result.error || "Failed to apply edits.",
        };
      }

      if (dryRun) {
        return {
          status: "success",
          filePath: validPath,
          message: `[Dry Run] Would apply ${fileEdits.length} edit(s) to ${basename(validPath)}`,
          linesChanged: result.linesChanged,
          diff: result.diff,
          dryRun: true,
        };
      }

      // Write changes
      try {
        await writeFile(validPath, result.newContent, "utf-8");
        recordFileWrite(sessionId, validPath);
        recordFileRead(sessionId, validPath); // Update read time

        // Run diagnostics
        const diagnostics = await runPostWriteDiagnostics(
          validPath,
          syncedFolders
        ).catch(() => null);

        const parts = [`Edited ${basename(validPath)}`];
        if (result.linesChanged > 0) {
          parts.push(`(${result.linesChanged} lines changed)`);
        }
        if (diagnostics?.hasErrors) {
          parts.push(`— ${diagnostics.errorCount} error(s) detected`);
        }

        return {
          status: "success",
          filePath: validPath,
          message: parts.join(" "),
          linesChanged: result.linesChanged,
          diagnostics: diagnostics ?? undefined,
          diff: result.diff,
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
