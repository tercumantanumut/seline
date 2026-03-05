/**
 * Dual-Layer Memory Manager
 *
 * Wraps the existing local AgentMemoryManager with an optional EverMemOS
 * shared memory layer. Local memory is always the source of truth; EverMemOS
 * provides cross-agent recall and is strictly additive.
 *
 * Design principles:
 * - Local-first: all writes go to local storage first
 * - Fire-and-forget: EverMemOS writes are non-blocking
 * - Graceful degradation: EverMemOS failures are warnings, never errors
 * - Deduplication: search results are merged and deduplicated by content similarity
 */

import { AgentMemoryManager } from "../memory-manager";
import type { MemoryEntry, MemoryCategory } from "../types";
import { EverMemOSClient } from "./client";
import type {
  EverMemOSConfig,
  EverMemOSMemoryEntry,
  EverMemOSSearchOptions,
} from "./types";

/**
 * A unified memory entry that can come from either local or EverMemOS storage.
 */
export interface UnifiedMemoryEntry {
  /** Unique ID (local ID or EverMemOS ID) */
  id: string;
  /** The memory content */
  content: string;
  /** Memory category */
  category: string;
  /** Where this memory came from */
  source: "local" | "evermemos";
  /** Relevance score (only meaningful for search results) */
  score?: number;
  /** ISO timestamp */
  createdAt: string;
}

/**
 * Result of a dual-layer memory search.
 */
export interface DualLayerSearchResult {
  /** Deduplicated, merged results from both layers */
  entries: UnifiedMemoryEntry[];
  /** Number of local results before dedup */
  localCount: number;
  /** Number of EverMemOS results before dedup */
  everMemOSCount: number;
  /** Whether EverMemOS was available for this query */
  everMemOSAvailable: boolean;
}

export class DualLayerMemoryManager {
  private localManager: AgentMemoryManager;
  private everMemOSClient: EverMemOSClient | null;

  constructor(characterId: string, everMemOSConfig?: EverMemOSConfig) {
    this.localManager = new AgentMemoryManager(characterId);

    if (everMemOSConfig?.enabled) {
      this.everMemOSClient = new EverMemOSClient(everMemOSConfig);
    } else {
      this.everMemOSClient = null;
    }
  }

  /**
   * Store a memory locally first, then push to EverMemOS (fire-and-forget).
   * Returns the local MemoryEntry. EverMemOS failures are logged and ignored.
   */
  async storeMemory(
    content: string,
    category: MemoryCategory,
    agentId: string,
    options?: { reasoning?: string; sessionId?: string }
  ): Promise<MemoryEntry> {
    // Always store locally first
    const localEntry = await this.localManager.addMemory({
      category,
      content,
      reasoning: options?.reasoning ?? "Stored via dual-layer manager",
      confidence: 1.0,
      importance: 1.0,
      factors: {
        repetition: 1.0,
        impact: 1.0,
        specificity: 1.0,
        recency: 1.0,
        conflictResolution: 0,
      },
      status: "approved",
      source: "manual",
      sessionId: options?.sessionId,
    });

    // Fire-and-forget push to EverMemOS
    if (this.everMemOSClient) {
      this.everMemOSClient
        .store({
          content: content,
          category,
          agentId,
          metadata: {
            localMemoryId: localEntry.id,
            source: "seline-dual-layer",
          },
        })
        .then(() => {
          console.log(`[DualLayer] Pushed memory to EverMemOS: "${content.substring(0, 50)}..."`);
        })
        .catch((err) => {
          console.warn("[DualLayer] Failed to push memory to EverMemOS:", err);
        });
    }

    return localEntry;
  }

