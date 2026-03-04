import { beforeEach, describe, expect, it, vi } from "vitest";

const withToolLoggingMock = vi.hoisted(() => vi.fn((_, __, fn) => fn));

vi.mock("@/lib/ai/tool-registry/logging", () => ({
  withToolLogging: withToolLoggingMock,
}));

import { createPromptLibraryTool } from "@/lib/ai/tools/prompt-library-tool";

describe("promptLibrary tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns categories sorted by count desc", async () => {
    const tool = createPromptLibraryTool({ sessionId: "sess-test" });

    const result = await tool.execute(
      { action: "categories" },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.success).toBe(true);
    expect(result.action).toBe("categories");
    expect(Array.isArray(result.categories)).toBe(true);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories[0].count).toBeGreaterThanOrEqual(result.categories[1].count);
  });

  it("returns previews for trending and caps by limit", async () => {
    const tool = createPromptLibraryTool({ sessionId: "sess-test" });

    const result = await tool.execute(
      { action: "trending", limit: 3 },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.success).toBe(true);
    expect(result.action).toBe("trending");
    expect(result.results).toHaveLength(3);
    expect(typeof result.results[0].promptPreview).toBe("string");
    expect(result.results[0].promptPreview.length).toBeLessThanOrEqual(203);
  });

  it("search requires non-empty query", async () => {
    const tool = createPromptLibraryTool({ sessionId: "sess-test" });

    const result = await tool.execute(
      { action: "search", query: "   ", limit: 2 },
      { toolCallId: "tc3", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.success).toBe(false);
    expect(result.action).toBe("search");
    expect(result.error).toContain("query is required");
  });

  it("get returns full prompt payload and format", async () => {
    const tool = createPromptLibraryTool({ sessionId: "sess-test" });

    const search = await tool.execute(
      { action: "trending", limit: 1 },
      { toolCallId: "tc4", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    const id = search.results[0].id;

    const result = await tool.execute(
      { action: "get", id },
      { toolCallId: "tc5", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.success).toBe(true);
    expect(result.action).toBe("get");
    expect(result.prompt.id).toBe(id);
    expect(typeof result.prompt.prompt).toBe("string");
    expect(["json", "text"]).toContain(result.prompt.format);
  });

  it("errors on unknown id for get", async () => {
    const tool = createPromptLibraryTool({ sessionId: "sess-test" });

    const result = await tool.execute(
      { action: "get", id: "does-not-exist" },
      { toolCallId: "tc6", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Prompt not found");
  });
});
