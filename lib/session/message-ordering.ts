/**
 * Message Ordering Utilities
 *
 * Provides atomic allocation of ordering indices within a session.
 * This ensures bullet-proof message ordering regardless of timestamps.
 *
 * Uses a session-level counter (lastOrderingIndex) for true atomicity.
 */

import { db } from "@/lib/db/sqlite-client";
import { messages, sessions } from "@/lib/db/sqlite-schema";
import { eq, sql } from "drizzle-orm";

/**
 * Get the next ordering index for a session.
 * Uses database-level atomicity (UPDATE...RETURNING) to prevent race conditions.
 *
 * This is the ONLY way to allocate ordering indices - never calculate manually.
 */
export async function nextOrderingIndex(sessionId: string): Promise<number> {
  // Atomic increment using UPDATE...RETURNING
  // This ensures that concurrent requests get unique, sequential indices
  const result = await db
    .update(sessions)
    .set({
      lastOrderingIndex: sql`${sessions.lastOrderingIndex} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ nextIndex: sessions.lastOrderingIndex });

  const nextIndex = result[0]?.nextIndex;

  if (nextIndex === undefined || nextIndex === null) {
    throw new Error(`Failed to allocate ordering index for session ${sessionId}`);
  }

  return nextIndex;
}

/**
 * Allocate a block of ordering indices for a session.
 * Use this when you need to reserve multiple indices atomically
 * (e.g., for user + assistant + tool-result in a single turn).
 *
 * Returns an array of [startIndex, startIndex+1, ..., startIndex+count-1]
 */
export async function allocateOrderingIndices(
  sessionId: string,
  count: number
): Promise<number[]> {
  if (count <= 0) {
    throw new Error("Count must be positive");
  }

  // Allocate a block by incrementing by count
  const result = await db
    .update(sessions)
    .set({
      lastOrderingIndex: sql`${sessions.lastOrderingIndex} + ${count}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ nextIndex: sessions.lastOrderingIndex });

  const endIndex = result[0]?.nextIndex;

  if (endIndex === undefined || endIndex === null) {
    throw new Error(`Failed to allocate ordering indices for session ${sessionId}`);
  }

  // Calculate the range [start, end]
  const startIndex = endIndex - count + 1;

  // Return array of indices
  return Array.from({ length: count }, (_, i) => startIndex + i);
}

/**
 * Get the current max ordering index for a session (for diagnostics only).
 * Do NOT use this to calculate next indices - use nextOrderingIndex() instead.
 */
export async function getCurrentMaxOrderingIndex(sessionId: string): Promise<number> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    columns: { lastOrderingIndex: true },
  });

  return session?.lastOrderingIndex ?? 0;
}

/**
 * Reorder messages after compaction or other operations.
 * This reassigns orderingIndex values to be contiguous.
 *
 * WARNING: This is expensive and should only be run during maintenance.
 */
export async function reorderSessionMessages(sessionId: string): Promise<void> {
  const sessionMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: [messages.orderingIndex, messages.createdAt],
  });

  // Reassign indices sequentially
  for (let i = 0; i < sessionMessages.length; i++) {
    const newIndex = i + 1;
    const msg = sessionMessages[i];

    if (msg.orderingIndex !== newIndex) {
      await db
        .update(messages)
        .set({ orderingIndex: newIndex })
        .where(eq(messages.id, msg.id));
    }
  }

  // Update session counter
  const maxIndex = sessionMessages.length;
  await db
    .update(sessions)
    .set({ lastOrderingIndex: maxIndex })
    .where(eq(sessions.id, sessionId));
}

/**
 * Validate that a session's messages have contiguous ordering indices.
 * Returns an array of validation errors (empty if valid).
 */
export async function validateSessionOrdering(
  sessionId: string
): Promise<string[]> {
  const sessionMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: [messages.orderingIndex],
  });

  const errors: string[] = [];

  // Check for NULL ordering indices
  const nullIndices = sessionMessages.filter((m) => m.orderingIndex === null);
  if (nullIndices.length > 0) {
    errors.push(`${nullIndices.length} messages have NULL orderingIndex`);
  }

  // Check for duplicates
  const indexCounts = new Map<number, number>();
  for (const msg of sessionMessages) {
    if (msg.orderingIndex !== null) {
      const count = indexCounts.get(msg.orderingIndex) || 0;
      indexCounts.set(msg.orderingIndex, count + 1);
    }
  }

  for (const [index, count] of indexCounts) {
    if (count > 1) {
      errors.push(`Duplicate orderingIndex ${index} (${count} messages)`);
    }
  }

  // Check for gaps
  const sortedIndices = sessionMessages
    .map((m) => m.orderingIndex)
    .filter((i): i is number => i !== null)
    .sort((a, b) => a - b);

  for (let i = 1; i < sortedIndices.length; i++) {
    const prev = sortedIndices[i - 1];
    const curr = sortedIndices[i];
    if (curr !== prev + 1) {
      errors.push(`Gap in ordering: ${prev} -> ${curr}`);
    }
  }

  return errors;
}
