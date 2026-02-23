import { db } from "./sqlite-client";
import { sessions, messages, toolRuns } from "./sqlite-schema";
import type { NewMessage, NewToolRun } from "./sqlite-schema";
import { eq, desc, asc, and, sql, or, inArray } from "drizzle-orm";

// Messages
export async function createMessage(data: NewMessage) {
  try {
    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();

    if (message) {
      const tokenCount = typeof message.tokenCount === "number" ? message.tokenCount : 0;
      const nowIso = new Date().toISOString();
      await db
        .update(sessions)
        .set({
          updatedAt: nowIso,
          lastMessageAt: nowIso,
          messageCount: sql`${sessions.messageCount} + 1`,
          totalTokenCount: sql`${sessions.totalTokenCount} + ${tokenCount}`,
        })
        .where(eq(sessions.id, data.sessionId));
    }

    return message;
  } catch (error) {
    // Handle unique constraint violation (message already exists)
    if ((error as Error).message?.includes('UNIQUE constraint failed')) {
      return undefined;
    }
    throw error;
  }
}

export async function getMessages(sessionId: string) {
  return db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: [
      // Push NULL orderingIndex values to the end for backward compatibility
      asc(sql`case when ${messages.orderingIndex} is null then 1 else 0 end`),
      asc(messages.orderingIndex),
      // Fallback to creation time for legacy/NULL rows
      asc(messages.createdAt),
    ],
  });
}

export async function updateMessage(
  messageId: string,
  data: Partial<Pick<NewMessage, "content" | "metadata" | "model" | "tokenCount">>
) {
  const existing = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  const [updated] = await db
    .update(messages)
    .set(data)
    .where(eq(messages.id, messageId))
    .returning();

  if (updated) {
    const previousTokenCount = existing?.tokenCount ?? 0;
    const nextTokenCount = updated.tokenCount ?? 0;
    const delta = nextTokenCount - previousTokenCount;
    await db
      .update(sessions)
      .set({
        updatedAt: new Date().toISOString(),
        totalTokenCount: sql`${sessions.totalTokenCount} + ${delta}`,
      })
      .where(eq(sessions.id, updated.sessionId));
  }

  return updated;
}

/**
 * Get all tool results for a session, indexed by toolCallId.
 * This fetches results from both:
 * 1. role="tool" messages (separate tool result messages)
 * 2. role="assistant" messages with inline tool-result parts
 *
 * Used by the hybrid message approach to enhance frontend messages with DB tool results.
 */
export async function getToolResultsForSession(sessionId: string): Promise<Map<string, unknown>> {
  const toolResults = new Map<string, unknown>();

  // Fetch all messages that might contain tool results
  const allMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.sessionId, sessionId),
      or(
        eq(messages.role, "tool"),
        eq(messages.role, "assistant")
      )
    ),
    orderBy: asc(messages.createdAt),
  });

  for (const msg of allMessages) {
    const content = msg.content as Array<{ type: string; toolCallId?: string; result?: unknown }> | null;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      // Handle tool-result parts (from both tool and assistant messages)
      if (part.type === "tool-result" && part.toolCallId) {
        toolResults.set(part.toolCallId, part.result);
      }
    }

    // Also check message-level toolCallId (alternative storage pattern)
    if (msg.role === "tool" && msg.toolCallId && content.length > 0) {
      const firstPart = content[0] as { result?: unknown };
      if (firstPart.result !== undefined) {
        toolResults.set(msg.toolCallId, firstPart.result);
      }
    }
  }

  return toolResults;
}

export async function getNonCompactedMessages(sessionId: string) {
  return db.query.messages.findMany({
    where: and(
      eq(messages.sessionId, sessionId),
      eq(messages.isCompacted, false)
    ),
    orderBy: [
      // Push NULL orderingIndex values to the end for backward compatibility
      asc(sql`case when ${messages.orderingIndex} is null then 1 else 0 end`),
      asc(messages.orderingIndex),
      // Fallback to creation time for legacy/NULL rows
      asc(messages.createdAt),
    ],
  });
}

export async function markMessagesAsCompacted(
  sessionId: string,
  beforeMessageId: string
) {
  const sessionMessages = await getNonCompactedMessages(sessionId);
  const targetIndex = sessionMessages.findIndex((message) => message.id === beforeMessageId);
  if (targetIndex < 0) return;

  // Keep backward compatibility: compact up to and including the boundary message.
  const idsToCompact = sessionMessages.slice(0, targetIndex + 1).map((message) => message.id);
  await markMessagesAsCompactedByIds(sessionId, idsToCompact);
}

/**
 * Mark specific messages as compacted by their IDs.
 * Used by auto-prune strategies to compact individual messages.
 *
 * @returns The number of messages actually marked as compacted.
 */
export async function markMessagesAsCompactedByIds(
  sessionId: string,
  messageIds: string[]
): Promise<number> {
  if (messageIds.length === 0) return 0;

  const result = await db
    .update(messages)
    .set({ isCompacted: true })
    .where(
      and(
        eq(messages.sessionId, sessionId),
        inArray(messages.id, messageIds)
      )
    );

  // Drizzle returns { changes } for SQLite updates
  return (result as unknown as { changes?: number })?.changes ?? messageIds.length;
}

// Tool Runs
export async function createToolRun(data: NewToolRun) {
  const [toolRun] = await db.insert(toolRuns).values(data).returning();
  return toolRun;
}

export async function updateToolRun(
  id: string,
  data: Partial<Omit<NewToolRun, "id" | "sessionId">>
) {
  const [toolRun] = await db
    .update(toolRuns)
    .set(data)
    .where(eq(toolRuns.id, id))
    .returning();
  return toolRun;
}

export async function getToolRun(id: string) {
  return db.query.toolRuns.findFirst({
    where: eq(toolRuns.id, id),
  });
}
