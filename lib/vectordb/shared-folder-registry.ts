/**
 * Shared Folder Registry
 *
 * Centralized mapping of physical folder paths to their shared state.
 * Enables multiple agents to share a single file watcher and avoid
 * duplicate filesystem scanning for the same folder path.
 *
 * Key invariant: one chokidar watcher per resolved physical path,
 * with fan-out to all subscriber folders on file change events.
 */

import { resolve } from "path";
import { realpath } from "fs/promises";

export interface SharedFolderEntry {
  /** Resolved absolute path */
  resolvedPath: string;
  /** Set of folder IDs (from agent_sync_folders) that reference this path */
  subscriberFolderIds: Set<string>;
  /** The folder ID that currently "owns" the chokidar watcher instance */
  ownerFolderId: string | null;
}

// Global state persists across Next.js hot reloads
const globalForRegistry = globalThis as unknown as {
  sharedFolderRegistry?: Map<string, SharedFolderEntry>;
};

if (!globalForRegistry.sharedFolderRegistry) {
  globalForRegistry.sharedFolderRegistry = new Map();
}

const registry = globalForRegistry.sharedFolderRegistry;

// Cache for realpath resolution (populated by async callers)
const realpathCache = new Map<string, string>();

/**
 * Resolve a folder path to its canonical form for registry lookups (sync).
 * Uses cached realpath if available, otherwise falls back to lexical resolve().
 */
export function resolveRegistryPath(folderPath: string): string {
  const lexical = resolve(folderPath);
  return realpathCache.get(lexical) ?? lexical;
}

/**
 * Resolve a folder path to its canonical physical form (async).
 * Uses fs.realpath to resolve symlinks and normalize case on case-insensitive
 * filesystems (macOS HFS+/APFS). Falls back to lexical resolve() on failure.
 *
 * Call this from async entry points (startWatching, restartAllWatchers) before
 * any registry operations to ensure consistent path identity.
 */
export async function resolveRegistryPathAsync(folderPath: string): Promise<string> {
  const lexical = resolve(folderPath);
  if (realpathCache.has(lexical)) return realpathCache.get(lexical)!;
  try {
    const real = resolve(await realpath(lexical));
    realpathCache.set(lexical, real);
    // Also cache the realpath pointing to itself so lookups from either direction work
    if (real !== lexical) realpathCache.set(real, real);
    return real;
  } catch {
    realpathCache.set(lexical, lexical);
    return lexical;
  }
}

/**
 * Register a folder ID as a subscriber to a physical path.
 * Returns the entry (created or existing).
 */
export function registerFolder(folderPath: string, folderId: string): SharedFolderEntry {
  const resolvedPath = resolveRegistryPath(folderPath);
  let entry = registry.get(resolvedPath);

  if (!entry) {
    entry = {
      resolvedPath,
      subscriberFolderIds: new Set(),
      ownerFolderId: null,
    };
    registry.set(resolvedPath, entry);
  }

  entry.subscriberFolderIds.add(folderId);
  return entry;
}

/**
 * Unregister a folder ID from a physical path.
 * Returns true if the path has no more subscribers (watcher should be destroyed).
 */
export function unregisterFolder(folderPath: string, folderId: string): boolean {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  if (!entry) return true;

  entry.subscriberFolderIds.delete(folderId);

  // If the owner is being removed, transfer ownership to the next subscriber
  if (entry.ownerFolderId === folderId) {
    const remaining = Array.from(entry.subscriberFolderIds);
    entry.ownerFolderId = remaining.length > 0 ? remaining[0] : null;
  }

  if (entry.subscriberFolderIds.size === 0) {
    registry.delete(resolvedPath);
    return true;
  }

  return false;
}

/**
 * Set the watcher owner for a path. The owner is the folder ID whose
 * chokidar instance is stored in the watchers map.
 */
export function setWatcherOwner(folderPath: string, folderId: string): void {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  if (entry) {
    entry.ownerFolderId = folderId;
  }
}

/**
 * Get the watcher owner folder ID for a path, or null if no watcher is active.
 */
export function getWatcherOwner(folderPath: string): string | null {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  return entry?.ownerFolderId ?? null;
}

/**
 * Get all subscriber folder IDs for a physical path.
 */
export function getSubscribers(folderPath: string): string[] {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  return entry ? Array.from(entry.subscriberFolderIds) : [];
}

/**
 * Check if a path has any subscribers.
 */
export function hasSubscribers(folderPath: string): boolean {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  return entry ? entry.subscriberFolderIds.size > 0 : false;
}

/**
 * Check if a specific folder ID is registered as a subscriber for any path.
 */
export function isRegistered(folderId: string): boolean {
  for (const entry of registry.values()) {
    if (entry.subscriberFolderIds.has(folderId)) return true;
  }
  return false;
}

/**
 * Find the resolved path for a given folder ID, or null if not registered.
 */
export function getPathForFolder(folderId: string): string | null {
  for (const [path, entry] of registry.entries()) {
    if (entry.subscriberFolderIds.has(folderId)) return path;
  }
  return null;
}

/**
 * Get subscriber count for a path.
 */
export function getSubscriberCount(folderPath: string): number {
  const resolvedPath = resolveRegistryPath(folderPath);
  const entry = registry.get(resolvedPath);
  return entry?.subscriberFolderIds.size ?? 0;
}

/**
 * Get the full entry for a physical path.
 */
export function getEntry(folderPath: string): SharedFolderEntry | undefined {
  const resolvedPath = resolveRegistryPath(folderPath);
  return registry.get(resolvedPath);
}

/**
 * Clear the entire registry. Used during stopAllWatchers and testing.
 */
export function clearRegistry(): void {
  registry.clear();
  realpathCache.clear();
}

/**
 * Get a debug snapshot of the registry.
 */
export function getRegistrySnapshot(): Array<{
  path: string;
  subscribers: string[];
  owner: string | null;
}> {
  const result: Array<{ path: string; subscribers: string[]; owner: string | null }> = [];
  for (const [path, entry] of registry.entries()) {
    result.push({
      path,
      subscribers: Array.from(entry.subscriberFolderIds),
      owner: entry.ownerFolderId,
    });
  }
  return result;
}
