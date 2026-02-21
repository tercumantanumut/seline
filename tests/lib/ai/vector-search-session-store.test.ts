import { beforeEach, describe, expect, it } from "vitest";

import {
  addSearchHistory,
  clearSession,
  getSearchHistory,
  getSessionStats,
  getVectorSearchSession,
} from "@/lib/ai/vector-search/session-store";

describe("vector search session store scoping", () => {
  beforeEach(() => {
    clearSession("vector:session-a");
    clearSession("vector:session-b");
  });

  it("isolates search history per session key", () => {
    addSearchHistory("vector:session-a", {
      query: "where is auth middleware",
      strategy: "semantic",
      resultsCount: 4,
    });

    addSearchHistory("vector:session-b", {
      query: "where is tool registry",
      strategy: "keyword",
      resultsCount: 2,
    });

    const historyA = getSearchHistory("vector:session-a", 5);
    const historyB = getSearchHistory("vector:session-b", 5);

    expect(historyA).toHaveLength(1);
    expect(historyB).toHaveLength(1);
    expect(historyA[0].query).toContain("auth middleware");
    expect(historyB[0].query).toContain("tool registry");
  });

  it("reuses the same session object per session key", () => {
    const first = getVectorSearchSession("vector:session-a", "char-1");
    const second = getVectorSearchSession("vector:session-a", "char-1");
    const other = getVectorSearchSession("vector:session-b", "char-1");

    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(other.id);
  });

  it("tracks stats across all isolated sessions", () => {
    addSearchHistory("vector:session-a", {
      query: "first",
      strategy: "semantic",
      resultsCount: 1,
    });
    addSearchHistory("vector:session-b", {
      query: "second",
      strategy: "hybrid",
      resultsCount: 2,
    });

    const stats = getSessionStats();

    expect(stats.totalSessions).toBeGreaterThanOrEqual(2);
    expect(stats.totalSearches).toBeGreaterThanOrEqual(2);
  });
});
