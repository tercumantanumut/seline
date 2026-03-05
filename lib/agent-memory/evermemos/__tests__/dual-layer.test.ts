import { describe, it, expect, vi, beforeEach } from "vitest";
import { DualLayerMemoryManager, jaccardSimilarity, deduplicateEntries, matchesQuery } from "../dual-layer";
import type { UnifiedMemoryEntry } from "../dual-layer";

// ============================================================================
// Mock dependencies
// ============================================================================

// Mock AgentMemoryManager
const mockLoadApprovedMemories = vi.fn();
const mockAddMemory = vi.fn();
vi.mock("../../memory-manager", () => {
  return {
    AgentMemoryManager: class MockAgentMemoryManager {
      loadApprovedMemories = mockLoadApprovedMemories;
      addMemory = mockAddMemory;
    },
  };
});

// Mock EverMemOSClient
const mockSearch = vi.fn();
const mockStore = vi.fn();
const mockHealthCheck = vi.fn();
const mockIsEnabled = vi.fn();
vi.mock("../client", () => {
  return {
    EverMemOSClient: class MockEverMemOSClient {
      search = mockSearch;
      store = mockStore;
      healthCheck = mockHealthCheck;
      isEnabled = mockIsEnabled;
    },
  };
});

function makeLocalMemory(id: string, content: string, category = "domain_knowledge") {
  return {
    id,
    content,
    category,
    reasoning: "",
    confidence: 1.0,
    importance: 1.0,
    factors: { repetition: 1, impact: 1, specificity: 1, recency: 1, conflictResolution: 0 },
    status: "approved" as const,
    source: "manual" as const,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function makeEverMemEntry(id: string, content: string, category = "domain_knowledge", score = 0.9) {
  return { id, content, category, createdAt: "2025-01-01T00:00:00Z", score };
}

describe("DualLayerMemoryManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadApprovedMemories.mockResolvedValue([]);
    mockAddMemory.mockImplementation(async (input: Record<string, unknown>) => ({
      id: "local-new",
      ...input,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    }));
    mockSearch.mockResolvedValue({ entries: [], query: "", totalResults: 0 });
    mockStore.mockResolvedValue({ id: "evermem-new", content: "", createdAt: new Date().toISOString() });
    mockHealthCheck.mockResolvedValue(true);
    mockIsEnabled.mockReturnValue(true);
  });

  // =========================================================================
  // storeMemory
  // =========================================================================
  describe("storeMemory", () => {
    it("stores to both local and EverMemOS", async () => {
      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const result = await manager.storeMemory(
        "User prefers dark mode",
        "visual_preferences",
        "agent-1",
        { reasoning: "User stated preference", sessionId: "sess-1" }
      );

      // Local store should be called
      expect(mockAddMemory).toHaveBeenCalledOnce();
      const localInput = mockAddMemory.mock.calls[0][0];
      expect(localInput.content).toBe("User prefers dark mode");
      expect(localInput.category).toBe("visual_preferences");
      expect(localInput.status).toBe("approved");
      expect(localInput.source).toBe("manual");

      // Result should be the local entry
      expect(result.id).toBe("local-new");

      // EverMemOS store should be called (fire-and-forget)
      // Wait for the promise to resolve
      await vi.waitFor(() => {
        expect(mockStore).toHaveBeenCalledOnce();
      });
      const storeArgs = mockStore.mock.calls[0][0];
      expect(storeArgs.content).toContain("User prefers dark mode");
      expect(storeArgs.agentId).toBe("agent-1");
    });

    it("stores locally even when EverMemOS is not configured", async () => {
      const manager = new DualLayerMemoryManager("char-1");

      const result = await manager.storeMemory(
        "Some fact",
        "domain_knowledge",
        "agent-1"
      );

      expect(mockAddMemory).toHaveBeenCalledOnce();
      expect(result.id).toBe("local-new");
      expect(mockStore).not.toHaveBeenCalled();
    });

    it("stores locally even when EverMemOS store fails", async () => {
      mockStore.mockRejectedValueOnce(new Error("Network failure"));

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      // Should not throw
      const result = await manager.storeMemory(
        "Important fact",
        "domain_knowledge",
        "agent-1"
      );

      expect(result.id).toBe("local-new");
      expect(mockAddMemory).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // searchMemories
  // =========================================================================
  describe("searchMemories", () => {
    it("merges results from both layers", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "User prefers dark mode", "visual_preferences"),
        makeLocalMemory("l2", "Use TypeScript for all projects", "workflow_patterns"),
      ]);

      mockSearch.mockResolvedValueOnce({
        entries: [
          makeEverMemEntry("e1", "Dark mode is preferred for all UI work", "visual_preferences"),
          makeEverMemEntry("e2", "Meeting notes from last Tuesday", "domain_knowledge"),
        ],
        query: "dark mode",
        totalResults: 2,
      });

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const result = await manager.searchMemories("dark mode");

      expect(result.everMemOSAvailable).toBe(true);
      expect(result.localCount).toBeGreaterThanOrEqual(1);
      expect(result.everMemOSCount).toBe(2);
      // Should have entries from both sources
      expect(result.entries.length).toBeGreaterThanOrEqual(1);
    });

    it("deduplicates similar entries (local takes priority)", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "User prefers dark mode for designs", "visual_preferences"),
      ]);

      mockSearch.mockResolvedValueOnce({
        entries: [
          // Very similar content -- should be deduped
          makeEverMemEntry("e1", "User prefers dark mode for designs", "visual_preferences"),
        ],
        query: "dark mode",
        totalResults: 1,
      });

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const result = await manager.searchMemories("dark mode");

      // The duplicate EverMemOS entry should be removed; only local survives
      const ids = result.entries.map((e) => e.id);
      expect(ids).toContain("l1");
      expect(ids).not.toContain("e1");
    });

    it("works with only local (EverMemOS down)", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "Dark mode preference", "visual_preferences"),
      ]);
      mockSearch.mockRejectedValueOnce(new Error("Connection refused"));

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const result = await manager.searchMemories("dark mode");

      expect(result.everMemOSAvailable).toBe(false);
      expect(result.localCount).toBeGreaterThanOrEqual(1);
      expect(result.entries.length).toBeGreaterThanOrEqual(1);
    });

    it("works with only local (EverMemOS not configured)", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "Some domain fact", "domain_knowledge"),
      ]);

      const manager = new DualLayerMemoryManager("char-1");
      const result = await manager.searchMemories("domain fact");

      expect(result.everMemOSAvailable).toBe(false);
      expect(result.everMemOSCount).toBe(0);
      expect(result.entries.length).toBeGreaterThanOrEqual(1);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it("handles local memory load failure gracefully", async () => {
      mockLoadApprovedMemories.mockRejectedValueOnce(new Error("Disk read error"));
      mockSearch.mockResolvedValueOnce({
        entries: [makeEverMemEntry("e1", "Some EverMemOS memory")],
        query: "test",
        totalResults: 1,
      });

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const result = await manager.searchMemories("test");

      // Should still return EverMemOS results
      expect(result.localCount).toBe(0);
      expect(result.everMemOSCount).toBe(1);
    });
  });

  // =========================================================================
  // getMemoriesForPrompt
  // =========================================================================
  describe("getMemoriesForPrompt", () => {
    it("formats merged memories as markdown", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "User prefers dark mode", "visual_preferences"),
        makeLocalMemory("l2", "Always use TypeScript", "workflow_patterns"),
      ]);

      mockSearch.mockResolvedValueOnce({
        entries: [
          makeEverMemEntry("e1", "User's name is Alice", "domain_knowledge"),
        ],
        query: "*",
        totalResults: 1,
      });

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const markdown = await manager.getMemoriesForPrompt("agent-1");

      expect(markdown).toContain("## Agent Memory");
      expect(markdown).toContain("### Visual/Creative Preferences");
      expect(markdown).toContain("- User prefers dark mode");
      expect(markdown).toContain("### Workflow Patterns");
      expect(markdown).toContain("- Always use TypeScript");
      expect(markdown).toContain("### Domain Knowledge");
      expect(markdown).toContain("- User's name is Alice");
    });

    it("returns empty string when no memories exist", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([]);
      mockSearch.mockResolvedValueOnce({ entries: [], query: "*", totalResults: 0 });

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      const markdown = await manager.getMemoriesForPrompt("agent-1");
      expect(markdown).toBe("");
    });

    it("works without EverMemOS configured", async () => {
      mockLoadApprovedMemories.mockResolvedValueOnce([
        makeLocalMemory("l1", "Local only memory", "domain_knowledge"),
      ]);

      const manager = new DualLayerMemoryManager("char-1");
      const markdown = await manager.getMemoriesForPrompt("agent-1");

      expect(markdown).toContain("- Local only memory");
      expect(mockSearch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // isEverMemOSAvailable
  // =========================================================================
  describe("isEverMemOSAvailable", () => {
    it("returns true when EverMemOS is healthy", async () => {
      mockHealthCheck.mockResolvedValueOnce(true);

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      expect(await manager.isEverMemOSAvailable()).toBe(true);
    });

    it("returns false when EverMemOS is not configured", async () => {
      const manager = new DualLayerMemoryManager("char-1");
      expect(await manager.isEverMemOSAvailable()).toBe(false);
    });

    it("returns false when EverMemOS is unhealthy", async () => {
      mockHealthCheck.mockResolvedValueOnce(false);

      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });

      expect(await manager.isEverMemOSAvailable()).toBe(false);
    });
  });

  // =========================================================================
  // Accessor methods
  // =========================================================================
  describe("accessor methods", () => {
    it("getLocalManager returns the AgentMemoryManager instance", () => {
      const manager = new DualLayerMemoryManager("char-1");
      expect(manager.getLocalManager()).toBeDefined();
    });

    it("getEverMemOSClient returns null when not configured", () => {
      const manager = new DualLayerMemoryManager("char-1");
      expect(manager.getEverMemOSClient()).toBeNull();
    });

    it("getEverMemOSClient returns client when configured", () => {
      const manager = new DualLayerMemoryManager("char-1", {
        serverUrl: "http://localhost:8765",
        enabled: true,
      });
      expect(manager.getEverMemOSClient()).not.toBeNull();
    });
  });
});

