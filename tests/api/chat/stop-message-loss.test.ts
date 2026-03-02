/**
 * Stop Message Loss — Regression & Verification Tests
 *
 * Root cause: The AI SDK's toUIMessageStreamResponse() generates its own UUID
 * for assistant messages, while createMessage() generates a different UUID.
 * When deleteMessagesNotIn() runs on the next turn, it sees the DB assistant
 * message ID as "unknown" and deletes it.
 *
 * Fix: Pre-generate a single assistantMessageId (crypto.randomUUID()) and pass
 * it to BOTH toUIMessageStreamResponse({ generateMessageId }) and the DB
 * createMessage({ id }). Frontend and DB now share the same UUID.
 *
 * Test structure:
 *   - "REGRESSION" tests verify the bug mechanism still exists at the function
 *     level (mismatched IDs → deletion). These document the dangerous behavior.
 *   - "FIX VERIFICATION" tests simulate the fixed flow (matching IDs → no deletion).
 *   - "CONTROL" test confirms deleteMessagesNotIn() works correctly with matching IDs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  createMessage,
  getMessages,
  getOrCreateLocalUser,
  deleteMessagesNotIn,
} from "@/lib/db/queries";

describe("Stop Message Loss — ID Mismatch Bug", () => {
  const TEST_USER_ID = "test-user-stop-loss";
  const TEST_EMAIL = "test-stop-loss@example.com";

  beforeEach(async () => {
    await getOrCreateLocalUser(TEST_USER_ID, TEST_EMAIL);
  });

  // ─── REGRESSION: Documents the dangerous behavior with mismatched IDs ──────

  it("REGRESSION: mismatched assistant IDs cause deletion (documents the bug mechanism)", async () => {
    const session = await createSession({ title: "Mismatch Regression", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const user1Id = crypto.randomUUID();
    await createMessage({ id: user1Id, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 1" }], orderingIndex: 1 });

    const serverAssistant1Id = crypto.randomUUID();
    await createMessage({ id: serverAssistant1Id, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 1" }], orderingIndex: 2 });

    // Frontend has a DIFFERENT UUID for the same assistant message
    const frontendAssistant1Id = crypto.randomUUID();
    const user2Id = crypto.randomUUID();
    const frontendIds = new Set([user1Id, frontendAssistant1Id, user2Id]);

    const deleted = await deleteMessagesNotIn(session.id, frontendIds);

    // With mismatched IDs, the assistant message IS deleted — this is the bug.
    // The fix prevents this scenario by ensuring IDs always match.
    expect(deleted).toBe(1);
    const remaining = await getMessages(session.id);
    expect(remaining.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  // ─── FIX VERIFICATION: Simulates the fixed flow with shared IDs ────────────

  it("FIX: single-turn — shared assistant ID prevents deletion", async () => {
    const session = await createSession({ title: "Fix Single Turn", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // Pre-generate a shared assistant message ID (what route.ts now does)
    const sharedAssistantId = crypto.randomUUID();

    const user1Id = crypto.randomUUID();
    await createMessage({ id: user1Id, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 1" }], orderingIndex: 1 });

    // DB uses the shared ID (via createMessage({ id: sharedAssistantId, ... }))
    await createMessage({ id: sharedAssistantId, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 1" }], orderingIndex: 2 });

    // Frontend also uses the shared ID (via generateMessageId: () => sharedAssistantId)
    const user2Id = crypto.randomUUID();
    const frontendIds = new Set([user1Id, sharedAssistantId, user2Id]);

    const deleted = await deleteMessagesNotIn(session.id, frontendIds);

    // With matching IDs, the assistant message is PRESERVED
    expect(deleted).toBe(0);
    const allMessages = await getMessages(session.id);
    expect(allMessages).toHaveLength(2);
    expect(allMessages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(allMessages[1]?.id).toBe(sharedAssistantId);
  });

  it("FIX: multi-turn — all assistant messages preserved across 3 turns", async () => {
    const session = await createSession({ title: "Fix Multi-Turn", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // ── Turn 1 ───────────────────────────────────────────────────────────
    const u1 = crypto.randomUUID();
    const sharedA1 = crypto.randomUUID(); // Pre-generated shared ID
    await createMessage({ id: u1, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 1" }], orderingIndex: 1 });
    await createMessage({ id: sharedA1, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 1" }], orderingIndex: 2 });

    // ── Turn 2: deleteMessagesNotIn uses matching IDs ─────────────────
    const u2 = crypto.randomUUID();
    const sharedA2 = crypto.randomUUID();
    await deleteMessagesNotIn(session.id, new Set([u1, sharedA1, u2]));
    await createMessage({ id: u2, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 2" }], orderingIndex: 3 });
    await createMessage({ id: sharedA2, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 2" }], orderingIndex: 4 });

    // ── Turn 3: deleteMessagesNotIn uses matching IDs ─────────────────
    const u3 = crypto.randomUUID();
    await deleteMessagesNotIn(session.id, new Set([u1, sharedA1, u2, sharedA2, u3]));
    await createMessage({ id: u3, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 3" }], orderingIndex: 5 });

    // Simulate Stop: onAbort saves system interruption message
    await createMessage({ sessionId: session.id, role: "system", content: [{ type: "text", text: "Process interrupted by user" }], orderingIndex: 6 });

    // ── Verify: ALL messages present, exact match to expected state ────
    const finalMessages = await getMessages(session.id);
    const roles = finalMessages.map((m) => m.role);
    const indices = finalMessages.map((m) => m.orderingIndex);

    expect(roles).toEqual(["user", "assistant", "user", "assistant", "user", "system"]);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("FIX: exact user-report scenario — all 6 messages preserved with correct indices", async () => {
    // Simulates the EXACT scenario from the user's bug report, but with the fix applied.
    const session = await createSession({ title: "Exact Report Fixed", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    // ── Turn 1 ──
    const u1 = crypto.randomUUID();
    const sharedA1 = crypto.randomUUID();
    await createMessage({ id: u1, sessionId: session.id, role: "user", content: [{ type: "text", text: "Fix the unanswered question progression bug (plan only)" }], orderingIndex: 1 });
    await createMessage({ id: sharedA1, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Here's the plan..." }], orderingIndex: 2 });

    // ── Turn 2: Frontend sends matching IDs ──
    const u2 = crypto.randomUUID();
    const sharedA2 = crypto.randomUUID();
    await deleteMessagesNotIn(session.id, new Set([u1, sharedA1, u2]));
    await createMessage({ id: u2, sessionId: session.id, role: "user", content: [{ type: "text", text: "implement, no need for a ticket" }], orderingIndex: 3 });
    await createMessage({ id: sharedA2, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Implementing now..." }], orderingIndex: 4 });

    // ── Turn 3: Frontend sends matching IDs ──
    const u3 = crypto.randomUUID();
    await deleteMessagesNotIn(session.id, new Set([u1, sharedA1, u2, sharedA2, u3]));
    await createMessage({ id: u3, sessionId: session.id, role: "user", content: [{ type: "text", text: "but shortcuts are not working any more after your change" }], orderingIndex: 5 });

    // ── Stop: system interruption ──
    await createMessage({ sessionId: session.id, role: "system", content: [{ type: "text", text: "Process interrupted by user" }], orderingIndex: 6 });

    // ── Verify ──
    const final = await getMessages(session.id);
    const finalRoles = final.map((m) => m.role);
    const finalIndices = final.map((m) => m.orderingIndex);

    console.log("Final DB state:", JSON.stringify({ roles: finalRoles, indices: finalIndices }));

    expect(finalRoles).toEqual(["user", "assistant", "user", "assistant", "user", "system"]);
    expect(finalIndices).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // ─── CONTROL ───────────────────────────────────────────────────────────────

  it("CONTROL: deleteMessagesNotIn preserves all messages when IDs match", async () => {
    const session = await createSession({ title: "Matching IDs Control", userId: TEST_USER_ID });
    if (!session) throw new Error("Failed to create session");

    const user1Id = crypto.randomUUID();
    await createMessage({ id: user1Id, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 1" }], orderingIndex: 1 });

    const asst1Id = crypto.randomUUID();
    await createMessage({ id: asst1Id, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 1" }], orderingIndex: 2 });

    const user2Id = crypto.randomUUID();
    await createMessage({ id: user2Id, sessionId: session.id, role: "user", content: [{ type: "text", text: "User 2" }], orderingIndex: 3 });

    const asst2Id = crypto.randomUUID();
    await createMessage({ id: asst2Id, sessionId: session.id, role: "assistant", content: [{ type: "text", text: "Asst 2" }], orderingIndex: 4 });

    const user3Id = crypto.randomUUID();
    const frontendIds = new Set([user1Id, asst1Id, user2Id, asst2Id, user3Id]);
    const deleted = await deleteMessagesNotIn(session.id, frontendIds);

    expect(deleted).toBe(0);
    const allMessages = await getMessages(session.id);
    expect(allMessages).toHaveLength(4);
    expect(allMessages.filter((m) => m.role === "assistant")).toHaveLength(2);
  });
});
