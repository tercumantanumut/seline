/**
 * Message Ordering Tests
 *
 * Tests for the bullet-proof message ordering system using orderingIndex.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createSession, createMessage, getMessages } from "@/lib/db/queries";
import { nextOrderingIndex, allocateOrderingIndices, validateSessionOrdering } from "@/lib/session/message-ordering";

describe("Message Ordering", () => {
  beforeEach(async () => {
    // Clean up test data if needed
  });

  it("should allocate monotonically increasing orderingIndex", async () => {
    const session = await createSession({ title: "Test", userId: "test-user" });
    if (!session) throw new Error("Failed to create session");

    const index1 = await nextOrderingIndex(session.id);
    const index2 = await nextOrderingIndex(session.id);
    const index3 = await nextOrderingIndex(session.id);

    expect(index2).toBe(index1 + 1);
    expect(index3).toBe(index2 + 1);
  });

  it("should return messages in orderingIndex order regardless of createdAt", async () => {
    const session = await createSession({ title: "Test", userId: "test-user" });
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
    const session = await createSession({ title: "Test", userId: "test-user" });
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
    const session = await createSession({ title: "Test", userId: "test-user" });
    if (!session) throw new Error("Failed to create session");

    const block1 = await allocateOrderingIndices(session.id, 3);
    const block2 = await allocateOrderingIndices(session.id, 2);

    // First block should be contiguous
    expect(block1).toEqual([1, 2, 3]);

    // Second block should follow
    expect(block2).toEqual([4, 5]);
  });

  it("should validate session ordering without errors for valid sessions", async () => {
    const session = await createSession({ title: "Test", userId: "test-user" });
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
    const session = await createSession({ title: "Test", userId: "test-user" });
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
    const session = await createSession({ title: "Test", userId: "test-user" });
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
});
