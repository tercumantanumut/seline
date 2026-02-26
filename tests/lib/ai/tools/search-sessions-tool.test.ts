import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  listSessionsPaginated: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  withToolLogging: vi.fn(
    (_toolName: string, _sessionId: string | undefined, executeFn: (args: any, options?: any) => Promise<any>) =>
      (args: any, options?: any) => executeFn(args, options)
  ),
}));

vi.mock("@/lib/db/queries", () => ({
  listSessionsPaginated: dbMocks.listSessionsPaginated,
}));

vi.mock("@/lib/ai/tool-registry/logging", () => ({
  withToolLogging: loggingMocks.withToolLogging,
}));

import { createSearchSessionsTool } from "@/lib/ai/tools/search-sessions-tool";

function createTool() {
  return createSearchSessionsTool({
    sessionId: "sess-1",
    userId: "user-1",
  });
}

describe("searchSessions tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to message-content search and forwards character/channel filters", async () => {
    dbMocks.listSessionsPaginated.mockResolvedValue({
      totalCount: 1,
      sessions: [
        {
          id: "s1",
          title: "Debugging sessions",
          summary: "x".repeat(350),
          metadata: { characterName: "Session Search", pinned: true },
          channelType: "slack",
          messageCount: 42,
          lastMessageAt: "2026-02-25T10:00:00.000Z",
        },
      ],
    });

    const tool = createTool();
    const result = await tool.execute(
      {
        query: "what we did yesterday",
        characterName: "Session Search",
        channelType: "slack",
      },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(dbMocks.listSessionsPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        search: "what we did yesterday",
        characterName: "Session Search",
        channelType: "slack",
        searchInMessages: true,
      })
    );

    expect(result.status).toBe("success");
    expect(result.totalCount).toBe(1);
    expect(result.returned).toBe(1);
    expect(result.sessions[0]).toMatchObject({
      id: "s1",
      title: "Debugging sessions",
      agent: "Session Search",
      channel: "slack",
      pinned: true,
      messageCount: 42,
    });
    expect(result.sessions[0].summary.endsWith("…")).toBe(true);
  });

  it("respects includeMessageContent=false and clamps limit", async () => {
    dbMocks.listSessionsPaginated.mockResolvedValue({
      totalCount: 0,
      sessions: [],
    });

    const tool = createTool();
    await tool.execute(
      {
        query: "exact title only",
        includeMessageContent: false,
        limit: 999,
        channelType: "discord",
      },
      { toolCallId: "tc-2", messages: [], abortSignal: new AbortController().signal }
    );

    expect(dbMocks.listSessionsPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "exact title only",
        searchInMessages: false,
        channelType: "discord",
        limit: 50,
      })
    );
  });
});
