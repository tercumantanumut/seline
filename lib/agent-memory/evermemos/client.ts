/**
 * EverMemOS HTTP Client
 *
 * Communicates with an EverMemOS server over HTTP.
 * All methods degrade gracefully -- errors are logged as warnings
 * and never propagated to callers.
 */

import type {
  EverMemOSConfig,
  EverMemOSMemoryEntry,
  EverMemOSSearchResult,
  EverMemOSStoreRequest,
  EverMemOSSearchOptions,
} from "./types";

const DEFAULT_TIMEOUT_MS = 5000;

export class EverMemOSClient {
  private serverUrl: string;
  private enabled: boolean;
  private timeoutMs: number;

  constructor(config: EverMemOSConfig) {
    // Strip trailing slash for consistent URL building
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.enabled = config.enabled;
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Search EverMemOS for memories matching a query.
   * Returns an empty result set on any error.
   */
  async search(query: string, options?: EverMemOSSearchOptions): Promise<EverMemOSSearchResult> {
    const emptyResult: EverMemOSSearchResult = { entries: [], query, totalResults: 0 };

    if (!this.enabled) {
      return emptyResult;
    }

    try {
      const body: Record<string, unknown> = { query };
      if (options?.limit !== undefined) body.limit = options.limit;
      if (options?.category !== undefined) body.category = options.category;
      if (options?.agentId !== undefined) body.agentId = options.agentId;

      const response = await this.fetchWithTimeout(`${this.serverUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.warn(
          `[EverMemOS] Search failed with status ${response.status}: ${response.statusText}`
        );
        return emptyResult;
      }

      const data = (await response.json()) as {
        entries?: EverMemOSMemoryEntry[];
        totalResults?: number;
      };

      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
        query,
        totalResults: typeof data.totalResults === "number" ? data.totalResults : (data.entries?.length ?? 0),
      };
    } catch (error) {
      console.warn("[EverMemOS] Search error:", error instanceof Error ? error.message : error);
      return emptyResult;
    }
  }

  /**
   * Store a new memory in EverMemOS.
   * Returns a stub entry with an empty ID on any error.
   */
  async store(request: EverMemOSStoreRequest): Promise<EverMemOSMemoryEntry> {
    const fallbackEntry: EverMemOSMemoryEntry = {
      id: "",
      content: request.content,
      category: request.category,
      metadata: request.metadata,
      createdAt: new Date().toISOString(),
    };

    if (!this.enabled) {
      return fallbackEntry;
    }

    try {
      const response = await this.fetchWithTimeout(`${this.serverUrl}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        console.warn(
          `[EverMemOS] Store failed with status ${response.status}: ${response.statusText}`
        );
        return fallbackEntry;
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
        content: typeof data.content === "string" ? data.content : request.content,
        category: typeof data.category === "string" ? data.category : request.category,
        metadata: (data.metadata && typeof data.metadata === "object") ? data.metadata as Record<string, unknown> : request.metadata,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[EverMemOS] Store error:", error instanceof Error ? error.message : error);
      return fallbackEntry;
    }
  }

  /**
   * Check if the EverMemOS server is reachable.
   * Returns false on any error (timeout, network, server error).
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.fetchWithTimeout(`${this.serverUrl}/health`, {
        method: "GET",
      });
      return response.ok;
    } catch (error) {
      console.warn(
        "[EverMemOS] Health check failed:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /**
   * Whether the client is configured as enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fetch with an AbortController-based timeout.
   */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`EverMemOS request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