// ============================================================================
// Exported helper tests
// ============================================================================
describe("jaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSimilarity("hello world foo", "hello world foo")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(jaccardSimilarity("alpha beta gamma", "delta epsilon zeta")).toBe(0);
  });

  it("returns 1 for two empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(1);
  });

  it("returns 0 when one string is empty", () => {
    expect(jaccardSimilarity("hello world foo", "")).toBe(0);
  });

  it("returns partial similarity for overlapping content", () => {
    const sim = jaccardSimilarity(
      "user prefers dark mode designs",
      "user prefers light mode designs"
    );
    // "user", "prefers", "mode", "designs" overlap; "dark" vs "light" differ
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1.0);
  });
});

describe("deduplicateEntries", () => {
  function entry(id: string, content: string): UnifiedMemoryEntry {
    return { id, content, category: "domain_knowledge", source: "local", createdAt: "2025-01-01T00:00:00Z" };
  }

  it("keeps unique entries", () => {
    const entries = [
      entry("1", "Alpha beta gamma delta"),
      entry("2", "Epsilon zeta eta theta"),
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(2);
  });

  it("removes near-duplicate entries (keeps first)", () => {
    const entries = [
      entry("1", "User prefers dark mode for all designs"),
      entry("2", "User prefers dark mode for all designs work"),
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("handles empty input", () => {
    expect(deduplicateEntries([])).toHaveLength(0);
  });
});

describe("matchesQuery", () => {
  it("matches when query words appear in content", () => {
    expect(matchesQuery("User prefers dark mode for all UI", "dark mode")).toBe(true);
  });

  it("does not match when no query words appear", () => {
    expect(matchesQuery("User prefers light mode", "dark theme")).toBe(false);
  });

  it("wildcard matches everything", () => {
    expect(matchesQuery("anything at all", "*")).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesQuery("anything at all", "")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(matchesQuery("User prefers DARK mode", "dark mode")).toBe(true);
  });

  it("matches 2-char technical terms like UI", () => {
    expect(matchesQuery("User prefers dark mode for all UI components", "UI")).toBe(true);
  });
});
