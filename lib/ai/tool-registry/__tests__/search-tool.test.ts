import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUtilityModel: vi.fn(() => "mock-model" as any),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  getUtilityModel: mocks.getUtilityModel,
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: mocks.generateObject,
  };
});


describe("createToolSearchTool utility routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.TOOL_SEARCH_ROUTER_MODEL;
  });

  it("promotes router direct matches to the top", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        directToolNames: ["vectorSearch"],
        normalizedQuery: "semantic search",
        relatedTerms: ["vector", "codebase"],
        rationale: "vector search is best",
      },
    });

    const { ToolRegistry } = await import("../registry");
    const { createToolSearchTool } = await import("../search-tool");

    ToolRegistry.reset();
    const registry = ToolRegistry.getInstance();

    registry.register(
      "searchTools",
      {
        displayName: "Search Tools",
        category: "utility",
        keywords: ["search"],
        shortDescription: "search tools",
        loading: { alwaysLoad: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "localGrep",
      {
        displayName: "Local Grep",
        category: "knowledge",
        keywords: ["grep", "pattern"],
        shortDescription: "exact text search",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "vectorSearch",
      {
        displayName: "Vector Search",
        category: "knowledge",
        keywords: ["semantic", "vector"],
        shortDescription: "semantic search",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    const searchTool = createToolSearchTool({
      initialActiveTools: new Set(["searchTools"]),
      discoveredTools: new Set<string>(),
      enabledTools: new Set(["localGrep", "vectorSearch"]),
    }) as any;

    const result = await searchTool.execute({ query: "semantic search", limit: 5 });

    expect(result.status).toBe("success");
    expect(result.results[0].name).toBe("vectorSearch");
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
  });

  it("skips router model when TOOL_SEARCH_ROUTER_MODEL=false", async () => {
    process.env.TOOL_SEARCH_ROUTER_MODEL = "false";

    const { ToolRegistry } = await import("../registry");
    const { createToolSearchTool } = await import("../search-tool");

    ToolRegistry.reset();
    const registry = ToolRegistry.getInstance();

    registry.register(
      "searchTools",
      {
        displayName: "Search Tools",
        category: "utility",
        keywords: ["search"],
        shortDescription: "search tools",
        loading: { alwaysLoad: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "localGrep",
      {
        displayName: "Local Grep",
        category: "knowledge",
        keywords: ["grep", "pattern"],
        shortDescription: "exact text search",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    const searchTool = createToolSearchTool({
      initialActiveTools: new Set(["searchTools"]),
      discoveredTools: new Set<string>(),
      enabledTools: new Set(["localGrep"]),
    }) as any;

    const result = await searchTool.execute({ query: "grep", limit: 5 });

    expect(result.status).toBe("success");
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
