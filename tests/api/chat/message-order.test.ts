/**
 * Message Ordering Tests
 *
 * Tests for the bullet-proof message ordering system using orderingIndex.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  createMessage,
  getMessages,
  getOrCreateLocalUser,
  deleteMessagesNotIn,
} from "@/lib/db/queries";
import { nextOrderingIndex, allocateOrderingIndices, validateSessionOrdering } from "@/lib/session/message-ordering";
import { getSessionWithMessages } from "@/lib/db/queries-sessions";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";

describe("Message Ordering", () => {
  const TEST_USER_ID = "test-user";
  const TEST_EMAIL = "test@example.com";

  beforeEach(async () => {
    // Ensure test user exists for foreign key constraint
    await getOrCreateLocalUser(TEST_USER_ID, TEST_EMAIL);
  });

  it("should allocate monotonically increasing orderingIndex", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const index1 = await nextOrderingIndex(session.id);
    const index2 = await nextOrderingIndex(session.id);
    const index3 = await nextOrderingIndex(session.id);

    expect(index2).toBe(index1 + 1);
    expect(index3).toBe(index2 + 1);
  });

  it("should return messages in orderingIndex order regardless of createdAt", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Create messages with inverted timestamps but correct orderingIndex
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "First" }],
      orderingIndex: 1,
      createdAt: new Date(Date.now() + 1000).toISOString(), // Later timestamp
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Second" }],
      orderingIndex: 2,
      createdAt: new Date(Date.now() - 1000).toISOString(), // Earlier timestamp
    });

    const messages = await getMessages(session.id);
    expect(messages[0].content[0].text).toBe("First");
    expect(messages[1].content[0].text).toBe("Second");
  });

  it("should handle concurrent index allocation without collision", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Simulate concurrent allocations
    const allocations = await Promise.all([
      nextOrderingIndex(session.id),
      nextOrderingIndex(session.id),
      nextOrderingIndex(session.id),
      nextOrderingIndex(session.id),
      nextOrderingIndex(session.id),
    ]);

    // All should be unique
    const unique = new Set(allocations);
    expect(unique.size).toBe(allocations.length);

    // Should be sequential
    const sorted = [...allocations].sort((a, b) => a - b);
    expect(allocations).toEqual(sorted);
  });

  it("should allocate contiguous blocks with allocateOrderingIndices", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const block1 = await allocateOrderingIndices(session.id, 3);
    const block2 = await allocateOrderingIndices(session.id, 2);

    // First block should be contiguous
    expect(block1).toEqual([1, 2, 3]);

    // Second block should follow
    expect(block2).toEqual([4, 5]);
  });

  it("should validate session ordering without errors for valid sessions", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Create properly ordered messages
    for (let i = 1; i <= 5; i++) {
      await createMessage({
        sessionId: session.id,
        role: i % 2 === 1 ? "user" : "assistant",
        content: [{ type: "text", text: `Message ${i}` }],
        orderingIndex: i,
      });
    }

    const errors = await validateSessionOrdering(session.id);
    expect(errors).toHaveLength(0);
  });

  it("should detect gaps in ordering during validation", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Create messages with a gap
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Message 1" }],
      orderingIndex: 1,
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Message 3" }],
      orderingIndex: 3, // Gap: missing index 2
    });

    const errors = await validateSessionOrdering(session.id);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("Gap"))).toBe(true);
  });

  it("should detect duplicate indices during validation", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Create messages with duplicate indices
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Message 1a" }],
      orderingIndex: 1,
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Message 1b" }],
      orderingIndex: 1, // Duplicate
    });

    const errors = await validateSessionOrdering(session.id);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("should delete stale user/assistant messages while preserving tool/system messages", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const keepUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Keep user" }],
      orderingIndex: 1,
    });

    const keepAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Keep assistant" }],
      orderingIndex: 2,
    });

    const deleteUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Delete me" }],
      orderingIndex: 3,
    });

    const deleteAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Delete me too" }],
      orderingIndex: 4,
    });

    const keepTool = await createMessage({
      sessionId: session.id,
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "t1", result: { ok: true } }],
      orderingIndex: 5,
    });

    const keepSystem = await createMessage({
      sessionId: session.id,
      role: "system",
      content: [{ type: "text", text: "System note" }],
      orderingIndex: 6,
    });

    expect(keepUser?.id).toBeTruthy();
    expect(keepAssistant?.id).toBeTruthy();
    expect(deleteUser?.id).toBeTruthy();
    expect(deleteAssistant?.id).toBeTruthy();
    expect(keepTool?.id).toBeTruthy();
    expect(keepSystem?.id).toBeTruthy();

    const deleted = await deleteMessagesNotIn(
      session.id,
      new Set([
        keepUser!.id,
        keepAssistant!.id,
      ])
    );

    // Keep-set stops at orderingIndex 2, so newer stale user/assistant suffix is deleted.
    expect(deleted).toBe(2);

    const remaining = await getMessages(session.id);
    const remainingIds = new Set(remaining.map((m) => m.id));

    expect(remainingIds.has(keepUser!.id)).toBe(true);
    expect(remainingIds.has(keepAssistant!.id)).toBe(true);
    expect(remainingIds.has(deleteUser!.id)).toBe(false);
    expect(remainingIds.has(deleteAssistant!.id)).toBe(false);
    expect(remainingIds.has(keepTool!.id)).toBe(true);
    expect(remainingIds.has(keepSystem!.id)).toBe(true);
  });

  it("should return session messages ordered by orderingIndex in getSessionWithMessages", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const sharedCreatedAt = new Date().toISOString();

    const second = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Second" }],
      orderingIndex: 2,
      createdAt: sharedCreatedAt,
    });

    const first = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "First" }],
      orderingIndex: 1,
      createdAt: sharedCreatedAt,
    });

    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();

    const sessionWithMessages = await getSessionWithMessages(session.id);
    expect(sessionWithMessages).toBeTruthy();

    const ordered = sessionWithMessages?.messages ?? [];
    expect(ordered[0]?.id).toBe(first!.id);
    expect(ordered[1]?.id).toBe(second!.id);
  });

  it("should keep user messages visible after stale-message cleanup when older tool calls are absent from keepIds", async () => {
    const session = await createSession({ title: "Test", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const olderUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Older user" }],
      orderingIndex: 1,
    });

    const staleAssistantToolCall = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "executeCommand",
          args: { command: "echo", args: ["ok"] },
          state: "input-available",
        },
      ],
      orderingIndex: 2,
    });

    const latestAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Latest assistant" }],
      orderingIndex: 3,
    });

    expect(olderUser?.id).toBeTruthy();
    expect(staleAssistantToolCall?.id).toBeTruthy();
    expect(latestAssistant?.id).toBeTruthy();

    const deleted = await deleteMessagesNotIn(
      session.id,
      new Set([
        olderUser!.id,
        latestAssistant!.id,
      ])
    );

    expect(deleted).toBe(0);

    const persisted = await getMessages(session.id);
    const uiMessages = convertDBMessagesToUIMessages(persisted as any);

    expect(uiMessages.map((msg) => msg.id)).toContain(olderUser!.id);
    expect(uiMessages.map((msg) => msg.id)).toContain(latestAssistant!.id);
  });
});
