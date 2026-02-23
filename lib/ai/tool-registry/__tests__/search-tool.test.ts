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

  it("narrows mixed browser/web intents to related tools only", async () => {
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
      "webSearch",
      {
        displayName: "Web Search",
        category: "search",
        keywords: ["web", "browser", "internet"],
        shortDescription: "search the web",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "chromeDevtoolsNavigate",
      {
        displayName: "navigate_page (chrome-devtools)",
        category: "mcp",
        keywords: ["chrome", "browser", "navigate", "web"],
        shortDescription: "control chrome page navigation",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "editFile",
      {
        displayName: "Edit File",
        category: "knowledge",
        keywords: ["file", "edit", "patch"],
        shortDescription: "modify file content",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    registry.register(
      "scheduleTask",
      {
        displayName: "Schedule Task",
        category: "utility",
        keywords: ["schedule", "task", "cron"],
        shortDescription: "schedule future execution",
        loading: { deferLoading: true },
        requiresSession: false,
      },
      () => ({} as any)
    );

    const searchTool = createToolSearchTool({
      initialActiveTools: new Set(["searchTools"]),
      discoveredTools: new Set<string>(),
      enabledTools: new Set(["webSearch", "chromeDevtoolsNavigate", "editFile", "scheduleTask"]),
    }) as any;

    const result = await searchTool.execute({
      query: "browser, chrome, web search, search internet",
      limit: 20,
    });

    expect(result.status).toBe("success");
    const names = result.results.map((tool: { name: string }) => tool.name);
    expect(names).toContain("webSearch");
    expect(names).toContain("chromeDevtoolsNavigate");
    expect(names).not.toContain("editFile");
    expect(names).not.toContain("scheduleTask");
  });
});
