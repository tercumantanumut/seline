import path from 'path';
import fs from 'fs';

/**
 * Validates that a path is safe and within the allowed directory.
 * Handles symlink resolution to prevent sandbox escapes.
 */
export function validatePath(targetPath: string, allowedDirectory: string = process.cwd()): string {
  const normalizedAllowedDir = path.resolve(allowedDirectory);
  const resolvedPath = path.resolve(normalizedAllowedDir, targetPath);

  // 1. Basic containment check
  if (!resolvedPath.startsWith(normalizedAllowedDir)) {
    throw new Error(`Access denied: Path '${targetPath}' is outside the allowed directory.`);
  }

  // 2. Symlink resolution (if file exists)
  if (fs.existsSync(resolvedPath)) {
    const realPath = fs.realpathSync(resolvedPath);
    if (!realPath.startsWith(normalizedAllowedDir)) {
      throw new Error(`Access denied: Symlink at '${targetPath}' points outside the allowed directory.`);
    }
    return realPath;
  }

  // 3. Parent directory check (for new files)
  const parentDir = path.dirname(resolvedPath);
  if (fs.existsSync(parentDir)) {
    const realParentPath = fs.realpathSync(parentDir);
    if (!realParentPath.startsWith(normalizedAllowedDir)) {
       throw new Error(`Access denied: Parent directory of '${targetPath}' points outside the allowed directory.`);
    }
  }

  return resolvedPath;
}
