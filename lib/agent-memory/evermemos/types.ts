/**
 * EverMemOS Integration Types
 *
 * Type definitions for the optional EverMemOS shared memory layer.
 * EverMemOS provides cross-agent memory sharing via an HTTP API.
 */

/**
 * Configuration for connecting to an EverMemOS server.
 */
export interface EverMemOSConfig {
  /** Base URL of the EverMemOS server (e.g. "http://localhost:8765") */
  serverUrl: string;
  /** Whether the EverMemOS integration is active */
  enabled: boolean;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}

/**
 * A single memory entry returned from EverMemOS.
 */
export interface EverMemOSMemoryEntry {
  /** Unique identifier for the memory */
  id: string;
  /** The memory content text */
  content: string;
  /** Optional category classification */
  category?: string;
  /** Arbitrary metadata attached to the memory */
  metadata?: Record<string, unknown>;
  /** ISO timestamp of when the memory was created */
  createdAt: string;
  /** Relevance score from search (0-1), only present in search results */
  score?: number;
}

/**
 * Result of a memory search query against EverMemOS.
 */
export interface EverMemOSSearchResult {
  /** Matching memory entries, ordered by relevance */
  entries: EverMemOSMemoryEntry[];
  /** The original search query */
  query: string;
  /** Total number of results available (may exceed entries.length if limited) */
  totalResults: number;
}

/**
 * Request payload for storing a new memory in EverMemOS.
 */
export interface EverMemOSStoreRequest {
  /** The memory content to store */
  content: string;
  /** Optional category for the memory */
  category?: string;
  /** The agent ID that is storing this memory */
  agentId?: string;
  /** Arbitrary metadata to attach to the memory */
  metadata?: Record<string, unknown>;
}

/**
 * Options for searching EverMemOS memories.
 */
export interface EverMemOSSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Filter by memory category */
  category?: string;
  /** Filter by the agent that stored the memory */
  agentId?: string;
}
