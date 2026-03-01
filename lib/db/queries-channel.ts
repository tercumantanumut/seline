import { db } from "./sqlite-client";
import {
  channelConnections,
  channelConversations,
  channelMessages,
} from "./sqlite-schema";
import type {
  ChannelConnection,
  NewChannelConnection,
  ChannelConversation,
  NewChannelConversation,
  ChannelMessage,
  NewChannelMessage,
} from "./sqlite-schema";
import { eq, desc, and, isNull } from "drizzle-orm";

// ============================================================================
// CHANNEL CONNECTIONS
// ============================================================================

export async function createChannelConnection(data: NewChannelConnection): Promise<ChannelConnection> {
  const [connection] = await db.insert(channelConnections).values(data).returning();
  return connection;
}

export async function updateChannelConnection(
  id: string,
  data: Partial<NewChannelConnection>
): Promise<ChannelConnection | undefined> {
  const [connection] = await db
    .update(channelConnections)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(channelConnections.id, id))
    .returning();
  return connection;
}

export async function getChannelConnection(id: string): Promise<ChannelConnection | undefined> {
  return db.query.channelConnections.findFirst({
    where: eq(channelConnections.id, id),
  });
}

export async function listChannelConnections(params: {
  userId: string;
  characterId?: string;
}): Promise<ChannelConnection[]> {
  const conditions = params.characterId
    ? and(eq(channelConnections.userId, params.userId), eq(channelConnections.characterId, params.characterId))
    : eq(channelConnections.userId, params.userId);

  return db.query.channelConnections.findMany({
    where: conditions,
    orderBy: desc(channelConnections.updatedAt),
  });
}

export async function deleteChannelConnection(id: string): Promise<void> {
  await db.delete(channelConnections).where(eq(channelConnections.id, id));
}

/**
 * Find an active (connected) channel connection for a user by channel type.
 * Used by scheduleTask to resolve delivery channel when user explicitly
 * requests a specific channel (e.g., "telegram") but the schedule isn't
 * being created from that channel's session.
 */
export async function findActiveChannelConnection(
  userId: string,
  channelType: string
): Promise<ChannelConnection | undefined> {
  return db.query.channelConnections.findFirst({
    where: and(
      eq(channelConnections.userId, userId),
      eq(channelConnections.channelType, channelType as any),
      eq(channelConnections.status, "connected")
    ),
    orderBy: desc(channelConnections.updatedAt),
  });
}

// ============================================================================
// CHANNEL CONVERSATIONS
// ============================================================================

function buildThreadCondition(threadId?: string | null) {
  return threadId ? eq(channelConversations.threadId, threadId) : isNull(channelConversations.threadId);
}

export async function findChannelConversation(params: {
  connectionId: string;
  peerId: string;
  threadId?: string | null;
}): Promise<ChannelConversation | undefined> {
  return db.query.channelConversations.findFirst({
    where: and(
      eq(channelConversations.connectionId, params.connectionId),
      eq(channelConversations.peerId, params.peerId),
      buildThreadCondition(params.threadId ?? null)
    ),
  });
}

export async function getChannelConversation(id: string): Promise<ChannelConversation | undefined> {
  return db.query.channelConversations.findFirst({
    where: eq(channelConversations.id, id),
  });
}

export async function findChannelConversationBySessionId(
  sessionId: string,
): Promise<ChannelConversation | undefined> {
  return db.query.channelConversations.findFirst({
    where: eq(channelConversations.sessionId, sessionId),
  });
}

export async function listChannelConversationsByCharacter(
  characterId: string
): Promise<ChannelConversation[]> {
  return db.query.channelConversations.findMany({
    where: eq(channelConversations.characterId, characterId),
    orderBy: desc(channelConversations.updatedAt),
  });
}

export async function createChannelConversation(
  data: NewChannelConversation
): Promise<ChannelConversation> {
  const [conversation] = await db.insert(channelConversations).values(data).returning();
  return conversation;
}

export async function updateChannelConversation(
  id: string,
  data: Partial<NewChannelConversation>
): Promise<ChannelConversation | undefined> {
  const [conversation] = await db
    .update(channelConversations)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(channelConversations.id, id))
    .returning();
  return conversation;
}

export async function touchChannelConversation(
  id: string,
  lastMessageAt?: string
): Promise<ChannelConversation | undefined> {
  const [conversation] = await db
    .update(channelConversations)
    .set({
      lastMessageAt: lastMessageAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(channelConversations.id, id))
    .returning();
  return conversation;
}

/**
 * Find the most recent channel conversation for a given connection.
 * Used by scheduleTask to resolve peerId/threadId when the user
 * explicitly requests delivery to a specific channel type.
 */
export async function findRecentChannelConversation(
  connectionId: string
): Promise<ChannelConversation | undefined> {
  return db.query.channelConversations.findFirst({
    where: eq(channelConversations.connectionId, connectionId),
    orderBy: desc(channelConversations.updatedAt),
  });
}

// ============================================================================
// CHANNEL MESSAGE MAP
// ============================================================================

export async function createChannelMessage(data: NewChannelMessage): Promise<ChannelMessage> {
  const [entry] = await db.insert(channelMessages).values(data).returning();
  return entry;
}

export async function findChannelMessageByExternalId(params: {
  connectionId: string;
  channelType: ChannelMessage["channelType"];
  externalMessageId: string;
  direction: ChannelMessage["direction"];
}): Promise<ChannelMessage | undefined> {
  return db.query.channelMessages.findFirst({
    where: and(
      eq(channelMessages.connectionId, params.connectionId),
      eq(channelMessages.channelType, params.channelType),
      eq(channelMessages.externalMessageId, params.externalMessageId),
      eq(channelMessages.direction, params.direction)
    ),
  });
}
