/**
 * EverMemOS Integration
 *
 * Optional shared memory layer that sits on top of Selene's per-agent
 * local memory system. When enabled, memories are stored both locally
 * and in EverMemOS, and searches query both sources.
 *
 * @example
 * ```typescript
 * import { DualLayerMemoryManager, EverMemOSClient } from "@/lib/agent-memory/evermemos";
 *
 * // Dual-layer usage (recommended)
 * const manager = new DualLayerMemoryManager("agent-123", {
 *   serverUrl: "http://localhost:8765",
 *   enabled: true,
 * });
 * await manager.storeMemory("User prefers dark mode", "visual_preferences", "agent-123");
 * const results = await manager.searchMemories("dark mode preferences");
 *
 * // Direct client usage
 * const client = new EverMemOSClient({ serverUrl: "http://localhost:8765", enabled: true });
 * const healthy = await client.healthCheck();
 * ```
 */

// Types
export type {
  EverMemOSConfig,
  EverMemOSMemoryEntry,
  EverMemOSSearchResult,
  EverMemOSStoreRequest,
  EverMemOSSearchOptions,
} from "./types";

// Client
export { EverMemOSClient } from "./client";

// Dual-layer manager
export {
  DualLayerMemoryManager,
  type UnifiedMemoryEntry,
  type DualLayerSearchResult,
} from "./dual-layer";
