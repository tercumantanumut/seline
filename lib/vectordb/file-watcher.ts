/**
 * File Watcher Service
 *
 * Uses chokidar to watch folders for changes and trigger incremental sync.
 * Implements debouncing to avoid excessive re-indexing.
 */

import chokidar, { FSWatcher } from "chokidar";
import { extname, relative, join } from "path";
import { access } from "fs/promises";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders, agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq, and } from "drizzle-orm";
import { indexFileToVectorDB, removeFileFromVectorDB } from "./indexing";
import { isVectorDBEnabled } from "./client";
import { taskRegistry } from "@/lib/background-tasks/registry";
import type { TaskEvent } from "@/lib/background-tasks/types";

// Global state that persists across hot reloads (dev mode)
const globalForWatchers = globalThis as unknown as {
  fileWatchers?: Map<string, FSWatcher>;
  folderQueues?: Map<string, Set<string>>;
  deferredQueues?: Map<string, Set<string>>;
  folderProcessors?: Map<string, {
    processBatch: () => Promise<void>;
    characterId: string;
    folderPath: string;
  }>;
};

// Initialize global state if not already present
if (!globalForWatchers.fileWatchers) {
  globalForWatchers.fileWatchers = new Map();
}
if (!globalForWatchers.folderQueues) {
  globalForWatchers.folderQueues = new Map();
}
if (!globalForWatchers.deferredQueues) {
  globalForWatchers.deferredQueues = new Map();
}
if (!globalForWatchers.folderProcessors) {
  globalForWatchers.folderProcessors = new Map();
}

// Map of folder ID to watcher instance (use global in dev mode to persist across hot reloads)
const watchers = globalForWatchers.fileWatchers;

// Track which watchers are using polling mode
const pollingModeWatchers = new Set<string>();

// Map of folder ID to set of changed file paths
const folderQueues = globalForWatchers.folderQueues;
const deferredQueues = globalForWatchers.deferredQueues;

const folderProcessors = globalForWatchers.folderProcessors;

const activeBatchProcessing = new Set<string>();
const pendingBatchRun = new Map<string, boolean>();

const activeChatRunsByCharacter = new Map<string, number>();
let registryListenerInitialized = false;

// Debounce timers for folders
const folderTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 1000; // Wait 1 second after last change before processing batch
const MAX_CONCURRENCY = 5; // Process max 5 files at once per folder

interface WatcherConfig {
  folderId: string;
  characterId: string;
  folderPath: string;
  recursive: boolean;
  includeExtensions: string[];
  excludePatterns: string[];
}

/**
 * Check if a directory is a project root (contains package.json, Cargo.toml, etc.)
 * Project roots are typically large codebases that should use polling mode.
 */
async function isProjectRootDirectory(folderPath: string): Promise<boolean> {
  // Check if it's the current working directory
  if (folderPath === process.cwd()) {
    return true;
  }

  // Check for common project markers
  const projectMarkers = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'composer.json',
    'requirements.txt',
    'pyproject.toml',
  ];

  for (const marker of projectMarkers) {
    try {
      await access(join(folderPath, marker));
      return true; // Found a project marker
    } catch {
      // File doesn't exist, continue checking
    }
  }

  return false;
}

function seedActiveChatRuns(): void {
  activeChatRunsByCharacter.clear();
  const activeChatTasks = taskRegistry.list({ type: "chat" }).tasks;
  for (const task of activeChatTasks) {
    if (!task.characterId) continue;
    const current = activeChatRunsByCharacter.get(task.characterId) ?? 0;
    activeChatRunsByCharacter.set(task.characterId, current + 1);
  }
}

function initializeRegistryListener(): void {
  if (registryListenerInitialized) return;
  seedActiveChatRuns();

  taskRegistry.on("task:started", (event: TaskEvent) => {
    if (event.eventType !== "task:started") return;
    if (event.task.type !== "chat" || !event.task.characterId) return;
    const current = activeChatRunsByCharacter.get(event.task.characterId) ?? 0;
    activeChatRunsByCharacter.set(event.task.characterId, current + 1);
  });

  taskRegistry.on("task:completed", (event: TaskEvent) => {
    if (event.eventType !== "task:completed") return;
    if (event.task.type !== "chat" || !event.task.characterId) return;
    const current = activeChatRunsByCharacter.get(event.task.characterId) ?? 0;
    const next = Math.max(0, current - 1);
    if (next === 0) {
      activeChatRunsByCharacter.delete(event.task.characterId);
      flushDeferredForCharacter(event.task.characterId);
    } else {
      activeChatRunsByCharacter.set(event.task.characterId, next);
    }
  });

  registryListenerInitialized = true;
}

