/**
 * Context Source Manager
 * 
 * Resolves context sources by fetching external data and preparing
 * it for injection into scheduled task prompts.
 */

import type { ContextSource } from "@/lib/db/sqlite-schedule-schema";
import type { ContextFetcher, ResolvedContext } from "./types";

// Use the base ContextFetcher type for the map since fetchers have different config types
type AnyContextFetcher = ContextFetcher<Record<string, unknown>>;

export class ContextSourceManager {
  private fetchers: Map<string, AnyContextFetcher> = new Map();

  /**
   * Register a context fetcher
   */
  register(fetcher: AnyContextFetcher): void {
    this.fetchers.set(fetcher.type, fetcher);
  }

  /**
   * Unregister a context fetcher
   */
  unregister(type: string): void {
    this.fetchers.delete(type);
  }

  /**
   * Check if a fetcher is registered
   */
  hasFetcher(type: string): boolean {
    return this.fetchers.has(type);
  }

  /**
   * Resolve all context sources for a task
   */
  async resolveContextSources(
    sources: ContextSource[],
    userId: string
  ): Promise<ResolvedContext> {
    const result: ResolvedContext = {
      prepend: "",
      append: "",
      variables: {},
    };

    for (const source of sources) {
      try {
        const fetcher = this.fetchers.get(source.type);
        if (!fetcher) {
          console.warn(`[ContextSource] No fetcher for type "${source.type}"`);
          continue;
        }

        const content = await fetcher.fetch(source.config, userId);
        const injectAs = source.injectAs || "prepend";

        if (injectAs === "prepend") {
          result.prepend += `\n\n--- ${source.type.toUpperCase()} CONTEXT ---\n${content}`;
        } else if (injectAs === "append") {
          result.append += `\n\n${content}`;
        } else if (injectAs === "variable" && source.variableName) {
          result.variables[source.variableName] = content;
        }
      } catch (error) {
        console.error(`[ContextSource] Failed to fetch ${source.type}:`, error);
        // Don't fail the whole task - just skip this source
      }
    }

    return result;
  }

  /**
   * Apply resolved context to a prompt
   */
  applyContext(prompt: string, context: ResolvedContext): string {
    let result = prompt;

    // Prepend context
    if (context.prepend) {
      result = context.prepend.trim() + "\n\n" + result;
    }

    // Append context
    if (context.append) {
      result = result + "\n\n" + context.append.trim();
    }

    // Replace variables
    for (const [key, value] of Object.entries(context.variables)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }

    return result;
  }
}

// Singleton instance
let managerInstance: ContextSourceManager | null = null;

export function getContextSourceManager(): ContextSourceManager {
  if (!managerInstance) {
    managerInstance = new ContextSourceManager();
    // Register default fetchers here if needed
  }
  return managerInstance;
}