  /**
   * Search both local and EverMemOS memories in parallel.
   * Results are merged and deduplicated by content similarity (Jaccard > 0.85).
   */
  async searchMemories(
    query: string,
    options?: EverMemOSSearchOptions
  ): Promise<DualLayerSearchResult> {
    // Query both sources in parallel
    const [localMemories, everMemOSResult] = await Promise.all([
      this.localManager.loadApprovedMemories().catch((err) => {
        console.warn("[DualLayer] Failed to load local memories:", err);
        return [] as MemoryEntry[];
      }),
      this.everMemOSClient
        ? this.everMemOSClient.search(query, options).catch((err) => {
            console.warn("[DualLayer] EverMemOS search failed:", err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    // Convert local memories to unified format
    const localEntries: UnifiedMemoryEntry[] = localMemories
      .filter((m) => matchesQuery(m.content, query))
      .map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        source: "local" as const,
        createdAt: m.createdAt,
      }));

    // Convert EverMemOS results to unified format
    const everMemOSEntries: UnifiedMemoryEntry[] = (everMemOSResult?.entries ?? []).map(
      (e: EverMemOSMemoryEntry) => ({
        id: e.id,
        content: e.content,
        category: e.category ?? "domain_knowledge",
        source: "evermemos" as const,
        score: e.score,
        createdAt: e.createdAt,
      })
    );

    // Merge and deduplicate (local entries take priority)
    const merged = deduplicateEntries([...localEntries, ...everMemOSEntries]);

    return {
      entries: merged,
      localCount: localEntries.length,
      everMemOSCount: everMemOSEntries.length,
      everMemOSAvailable: everMemOSResult !== null,
    };
  }

  /**
   * Get all unique memories formatted for system prompt injection.
   * Merges local approved memories with EverMemOS memories,
   * deduplicates, and formats as markdown.
   */
  async getMemoriesForPrompt(agentId: string): Promise<string> {
    // Load local approved memories
    const localMemories = await this.localManager.loadApprovedMemories().catch((err) => {
      console.warn("[DualLayer] Failed to load local memories for prompt:", err);
      return [] as MemoryEntry[];
    });

    // Optionally fetch recent EverMemOS memories
    let everMemOSEntries: EverMemOSMemoryEntry[] = [];
    if (this.everMemOSClient) {
      const result = await this.everMemOSClient.search("*", {
        agentId,
        limit: 50,
      });
      everMemOSEntries = result.entries;
    }

    // Convert to unified format for dedup
    const localUnified: UnifiedMemoryEntry[] = localMemories.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: "local" as const,
      createdAt: m.createdAt,
    }));

    const remoteUnified: UnifiedMemoryEntry[] = everMemOSEntries.map((e) => ({
      id: e.id,
      content: e.content,
      category: e.category ?? "domain_knowledge",
      source: "evermemos" as const,
      score: e.score,
      createdAt: e.createdAt,
    }));

    const merged = deduplicateEntries([...localUnified, ...remoteUnified]);

    if (merged.length === 0) {
      return "";
    }

    // Group by category and format as markdown
    const byCategory: Record<string, UnifiedMemoryEntry[]> = {};
    for (const entry of merged) {
      const cat = entry.category || "domain_knowledge";
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(entry);
    }

    const categoryLabels: Record<string, string> = {
      visual_preferences: "Visual/Creative Preferences",
      communication_style: "Communication Style",
      workflow_patterns: "Workflow Patterns",
      domain_knowledge: "Domain Knowledge",
      business_rules: "Business Rules",
    };

    const sections: string[] = ["## Agent Memory\n"];

    for (const [category, entries] of Object.entries(byCategory)) {
      const label = categoryLabels[category] ?? category;
      sections.push(`### ${label}`);
      for (const entry of entries) {
        sections.push(`- ${entry.content}`);
      }
      sections.push(""); // Blank line between categories
    }

    return sections.join("\n").trim();
  }

  /**
   * Access the underlying local memory manager directly.
   */
  getLocalManager(): AgentMemoryManager {
    return this.localManager;
  }

  /**
   * Access the underlying EverMemOS client, if configured.
   */
  getEverMemOSClient(): EverMemOSClient | null {
    return this.everMemOSClient;
  }

  /**
   * Check whether EverMemOS is both configured and reachable.
   */
  async isEverMemOSAvailable(): Promise<boolean> {
    if (!this.everMemOSClient) {
      return false;
    }
    return this.everMemOSClient.healthCheck();
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Simple word-match filter for local memories against a query.
 * Returns true if the memory content shares any significant words with the query.
 */
function matchesQuery(content: string, query: string): boolean {
  // Wildcard matches everything
  if (query === "*") return true;

  const queryWords = normalizeToWords(query);
  const contentWords = normalizeToWords(content);

  if (queryWords.size === 0) return true;

  // At least one query word must appear in content
  for (const w of queryWords) {
    if (contentWords.has(w)) return true;
  }
  return false;
}

/**
 * Normalize a string to a Set of lowercase words (stripped of punctuation).
 */
function normalizeToWords(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1) // Skip single-character noise
  );
}

/**
 * Deduplicate unified memory entries by Jaccard similarity (> 0.85).
 * Earlier entries in the array take priority (local entries should come first).
 */
function deduplicateEntries(entries: UnifiedMemoryEntry[]): UnifiedMemoryEntry[] {
  const result: UnifiedMemoryEntry[] = [];

  for (const entry of entries) {
    const isDuplicate = result.some(
      (existing) => jaccardSimilarity(existing.content, entry.content) > 0.85
    );
    if (!isDuplicate) {
      result.push(entry);
    }
  }

  return result;
}

/**
 * Jaccard similarity on word sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = normalizeToWords(a);
  const wordsB = normalizeToWords(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

// Export helpers for testing
export { jaccardSimilarity, deduplicateEntries, matchesQuery };
