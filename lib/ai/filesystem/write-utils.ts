/**
 * Write Utilities
 *
 * Atomic file writing operations.
 */

import { writeFile, rename, stat, chmod, access } from "fs/promises";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { ensureParentDirectories } from "./path-utils";

/**
 * Write content to a file atomically.
 * 
 * Strategy:
 * 1. Write to a temporary file in the same directory (to ensure same filesystem/mount)
 * 2. Copy permissions from original file if it exists
 * 3. Rename temporary file to target file (Atomic on POSIX)
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  // Ensure parent directory exists
  await ensureParentDirectories(filePath);

  // Check if file exists to preserve mode
  let fileExists = false;
  let mode: number | undefined;
  try {
    const stats = await stat(filePath);
    fileExists = true;
    mode = stats.mode;
  } catch {
    // File doesn't exist
  }

  // Create temp file path
  const tempPath = `${filePath}.tmp.${randomUUID()}`;

  try {
    // 1. Write to temp file
    await writeFile(tempPath, content, "utf-8");

    // 2. Preserve mode if exists
    if (fileExists && mode !== undefined) {
      try {
        await chmod(tempPath, mode);
      } catch {
        // Ignore chmod errors (e.g. windows or permission issues)
      }
    }

    // 3. Rename temp to target
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await access(tempPath);
      // If access succeeds, delete it (unlink is not available in imports?)
      // Wait, I need unlink.
      const { unlink } = require("fs/promises");
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
