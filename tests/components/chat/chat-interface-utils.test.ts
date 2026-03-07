import { describe, expect, it } from "vitest";
import {
  getSessionActivityTimestamp,
  sortSessionsByUpdatedAt,
} from "@/components/chat/chat-interface-utils";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";

function createSession(overrides: Partial<SessionInfo> & Pick<SessionInfo, "id">): SessionInfo {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    characterId: overrides.characterId ?? "character-1",
    createdAt: overrides.createdAt ?? "2026-03-07T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-07T08:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? null,
    messageCount: overrides.messageCount ?? 0,
    totalTokenCount: overrides.totalTokenCount ?? 0,
    channelType: overrides.channelType ?? null,
    hasActiveRun: overrides.hasActiveRun ?? false,
    metadata: overrides.metadata ?? {},
  };
}

describe("chat session ordering helpers", () => {
  it("prefers lastMessageAt over updatedAt when sorting session recency", () => {
    const reorderedByToolChurn = createSession({
      id: "tool-churn",
      updatedAt: "2026-03-07T10:05:00.000Z",
      lastMessageAt: "2026-03-07T10:00:00.000Z",
    });
    const realLatestConversation = createSession({
      id: "real-latest",
      updatedAt: "2026-03-07T10:01:00.000Z",
      lastMessageAt: "2026-03-07T10:01:00.000Z",
    });

    const ordered = sortSessionsByUpdatedAt([reorderedByToolChurn, realLatestConversation]);

    expect(ordered.map((session) => session.id)).toEqual(["real-latest", "tool-churn"]);
  });

  it("falls back to updatedAt when no lastMessageAt exists", () => {
    const session = createSession({
      id: "fallback",
      updatedAt: "2026-03-07T09:30:00.000Z",
      lastMessageAt: null,
    });

    expect(getSessionActivityTimestamp(session)).toBe("2026-03-07T09:30:00.000Z");
  });
});
