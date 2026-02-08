import { homedir } from "os";
import { resolve } from "path";
import { readdir, stat } from "fs/promises";
import { isDangerousPath } from "./dangerous-paths";

export interface PathValidationOptions {
  requireExists?: boolean;
  requireReadable?: boolean;
}

export function normalizeFolderPath(folderPath: string): string {
  if (!folderPath) return folderPath;

  if (folderPath === "~") {
    return homedir();
  }

  if (folderPath.startsWith("~/") || folderPath.startsWith("~\\")) {
    return resolve(homedir(), folderPath.slice(2));
  }

  return resolve(folderPath);
}

export async function validateSyncFolderPath(
  folderPath: string,
  options: PathValidationOptions = {}
): Promise<{ normalizedPath: string; error: string | null }> {
  const normalizedPath = normalizeFolderPath(folderPath);
  const requireExists = options.requireExists !== false;
  const requireReadable = options.requireReadable !== false;

  const dangerError = isDangerousPath(normalizedPath);
  if (dangerError) {
    return { normalizedPath, error: dangerError };
  }

  if (requireExists) {
    try {
      const folderStat = await stat(normalizedPath);
      if (!folderStat.isDirectory()) {
        return { normalizedPath, error: "Path is not a directory." };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        return { normalizedPath, error: "Folder does not exist." };
      }
      if (code === "EACCES" || code === "EPERM") {
        return { normalizedPath, error: "Permission denied for this folder." };
      }

      return {
        normalizedPath,
        error: `Unable to access folder: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (requireReadable) {
    try {
      await readdir(normalizedPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "EACCES" || code === "EPERM") {
        return { normalizedPath, error: "Permission denied reading this folder." };
      }

      return {
        normalizedPath,
        error: `Unable to read folder: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { normalizedPath, error: null };
}
