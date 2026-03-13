/**
 * Ghost Branch Prevention – Unit Tests
 *
 * Tests for the DB-level behavior that causes ghost branches when injected
 * messages are loaded mid-run during background processing.
 *
 * The ghost branch occurs when:
 *   1. A live prompt is injected mid-run (prepareStep splits the assistant message)
 *   2. The frontend reloads messages before isRunActiveRef is armed
 *   3. assistant-ui sees the split assistant + injected user as a branch fork
 *
 * These tests validate the DB message structure after injection and ensure the
 * injected messages are correctly marked with livePromptInjected metadata.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  createMessage,
  getMessages,
  getOrCreateLocalUser,
  deleteMessagesNotIn,
  getInjectedMessageIds,
  getSessionWithMessages,
} from "@/lib/db/queries";
import { nextOrderingIndex } from "@/lib/session/message-ordering";
import {
  convertDBMessagesToUIMessages,
  countVisibleConversationMessages,
} from "@/lib/messages/converter";

describe("Ghost Branch Prevention", () => {
  const TEST_USER_ID = "test-ghost-branch";
  const TEST_EMAIL = "ghost-branch@test.local";

  beforeEach(async () => {
    await getOrCreateLocalUser(TEST_USER_ID, TEST_EMAIL);
  });

  /**
   * Validates the core message structure after a live prompt injection.
   * prepareStep creates:
   *   - Pre-injection assistant (sealed, tagged livePromptInjected)
   *   - Injected user message (tagged livePromptInjected)
   *   - Post-injection assistant (new message, no injection tag)
   */
  it("should correctly structure messages after live prompt injection", async () => {
    const session = await createSession({ title: "Ghost Branch - Structure", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Original user message
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Original prompt" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    // Pre-injection assistant (sealed by prepareStep, tagged)
    const preInjectionAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "I was working on your request..." }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    // Injected user message (created by prepareStep)
    const injectedUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Also check the other file" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    // Post-injection assistant (continuation after injection)
    const postInjectionAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Sure, I'll also check that file." }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const allMessages = await getMessages(session.id);
    expect(allMessages).toHaveLength(4);

    // Verify ordering is correct
    expect(allMessages[0].role).toBe("user");
    expect(allMessages[1].role).toBe("assistant");
    expect(allMessages[2].role).toBe("user");
    expect(allMessages[3].role).toBe("assistant");

    // Verify injection metadata
    const msg1Meta = typeof allMessages[1].metadata === "string"
      ? JSON.parse(allMessages[1].metadata) : allMessages[1].metadata;
    expect(msg1Meta?.livePromptInjected).toBe(true);

    const msg2Meta = typeof allMessages[2].metadata === "string"
      ? JSON.parse(allMessages[2].metadata) : allMessages[2].metadata;
    expect(msg2Meta?.livePromptInjected).toBe(true);

    // Post-injection assistant should NOT have injection metadata
    const msg3Meta = typeof allMessages[3].metadata === "string"
      ? JSON.parse(allMessages[3].metadata) : allMessages[3].metadata;
    expect(msg3Meta?.livePromptInjected).not.toBe(true);
  });

  /**
   * getInjectedMessageIds should return both the sealed assistant and injected
   * user messages, so deleteMessagesNotIn doesn't delete them.
   */
  it("should return injected message IDs for both assistant and user injection messages", async () => {
    const session = await createSession({ title: "Ghost Branch - InjectedIds", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Original" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const preAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Working..." }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    const injectedUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Injected follow-up" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    const postAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Acknowledged." }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const injectedIds = await getInjectedMessageIds(session.id);

    expect(injectedIds).toContain(preAssistant!.id);
    expect(injectedIds).toContain(injectedUser!.id);
    // Post-injection assistant should NOT be in injected IDs
    expect(injectedIds).not.toContain(postAssistant!.id);
  });

  /**
   * deleteMessagesNotIn should NOT delete injection-tagged messages even when
   * the frontend doesn't know about them (they were created server-side).
   */
  it("should protect injected messages from deleteMessagesNotIn when added to keepIds", async () => {
    const session = await createSession({ title: "Ghost Branch - DeleteProtection", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const originalUser = await createMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Original" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const preAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Pre-injection content" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    const injectedUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Mid-run instruction" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    const postAssistant = await createMessage({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Post-injection content" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    // Frontend only knows about original user + post-injection assistant
    const frontendIds = new Set([originalUser!.id, postAssistant!.id]);

    // Add injected IDs (what the route does)
    const injectedIds = await getInjectedMessageIds(session.id);
    for (const id of injectedIds) {
      frontendIds.add(id);
    }

    const deleted = await deleteMessagesNotIn(session.id, frontendIds);
    expect(deleted).toBe(0);

    const remaining = await getMessages(session.id);
    expect(remaining).toHaveLength(4);
  });

  /**
   * UI conversion should hide the injected user message but show both
   * assistant segments — this is what prevents the ghost branch visually.
   */
  it("should hide injected user messages in UI conversion while showing both assistant segments", async () => {
    const session = await createSession({ title: "Ghost Branch - UIConversion", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Original prompt" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Pre-injection" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Injected mid-run" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Post-injection" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const dbMessages = await getMessages(session.id);
    const sessionWithMessages = await getSessionWithMessages(session.id);
    const uiMessages = convertDBMessagesToUIMessages(dbMessages as any);

    // Should show: original user, pre-injection assistant, post-injection assistant
    // Should hide: injected user message
    expect(sessionWithMessages?.session.messageCount).toBe(3);
    expect(countVisibleConversationMessages(dbMessages as any)).toBe(3);
    expect(uiMessages).toHaveLength(3);
    expect(uiMessages.map(m => m.role)).toEqual(["user", "assistant", "assistant"]);

    // The injected user message should NOT appear in UI
    const hasInjectedUser = uiMessages.some(m =>
      m.parts.some((p: any) => p.type === "text" && p.text === "Injected mid-run")
    );
    expect(hasInjectedUser).toBe(false);
  });

  /**
   * Multiple injections in a single run should all be handled correctly.
   */
  it("should handle multiple live prompt injections in a single run", async () => {
    const session = await createSession({ title: "Ghost Branch - MultiInjection", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Start task" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    // First injection
    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Working on step 1..." }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Also do X" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    // Second injection
    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Got it, doing X and step 2..." }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "And Y too" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    // Final assistant response
    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Done with everything including X and Y." }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const dbMessages = await getMessages(session.id);
    expect(dbMessages).toHaveLength(6);

    const injectedIds = await getInjectedMessageIds(session.id);
    // 4 injected: 2 sealed assistants + 2 injected users
    expect(injectedIds).toHaveLength(4);

    const uiMessages = convertDBMessagesToUIMessages(dbMessages as any);

    // Should show: original user + 2 sealed assistants + final assistant = 4
    // Should hide: 2 injected user messages
    expect(uiMessages.map(m => m.role)).not.toContain("user_injected");

    // No injected user content visible
    const hasInjectedContent = uiMessages.some(m =>
      m.parts.some((p: any) =>
        p.type === "text" && (p.text === "Also do X" || p.text === "And Y too")
      )
    );
    expect(hasInjectedContent).toBe(false);
  });

  /**
   * The ordering gap that occurs after injections should be detectable but
   * not cause issues with message retrieval.
   */
  it("should handle ordering gaps from deleted messages gracefully", async () => {
    const session = await createSession({ title: "Ghost Branch - OrderingGap", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Create messages with non-contiguous ordering (simulating post-cleanup state)
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Message 1" }],
      orderingIndex: 1,
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Message 2" }],
      orderingIndex: 2,
    });

    // Big gap (simulating many allocations that were deleted)
    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Message 3" }],
      orderingIndex: 1364,
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Message 4" }],
      orderingIndex: 1365,
    });

    const messages = await getMessages(session.id);
    expect(messages).toHaveLength(4);

    // Messages should be in correct order regardless of gap
    expect(messages[0].content[0].text).toBe("Message 1");
    expect(messages[1].content[0].text).toBe("Message 2");
    expect(messages[2].content[0].text).toBe("Message 3");
    expect(messages[3].content[0].text).toBe("Message 4");

    // UI conversion should work fine
    const uiMessages = convertDBMessagesToUIMessages(messages as any);
    expect(uiMessages).toHaveLength(4);
  });

  /**
   * Simulates the exact ghost branch scenario: messages loaded before
   * isRunActiveRef is set, then loaded again after. The injected messages
   * should produce a consistent message set both times.
   */
  it("should produce consistent UI messages regardless of load timing", async () => {
    const session = await createSession({ title: "Ghost Branch - Consistency", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Original" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Pre-injection segment" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Follow-up instruction" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Post-injection segment" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    // Load 1: simulating early load (before isRunActiveRef is set)
    const dbMessages1 = await getMessages(session.id);
    const uiMessages1 = convertDBMessagesToUIMessages(dbMessages1 as any);

    // Load 2: simulating late load (after run completes)
    const dbMessages2 = await getMessages(session.id);
    const uiMessages2 = convertDBMessagesToUIMessages(dbMessages2 as any);

    // Both loads should produce identical UI message sets
    expect(uiMessages1.length).toBe(uiMessages2.length);
    expect(uiMessages1.map(m => m.id)).toEqual(uiMessages2.map(m => m.id));
    expect(uiMessages1.map(m => m.role)).toEqual(uiMessages2.map(m => m.role));
  });

  /**
   * Edge case: injection happens but the run is cancelled before post-injection
   * assistant content is generated. The sealed assistant and injected user should
   * still be in the DB.
   */
  it("should preserve injection artifacts even when run is cancelled before post-injection content", async () => {
    const session = await createSession({ title: "Ghost Branch - Cancelled", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Start" }],
      orderingIndex: await nextOrderingIndex(session.id),
    });

    const sealedAssistant = await createMessage({
      sessionId: session.id,
      role: "assistant",
      content: [{ type: "text", text: "Was working but then cancelled" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    const injectedUser = await createMessage({
      sessionId: session.id,
      role: "user",
      content: [{ type: "text", text: "Do something else" }],
      orderingIndex: await nextOrderingIndex(session.id),
      metadata: { livePromptInjected: true },
    });

    // No post-injection assistant — run was cancelled

    const messages = await getMessages(session.id);
    expect(messages).toHaveLength(3);

    const injectedIds = await getInjectedMessageIds(session.id);
    expect(injectedIds).toContain(sealedAssistant!.id);
    expect(injectedIds).toContain(injectedUser!.id);

    // UI should show user + sealed assistant (injected user hidden)
    const uiMessages = convertDBMessagesToUIMessages(messages as any);
    expect(uiMessages).toHaveLength(2);
    expect(uiMessages[0].role).toBe("user");
    expect(uiMessages[1].role).toBe("assistant");
  });
});