function shouldDeferIndexing(characterId: string): boolean {
  return (activeChatRunsByCharacter.get(characterId) ?? 0) > 0;
}

function flushDeferredForCharacter(characterId: string): void {
  if (shouldDeferIndexing(characterId)) {
    return;
  }
  for (const [folderId, processor] of folderProcessors.entries()) {
    if (processor.characterId !== characterId) continue;
    void flushDeferredForFolder(folderId);
  }
}

async function flushDeferredForFolder(folderId: string): Promise<void> {
  const deferred = deferredQueues.get(folderId);
  const processor = folderProcessors.get(folderId);
  const queue = folderQueues.get(folderId);
  if (!deferred || !processor || !queue || deferred.size === 0) {
    return;
  }
  if (shouldDeferIndexing(processor.characterId)) {
    return;
  }

  for (const filePath of deferred) {
    queue.add(filePath);
  }
  const count = deferred.size;
  deferred.clear();

  console.log(`[FileWatcher] Flushing ${count} deferred file(s) for ${processor.folderPath}`);
  await processor.processBatch();
}

/**
 * Simple concurrency limiter
 */
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (queue.length > 0 && active.length < concurrency) {
      const item = queue.shift()!;

      const promise = handler(item);

      // Add to active set
      active.push(promise);

      // Ensure we remove it from active set when done (success or fail)
      // Use .finally() so it runs regardless of outcome
      // We don't await here to not block the loop
      promise.finally(() => {
        const index = active.indexOf(promise);
        if (index > -1) active.splice(index, 1);
      }).catch(() => {
        // Catch any unhandled rejection in the handler to prevent UnhandledPromiseRejectionWarning
        // The error should ideally be handled inside the handler or logged there
      });
    }

    if (active.length > 0) {
      // Wait for at least one to finish before checking queue again
      // We use Promise.race to proceed as soon as one slot opens up
      try {
        await Promise.race(active);
      } catch (e) {
        // If a handler fails, Promise.race might reject. 
        // We still want to continue processing others.
        // The .finally block above ensures the failed promise is removed.
      }
    }
  }
}

/**
 * Start watching a folder for changes
 */
