import { describe, expect, it } from "vitest";
import { computeSessionAnalytics } from "@/lib/analytics/session-analytics";

describe("session analytics cache aggregation", () => {
  it("aggregates cache metrics from assistant messages only", () => {
    const session = {
      id: "session-1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:10Z",
    };

    const messages = [
      {
        id: "msg-user-1",
        role: "user" as const,
        content: [{ type: "text", text: "hello" }],
        createdAt: "2024-01-01T00:00:01Z",
      },
      {
        id: "msg-assistant-1",
        role: "assistant" as const,
        content: [{ type: "text", text: "hi" }],
        tokenCount: 15,
        createdAt: "2024-01-01T00:00:02Z",
        metadata: {
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          cache: {
            cacheReadTokens: 100,
            cacheWriteTokens: 20,
            estimatedSavingsUsd: 0.00027,
            systemBlocksCached: 1,
            messagesCached: 2,
          },
        },
      },
      {
        id: "msg-assistant-2",
        role: "assistant" as const,
        content: [{ type: "text", text: "bye" }],
        tokenCount: 10,
        createdAt: "2024-01-01T00:00:03Z",
        metadata: {
          usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
          cache: {
            cacheReadTokens: 50,
            cacheWriteTokens: 10,
            estimatedSavingsUsd: 0.000135,
            systemBlocksCached: 0,
            messagesCached: 1,
          },
        },
      },
    ];

    const analytics = computeSessionAnalytics(session, messages);

    expect(analytics.tokenUsage.totalInputTokens).toBe(14);
    expect(analytics.tokenUsage.totalOutputTokens).toBe(11);
    expect(analytics.tokenUsage.totalTokens).toBe(25);

    expect(analytics.cache.cacheReadTokens).toBe(150);
    expect(analytics.cache.cacheWriteTokens).toBe(30);
    expect(analytics.cache.systemBlocksCached).toBe(1);
    expect(analytics.cache.messagesCached).toBe(3);
    expect(analytics.cache.estimatedSavingsUsd).toBeCloseTo(0.000405, 6);
  });
});
