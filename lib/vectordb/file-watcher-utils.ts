/**
 * File Watcher Utilities
 *
 * Stateless helper functions used by the file watcher service:
 * JSON parsing, extension normalization, concurrency, project detection,
 * and concurrency-based file processing.
 */

import { join } from "path";
import { access } from "fs/promises";
import { loadSettings } from "@/lib/settings/settings-manager";

// ---------------------------------------------------------------------------
// Embedding / concurrency helpers
// ---------------------------------------------------------------------------

export function getMaxConcurrency(): number {
  const settings = loadSettings();
  const isLocalEmbeddingProvider = settings.embeddingProvider === "local";
  // Reduce parallelism for local embeddings to avoid overwhelming ONNX runtime.
  return isLocalEmbeddingProvider ? 2 : 5;
}

// ---------------------------------------------------------------------------
// JSON / extension helpers
// ---------------------------------------------------------------------------

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeExtensions(extensions: string[]): string[] {
  return extensions.map((ext) =>
    ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

/**
 * Check if a directory is a project root (contains package.json, Cargo.toml, etc.)
 * Project roots are typically large codebases that should use polling mode.
 */
export async function isProjectRootDirectory(folderPath: string): Promise<boolean> {
  // Check if it's the current working directory
  if (folderPath === process.cwd()) {
    return true;
  }

  // Check for common project markers
  const projectMarkers = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "composer.json",
    "requirements.txt",
    "pyproject.toml",
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

// ---------------------------------------------------------------------------
// Concurrency-based batch processing
// ---------------------------------------------------------------------------

/**
 * Simple concurrency limiter — processes items with at most `concurrency`
 * simultaneous handlers running at once.
 */
export async function processWithConcurrency<T>(
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
      promise
        .finally(() => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
        })
        .catch(() => {
          // Catch any unhandled rejection in the handler to prevent
          // UnhandledPromiseRejectionWarning. The error should ideally be
          // handled inside the handler or logged there.
        });
    }

    if (active.length > 0) {
      // Wait for at least one to finish before checking queue again
      // We use Promise.race to proceed as soon as one slot opens up
      try {
        await Promise.race(active);
      } catch {
        // If a handler fails, Promise.race might reject.
        // We still want to continue processing others.
        // The .finally block above ensures the failed promise is removed.
      }
    }
  }
}
