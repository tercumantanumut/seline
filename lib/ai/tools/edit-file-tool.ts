/**
 * Edit File Tool
 *
 * AI tool for making targeted edits to files within synced folders.
 * Uses single-string-replacement approach (like Claude Code / OpenCode):
 * - oldString must appear exactly once in the file (uniqueness check)
 * - File must have been read before editing (stale detection)
 * - Empty oldString creates a new file
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
  oldString: string;
  newString: string;
}

interface EditFileResult {
  status: "success" | "created" | "error" | "no_folders";
  filePath?: string;
  message?: string;
  error?: string;
  linesChanged?: number;
  diagnostics?: DiagnosticResult;
  diff?: string;
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
        "The exact string to find and replace. Must appear exactly once in the file. Leave empty to create a new file.",
    },
    newString: {
      type: "string",
      description:
        "The replacement string. Leave empty to delete the matched text.",
    },
  },
  required: ["filePath", "oldString", "newString"],
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
- **Edit**: Provide oldString (must be unique in file) and newString to replace it
- **Create**: Set oldString to "" to create a new file with newString as content
- **Delete text**: Set newString to "" to remove the matched oldString

**Safety:**
- Files must be read (via readFile) before editing
- oldString must appear exactly once — add surrounding context if not unique
- Paths are restricted to synced folders
- Stale detection warns if file was modified since last read

**After editing:** Diagnostics are run automatically (tsc, eslint) and errors are reported.`,

    inputSchema: editFileSchema,

    execute: async (input: EditFileInput): Promise<EditFileResult> => {
      if (!characterId) {
        return {
          status: "error",
          error:
            "No agent context. Edit File requires an agent with synced folders.",
        };
      }

      const { filePath, oldString, newString } = input;

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
          error: `Path "${filePath}" is not within any synced folder. Allowed folders: ${syncedFolders.join(", ")}`,
        };
      }

      // CREATE MODE: oldString is empty
      if (oldString === "") {
        try {
          await access(validPath);
          // File already exists
          return {
            status: "error",
            error: `File "${basename(validPath)}" already exists. Use oldString to edit existing files, or use writeFile to overwrite.`,
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

      // EDIT MODE: replace oldString with newString
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

      // Uniqueness check: oldString must appear exactly once
      const firstIndex = content.indexOf(oldString);
      if (firstIndex === -1) {
        return {
          status: "error",
          error: `oldString not found in "${basename(validPath)}". Make sure the string matches exactly (including whitespace and indentation).`,
        };
      }

      const lastIndex = content.lastIndexOf(oldString);
      if (firstIndex !== lastIndex) {
        // Count occurrences
        let count = 0;
        let pos = 0;
        while ((pos = content.indexOf(oldString, pos)) !== -1) {
          count++;
          pos += oldString.length;
        }
        return {
          status: "error",
          error: `oldString appears ${count} times in "${basename(validPath)}". It must be unique — add more surrounding context to make it unique.`,
        };
      }

      // No-op check
      if (oldString === newString) {
        return {
          status: "error",
          error: "oldString and newString are identical. No changes to make.",
        };
      }

      // Apply the replacement
      const newContent = content.slice(0, firstIndex) + newString + content.slice(firstIndex + oldString.length);

      try {
        await writeFile(validPath, newContent, "utf-8");
        recordFileWrite(sessionId, validPath);
        recordFileRead(sessionId, validPath); // Update read time after our own write

        // Count changed lines
        const oldLines = oldString.split("\n").length;
        const newLines = newString.split("\n").length;
        const linesChanged = Math.max(oldLines, newLines);

        // Generate diff
        const diff = generateLineNumberDiff(validPath, content, oldString, newString);

        // Run diagnostics (non-blocking, 5s timeout)
        const diagnostics = await runPostWriteDiagnostics(
          validPath,
          syncedFolders
        ).catch(() => null);

        const parts = [`Edited ${basename(validPath)}`];
        if (newString === "") {
          parts.push(`(removed ${oldLines} lines)`);
        } else {
          parts.push(`(${oldLines} → ${newLines} lines)`);
        }
        if (diagnostics?.hasErrors) {
          parts.push(`— ${diagnostics.errorCount} error(s) detected`);
        }

        return {
          status: "success",
          filePath: validPath,
          message: parts.join(" "),
          linesChanged,
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