export async function startWatching(config: WatcherConfig): Promise<void> {
  if (!isVectorDBEnabled()) {
    console.log("[FileWatcher] VectorDB not enabled, skipping watch");
    return;
  }

  initializeRegistryListener();

  // Stop existing watcher if any
  await stopWatching(config.folderId);

  const { folderId, characterId, folderPath, recursive, includeExtensions, excludePatterns } = config;

  console.log(`[FileWatcher] Starting watch for folder: ${folderPath}`);

  // Warn if watching project root (common source of FD exhaustion)
  if (folderPath === process.cwd()) {
    console.warn(
      `[FileWatcher] WARNING: Watching entire project directory (${folderPath}). ` +
      `This may cause high file descriptor usage and performance issues. ` +
      `Consider syncing specific subdirectories instead.`
    );
  }

  // Initialize queue for this folder
  folderQueues.set(folderId, new Set());
  deferredQueues.set(folderId, new Set());

  const processBatch = async () => {
    if (activeBatchProcessing.has(folderId)) {
      pendingBatchRun.set(folderId, true);
      return;
    }

    activeBatchProcessing.add(folderId);
    const queue = folderQueues.get(folderId);
    if (!queue || queue.size === 0) {
      activeBatchProcessing.delete(folderId);
      return;
    }

    // Create a snapshot of current files to process and clear the queue
    const filesToProcess = Array.from(queue);
    queue.clear();
    folderTimers.delete(folderId);

    console.log(`[FileWatcher] Processing batch of ${filesToProcess.length} files for ${folderPath}`);

    try {
      await processWithConcurrency(filesToProcess, MAX_CONCURRENCY, async (filePath) => {
        try {
          console.log(`[FileWatcher] Indexing changed file: ${filePath}`);
          const relativePath = relative(folderPath, filePath);
          await indexFileToVectorDB({
            characterId,
            filePath,
            folderId,
            relativePath,
          });
        } catch (error) {
          console.error(`[FileWatcher] Error indexing file ${filePath}:`, error);
        }
      });
    } finally {
      activeBatchProcessing.delete(folderId);
      console.log(`[FileWatcher] Batch processing complete for ${folderPath}`);

      if (pendingBatchRun.get(folderId)) {
        pendingBatchRun.delete(folderId);
        if (folderQueues.get(folderId)?.size) {
          await processBatch();
        }
      }
    }
  };

  const scheduleBatch = (filePath: string) => {
    if (shouldDeferIndexing(characterId)) {
      const deferred = deferredQueues.get(folderId);
      if (deferred && !deferred.has(filePath)) {
        deferred.add(filePath);
        if (deferred.size === 1) {
          console.log(
            `[FileWatcher] Deferring indexing while chat run is active for ${folderPath}`
          );
        }
      }
      return;
    }

    const queue = folderQueues.get(folderId);
    if (!queue) return;

    queue.add(filePath);

    // Reset debounce timer
    if (folderTimers.has(folderId)) {
      clearTimeout(folderTimers.get(folderId)!);
    }

    folderTimers.set(
      folderId,
      setTimeout(processBatch, DEBOUNCE_MS)
    );
  };

  // Build efficient ignore patterns for chokidar
  // Convert exclude patterns to glob patterns that chokidar can use efficiently
  const ignoredPatterns = excludePatterns.map(pattern => {
    // If pattern looks like a directory or file name, make it match anywhere in the path
    if (!pattern.includes('*') && !pattern.includes('/')) {
      return `**/${pattern}/**`;
    }
    return pattern;
  });

  // Always exclude common large directories to prevent FD exhaustion
  const alwaysExclude = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.local-data/**',
    '**/dist-electron/**',
    '**/comfyui_backend/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/tmp/**',
    '**/temp/**',
  ];

  // For large codebases (project root) or folders that previously hit EMFILE,
  // use polling mode to prevent file descriptor exhaustion
  // This is less efficient but much more reliable and doesn't hit file descriptor limits
  const isProjectRoot = await isProjectRootDirectory(folderPath);
  const forcedPolling = pollingModeWatchers.has(folderId);
  const usePolling = isProjectRoot || forcedPolling;

  if (usePolling) {
    console.log(
      `[FileWatcher] Using polling mode for large codebase: ${folderPath} ` +
      `(prevents file descriptor exhaustion)`
    );
  }

  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true, // Don't trigger on existing files
    depth: recursive ? undefined : 0,
    ignored: [...alwaysExclude, ...ignoredPatterns],
    // Use atomic writes to reduce file descriptor churn
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
    // Use polling for large codebases to prevent EMFILE errors
    usePolling,
    interval: usePolling ? 2000 : undefined, // Check every 2 seconds in polling mode
    binaryInterval: usePolling ? 5000 : undefined, // Check binary files every 5 seconds
  });

  // Handle file add/change
  const handleFileChange = async (filePath: string) => {
    // Get extension without the leading dot for comparison
    const ext = extname(filePath).slice(1).toLowerCase();
    // Normalize includeExtensions by removing any leading dots
    const normalizedExts = includeExtensions.map(e => e.startsWith(".") ? e.slice(1).toLowerCase() : e.toLowerCase());
    if (normalizedExts.length > 0 && !normalizedExts.includes(ext)) {
      return; // Skip files with non-matching extensions
    }

    scheduleBatch(filePath);
  };

  // Handle file removal - process immediately as it's fast and important to keep index clean
  const handleFileRemove = async (filePath: string) => {
    try {
      console.log(`[FileWatcher] Removing deleted file from index: ${filePath}`);

      // Also remove from pending queue if it was waiting to be processed
      const queue = folderQueues.get(folderId);
      if (queue && queue.has(filePath)) {
        queue.delete(filePath);
      }

      // Look up the file record in the database
      const [fileRecord] = await db
        .select()
        .from(agentSyncFiles)
        .where(and(
          eq(agentSyncFiles.folderId, folderId),
          eq(agentSyncFiles.filePath, filePath)
        ));

      if (fileRecord) {
        // Parse vectorPointIds - handle both arrays and double-stringified data
        let pointIds: string[] = [];
        if (Array.isArray(fileRecord.vectorPointIds)) {
          pointIds = fileRecord.vectorPointIds;
        } else if (typeof fileRecord.vectorPointIds === "string") {
          try {
            const parsed = JSON.parse(fileRecord.vectorPointIds);
            pointIds = Array.isArray(parsed) ? parsed : [];
          } catch {
            pointIds = [];
          }
        }

        // Remove from vector DB
        if (pointIds.length > 0) {
          await removeFileFromVectorDB({
            characterId,
            pointIds,
          });
        }

        // Remove from database
        await db.delete(agentSyncFiles).where(eq(agentSyncFiles.id, fileRecord.id));
        console.log(`[FileWatcher] Removed ${pointIds.length} vectors for deleted file: ${filePath}`);
      }
    } catch (error) {
      console.error(`[FileWatcher] Error removing file ${filePath}:`, error);
    }
  };

  watcher
    .on("add", handleFileChange)
    .on("change", handleFileChange)
    .on("unlink", handleFileRemove)
    .on("error", async (error: any) => {
      console.error(`[FileWatcher] Error watching ${folderPath}:`, error);

      // If we hit EMFILE and weren't already using polling, restart in polling mode
      if (error?.code === 'EMFILE' && !pollingModeWatchers.has(folderId)) {
        console.warn(
          `[FileWatcher] Hit file descriptor limit for ${folderPath}, ` +
          `will restart in polling mode after cleanup...`
        );

        // Mark this folder for polling mode BEFORE closing
        pollingModeWatchers.add(folderId);

        // Close the current watcher
        try {
          await watcher.close();
          watchers.delete(folderId);
        } catch (closeError) {
          console.error(`[FileWatcher] Error closing watcher:`, closeError);
        }

        // Wait longer to ensure file descriptors are released
        // and to avoid overwhelming the system if multiple watchers fail
        setTimeout(() => {
          console.log(`[FileWatcher] Restarting watcher for ${folderPath} in polling mode...`);
          startWatching(config).catch(err => {
            console.error(`[FileWatcher] Failed to restart watcher in polling mode:`, err);
          });
        }, 3000); // Wait 3 seconds instead of 1
      }
    });

  watchers.set(folderId, watcher);
  folderProcessors.set(folderId, {
    processBatch,
    characterId,
    folderPath,
  });

  // Update folder status
  await db
    .update(agentSyncFolders)
    .set({ status: "synced" })
    .where(eq(agentSyncFolders.id, folderId));
}

/**
 * Stop watching a folder
 */
export async function stopWatching(folderId: string): Promise<void> {
  const watcher = watchers.get(folderId);
  if (watcher) {
    await watcher.close();
    watchers.delete(folderId);
    console.log(`[FileWatcher] Stopped watching folder: ${folderId}`);
  }

  // Clear any pending queue and timer for this folder
  if (folderTimers.has(folderId)) {
    clearTimeout(folderTimers.get(folderId)!);
    folderTimers.delete(folderId);
  }

  if (folderQueues.has(folderId)) {
    folderQueues.delete(folderId);
  }

  if (deferredQueues.has(folderId)) {
    deferredQueues.delete(folderId);
  }

  if (folderProcessors.has(folderId)) {
    folderProcessors.delete(folderId);
  }

  pendingBatchRun.delete(folderId);
  activeBatchProcessing.delete(folderId);
  pollingModeWatchers.delete(folderId);
}

/**
 * Stop all watchers
 */
export async function stopAllWatchers(): Promise<void> {
  for (const folderId of watchers.keys()) {
    await stopWatching(folderId);
  }
}

/**
 * Get list of currently watched folders
 */
export function getWatchedFolders(): string[] {
  return Array.from(watchers.keys());
}

/**
 * Check if a folder is being watched
 */
export function isWatching(folderId: string): boolean {
  return watchers.has(folderId);
}
