import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => {
  const tavilyProvider = {
    name: "tavily",
    isAvailable: vi.fn(() => true),
    search: vi.fn(),
  };

  const duckduckgoProvider = {
    name: "duckduckgo",
    isAvailable: vi.fn(() => true),
    search: vi.fn(),
  };

  return {
    tavilyProvider,
    duckduckgoProvider,
    getSearchProvider: vi.fn((override?: "tavily" | "duckduckgo" | "auto") => {
      if (override === "duckduckgo") return duckduckgoProvider;
      if (override === "tavily") return tavilyProvider;
      return tavilyProvider;
    }),
    getWebSearchProviderStatus: vi.fn(() => ({
      configuredProvider: "auto",
      activeProvider: "tavily",
      available: true,
      tavilyConfigured: true,
      enhanced: true,
      supportsAnswerSummary: true,
      isFallback: false,
    })),
    isAnySearchProviderAvailable: vi.fn(() => true),
  };
});

vi.mock("@/lib/ai/web-search/providers", () => ({
  getSearchProvider: providerMocks.getSearchProvider,
  getWebSearchProviderStatus: providerMocks.getWebSearchProviderStatus,
  isAnySearchProviderAvailable: providerMocks.isAnySearchProviderAvailable,
}));

const browseMocks = vi.hoisted(() => ({
  browseAndSynthesize: vi.fn(),
}));

vi.mock("@/lib/ai/web-browse", () => ({
  browseAndSynthesize: browseMocks.browseAndSynthesize,
}));

import { createWebSearchTool } from "@/lib/ai/web-search";

describe("createWebSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    providerMocks.getWebSearchProviderStatus.mockReturnValue({
      configuredProvider: "auto",
      activeProvider: "tavily",
      available: true,
      tavilyConfigured: true,
      enhanced: true,
      supportsAnswerSummary: true,
      isFallback: false,
    });

    providerMocks.tavilyProvider.search.mockResolvedValue({
      sources: [],
      providerUsed: "tavily",
      error: "Tavily search failed: 401",
    });

    providerMocks.duckduckgoProvider.search.mockResolvedValue({
      sources: [
        {
          url: "https://www.fenerbahce.org/",
          title: "Fenerbahce",
          snippet: "Official website",
          relevanceScore: 0.99,
        },
      ],
      providerUsed: "duckduckgo",
    });

    browseMocks.browseAndSynthesize.mockResolvedValue({
      success: true,
      synthesis: "Synthesis",
      fetchedUrls: ["https://www.fenerbahce.org/"],
      failedUrls: [],
    });
  });

  it("falls back to DuckDuckGo in auto mode when Tavily fails", async () => {
    const tool = createWebSearchTool();

    const result = await tool.execute(
      { query: "Fenerbahce", maxResults: 5, includeAnswer: true },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(providerMocks.tavilyProvider.search).toHaveBeenCalledTimes(1);
    expect(providerMocks.duckduckgoProvider.search).toHaveBeenCalledTimes(1);
    expect(providerMocks.duckduckgoProvider.search).toHaveBeenCalledWith(
      "Fenerbahce",
      expect.objectContaining({ includeAnswer: false, searchDepth: "basic" })
    );

    expect(result.status).toBe("success");
    expect(result.provider).toBe("duckduckgo");
    expect(result.sources).toHaveLength(1);
    expect(browseMocks.browseAndSynthesize).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe("Synthesis");
  });

  it("does not fallback when Tavily is explicitly selected", async () => {
    providerMocks.getWebSearchProviderStatus.mockReturnValue({
      configuredProvider: "tavily",
      activeProvider: "tavily",
      available: true,
      tavilyConfigured: true,
      enhanced: true,
      supportsAnswerSummary: true,
      isFallback: false,
    });

    const tool = createWebSearchTool();
    const result = await tool.execute(
      { query: "Fenerbahce" },
      { toolCallId: "tc-2", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(providerMocks.tavilyProvider.search).toHaveBeenCalledTimes(1);
    expect(providerMocks.duckduckgoProvider.search).not.toHaveBeenCalled();
    expect(result.provider).toBe("tavily");
    expect(result.sources).toHaveLength(0);
    expect(browseMocks.browseAndSynthesize).not.toHaveBeenCalled();
  });

  it("supports direct URL mode without running search providers", async () => {
    const tool = createWebSearchTool({ sessionId: "session-1", userId: "user-1", characterId: null });

    const result = await tool.execute(
      { query: "Summarize this", urls: ["https://example.com/page"] },
      { toolCallId: "tc-3", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(providerMocks.tavilyProvider.search).not.toHaveBeenCalled();
    expect(providerMocks.duckduckgoProvider.search).not.toHaveBeenCalled();
    expect(browseMocks.browseAndSynthesize).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("direct-urls");
    expect(result.sources).toHaveLength(1);
    expect(result.answer).toBe("Synthesis");
  });
});
