/**
 * File System Utilities
 *
 * Shared utilities for all file system tools (readFile, editFile, writeFile, patchFile).
 */

export {
  isPathAllowed,
  resolveSyncedFolderPaths,
  ensureParentDirectories,
  findSimilarFiles,
} from "./path-utils";

export {
  recordFileRead,
  recordFileWrite,
  getLastReadTime,
  getLastWriteTime,
  wasFileReadBefore,
  isFileStale,
} from "./file-history";

export {
  runPostWriteDiagnostics,
  type DiagnosticResult,
} from "./diagnostics";
