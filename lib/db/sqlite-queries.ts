import { db } from "./sqlite-client";
import {
  sessions,
  messages,
  toolRuns,
  webBrowseEntries,
  images,
  users,
  agentDocuments,
  agentDocumentChunks,
  channelConnections,
  channelConversations,
  channelMessages,
} from "./sqlite-schema";
import type {
  NewSession,
  NewMessage,
  NewToolRun,
  NewWebBrowseEntry,
  NewImage,
  Session,
  WebBrowseEntry,
  AgentDocument,
  NewAgentDocument,
  AgentDocumentChunk,
  NewAgentDocumentChunk,
  ChannelConnection,
  NewChannelConnection,
  ChannelConversation,
  NewChannelConversation,
  ChannelMessage,
  NewChannelMessage,
} from "./sqlite-schema";
import { eq, desc, asc, and, lt, gt, sql, notInArray, or, like, inArray, isNull } from "drizzle-orm";

type SessionMetadataShape = {
  characterId?: string;
  channelType?: "whatsapp" | "telegram" | "slack";
};

export interface ListSessionsPaginatedParams {
  userId: string;
  characterId?: string;
  cursor?: string;
  limit?: number;
  search?: string;
  channelType?: "whatsapp" | "telegram" | "slack";
  dateRange?: "today" | "week" | "month" | "all";
}

export interface ListSessionsPaginatedResult {
  sessions: Session[];
  nextCursor: string | null;
  totalCount: number;
}

function extractSessionMetadataColumns(metadata: unknown) {
  const meta = (metadata ?? {}) as SessionMetadataShape;
  return {
    characterId: meta.characterId ?? null,
    channelType: meta.channelType ?? null,
  };
}

// Users
export async function getOrCreateUserByExternalId(externalId: string, email?: string | null) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });

  if (existingUser) {
    return existingUser;
  }

  // Email is required - use provided email or generate placeholder from externalId
  const userEmail = email || `${externalId}@local.styly`;

  const [newUser] = await db
    .insert(users)
    .values({
      externalId,
      email: userEmail,
    })
    .returning();

  return newUser;
}

export async function getUserByExternalId(externalId: string) {
  return db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });
}

export async function getOrCreateLocalUser(userId: string, email: string) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (existingUser) {
    return existingUser;
  }

  const [newUser] = await db
    .insert(users)
    .values({ id: userId, email })
    .returning();

  return newUser;
}

// Sessions
export async function createSession(data: NewSession) {
  const metaColumns = extractSessionMetadataColumns(data.metadata);
  const [session] = await db.insert(sessions).values({
    ...data,
    ...metaColumns,
  }).returning();
  return session;
}

export async function getSession(id: string) {
  return db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
}

export async function getSessionWithMessages(id: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });

  if (!session) return null;

  const msgs = await db.query.messages.findMany({
    where: eq(messages.sessionId, id),
    orderBy: asc(messages.createdAt),
  });

  return { session, messages: msgs };
}

export async function listSessions(userId?: string, limit = 100) {
  const conditions = userId ? eq(sessions.userId, userId) : undefined;

  return db.query.sessions.findMany({
    where: conditions ? and(conditions, eq(sessions.status, "active")) : eq(sessions.status, "active"),
    orderBy: desc(sessions.updatedAt),
    limit,
  });
}

export async function getSessionByCharacterId(userId: string, characterId: string): Promise<Session | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  return result[0] || null;
}

/**
 * List all sessions for a specific character
 */
export async function listSessionsByCharacterId(
  userId: string,
  characterId: string,
  limit = 100
): Promise<Session[]> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(limit);

  return result;
}

/**
 * Get session count for a character
 */
export async function getCharacterSessionCount(
  userId: string,
  characterId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    );

  return result[0]?.count || 0;
}

export async function getOrCreateCharacterSession(
  userId: string,
  characterId: string,
  characterName: string
): Promise<{ session: Session; isNew: boolean }> {
  const existingSession = await getSessionByCharacterId(userId, characterId);

  if (existingSession) {
    return { session: existingSession, isNew: false };
  }

  const newSession = await createSession({
    title: `Chat with ${characterName}`,
    userId,
    metadata: { characterId, characterName },
  });

  return { session: newSession, isNew: true };
}

export async function listSessionsPaginated(
  params: ListSessionsPaginatedParams
): Promise<ListSessionsPaginatedResult> {
  const pageSize = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const baseConditions = [eq(sessions.userId, params.userId), eq(sessions.status, "active")];

  if (params.characterId) {
    baseConditions.push(eq(sessions.characterId, params.characterId));
  }
  if (params.search) {
    baseConditions.push(like(sessions.title, `%${params.search}%`));
  }
  if (params.channelType) {
    baseConditions.push(eq(sessions.channelType, params.channelType));
  }

  if (params.dateRange && params.dateRange !== "all") {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const threshold =
      params.dateRange === "today"
        ? new Date(now - dayMs).toISOString()
        : params.dateRange === "week"
          ? new Date(now - 7 * dayMs).toISOString()
          : new Date(now - 30 * dayMs).toISOString();
    baseConditions.push(sql`${sessions.updatedAt} >= ${threshold}`);
  }

  const pageConditions = [...baseConditions];
  if (params.cursor) {
    pageConditions.push(lt(sessions.updatedAt, params.cursor));
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...pageConditions))
    .orderBy(desc(sessions.updatedAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.updatedAt ?? null : null;

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(...baseConditions));

  return {
    sessions: page,
    nextCursor,
    totalCount: countResult[0]?.count ?? page.length,
  };
}

export async function updateSession(id: string, data: Partial<NewSession>) {
  const metadataColumns = data.metadata !== undefined
    ? extractSessionMetadataColumns(data.metadata)
    : {};
  const [session] = await db
    .update(sessions)
    .set({ ...data, ...metadataColumns, updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, id))
    .returning();
  return session;
}

export async function updateSessionSummary(
  id: string,
  summary: string,
  summaryUpToMessageId: string
) {
  return updateSession(id, { summary, summaryUpToMessageId });
}

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
    orderBy: asc(messages.createdAt),
  });
}

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
    orderBy: asc(messages.createdAt),
  });
}

export async function markMessagesAsCompacted(
  sessionId: string,
  beforeMessageId: string
) {
  const targetMessage = await db.query.messages.findFirst({
    where: eq(messages.id, beforeMessageId),
  });

  if (!targetMessage) return;

  await db
    .update(messages)
    .set({ isCompacted: true })
    .where(
      and(
        eq(messages.sessionId, sessionId),
        lt(messages.createdAt, targetMessage.createdAt)
      )
    );
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

// Web Browse Entries
export async function upsertWebBrowseEntry(data: NewWebBrowseEntry): Promise<WebBrowseEntry> {
  await db
    .delete(webBrowseEntries)
    .where(and(eq(webBrowseEntries.sessionId, data.sessionId), eq(webBrowseEntries.url, data.url)));

  const [entry] = await db
    .insert(webBrowseEntries)
    .values(data)
    .returning();

  return entry;
}

export async function listWebBrowseEntries(sessionId: string): Promise<WebBrowseEntry[]> {
  const now = new Date().toISOString();
  return db.query.webBrowseEntries.findMany({
    where: and(eq(webBrowseEntries.sessionId, sessionId), gt(webBrowseEntries.expiresAt, now)),
    orderBy: desc(webBrowseEntries.fetchedAt),
  });
}

export async function listWebBrowseEntriesByUrls(
  sessionId: string,
  urls: string[]
): Promise<WebBrowseEntry[]> {
  if (urls.length === 0) return [];
  const now = new Date().toISOString();
  return db.query.webBrowseEntries.findMany({
    where: and(
      eq(webBrowseEntries.sessionId, sessionId),
      inArray(webBrowseEntries.url, urls),
      gt(webBrowseEntries.expiresAt, now)
    ),
    orderBy: desc(webBrowseEntries.fetchedAt),
  });
}

export async function deleteWebBrowseEntries(sessionId: string): Promise<void> {
  await db.delete(webBrowseEntries).where(eq(webBrowseEntries.sessionId, sessionId));
}

export async function deleteExpiredWebBrowseEntries(): Promise<number> {
  const now = new Date().toISOString();
  const deleted = await db
    .delete(webBrowseEntries)
    .where(lt(webBrowseEntries.expiresAt, now))
    .returning({ id: webBrowseEntries.id });
  return deleted.length;
}

// Images
export async function createImage(data: NewImage) {
  const [image] = await db.insert(images).values(data).returning();
  return image;
}

export async function getSessionImages(sessionId: string) {
  return db.query.images.findMany({
    where: eq(images.sessionId, sessionId),
    orderBy: desc(images.createdAt),
  });
}

export async function getImage(id: string) {
  return db.query.images.findFirst({
    where: eq(images.id, id),
  });
}

// Agent Documents & Chunks

export async function createAgentDocument(data: NewAgentDocument): Promise<AgentDocument> {
  const [document] = await db.insert(agentDocuments).values(data).returning();
  return document;
}

export async function getAgentDocumentById(
  id: string,
  userId: string
): Promise<AgentDocument | null> {
  const document = await db.query.agentDocuments.findFirst({
    where: and(eq(agentDocuments.id, id), eq(agentDocuments.userId, userId)),
  });
  return document ?? null;
}

export async function listAgentDocumentsForCharacter(
  userId: string,
  characterId: string,
  limit = 100
): Promise<AgentDocument[]> {
  return db.query.agentDocuments.findMany({
    where: and(
      eq(agentDocuments.userId, userId),
      eq(agentDocuments.characterId, characterId),
      notInArray(agentDocuments.sourceType, ["web_search", "web_fetch"])
    ),
    orderBy: desc(agentDocuments.createdAt),
    limit,
  });
}

export async function listReadyAgentDocumentsForCharacter(
  userId: string,
  characterId: string,
  limit = 100
): Promise<AgentDocument[]> {
  return db.query.agentDocuments.findMany({
    where: and(
      eq(agentDocuments.userId, userId),
      eq(agentDocuments.characterId, characterId),
      eq(agentDocuments.status, "ready"),
      notInArray(agentDocuments.sourceType, ["web_search", "web_fetch"])
    ),
    orderBy: desc(agentDocuments.createdAt),
    limit,
  });
}

/**
 * Find a Knowledge Base document by filename or title for a specific agent.
 * Used by readFile tool to support reading KB documents in addition to synced folders.
 *
 * Matches are case-insensitive and support partial matching for flexibility.
 * Priority: exact originalFilename > exact title > partial originalFilename > partial title
 */
export async function findAgentDocumentByName(
  characterId: string,
  searchName: string
): Promise<AgentDocument | null> {
  // Normalize the search name (remove path if present, lowercase for comparison)
  const normalizedName = searchName.split(/[/\\]/).pop()?.toLowerCase() || searchName.toLowerCase();

  // First, try to find documents for this character that are ready
  const documents = await db.query.agentDocuments.findMany({
    where: and(
      eq(agentDocuments.characterId, characterId),
      eq(agentDocuments.status, "ready"),
      notInArray(agentDocuments.sourceType, ["web_search", "web_fetch"])
    ),
    orderBy: desc(agentDocuments.createdAt),
    limit: 100,
  });

  if (!documents.length) return null;

  // Score each document for match quality
  let bestMatch: AgentDocument | null = null;
  let bestScore = 0;

  for (const doc of documents) {
    const filename = doc.originalFilename.toLowerCase();
    const title = doc.title?.toLowerCase() || "";

    let score = 0;

    // Exact matches (highest priority)
    if (filename === normalizedName) {
      score = 100;
    } else if (title === normalizedName) {
      score = 90;
    }
    // Partial matches
    else if (filename.includes(normalizedName) || normalizedName.includes(filename)) {
      score = 70;
    } else if (title && (title.includes(normalizedName) || normalizedName.includes(title))) {
      score = 60;
    }
    // Extension-stripped matching (e.g., "report" matches "report.pdf")
    else {
      const filenameNoExt = filename.replace(/\.[^/.]+$/, "");
      const searchNoExt = normalizedName.replace(/\.[^/.]+$/, "");

      if (filenameNoExt === searchNoExt) {
        score = 85;
      } else if (filenameNoExt.includes(searchNoExt) || searchNoExt.includes(filenameNoExt)) {
        score = 50;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = doc;
    }
  }

  return bestMatch;
}

export async function updateAgentDocument(
  id: string,
  userId: string,
  data: Partial<NewAgentDocument>
): Promise<AgentDocument | null> {
  const [document] = await db
    .update(agentDocuments)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(agentDocuments.id, id), eq(agentDocuments.userId, userId)))
    .returning();
  return document ?? null;
}

export async function deleteAgentDocument(id: string, userId: string): Promise<void> {
  await db
    .delete(agentDocuments)
    .where(and(eq(agentDocuments.id, id), eq(agentDocuments.userId, userId)));
}

export async function getExpiredAgentDocuments(): Promise<AgentDocument[]> {
  const now = new Date().toISOString();
  return db.select()
    .from(agentDocuments)
    .where(
      sql`json_extract(${agentDocuments.metadata}, '$.expiresAt') < ${now}`
    );
}

export async function createAgentDocumentChunks(
  chunks: NewAgentDocumentChunk[]
): Promise<AgentDocumentChunk[]> {
  if (chunks.length === 0) return [];
  const inserted = await db
    .insert(agentDocumentChunks)
    .values(chunks)
    .returning();
  return inserted;
}

export async function deleteAgentDocumentChunksByDocumentId(
  documentId: string,
  userId: string
): Promise<void> {
  await db
    .delete(agentDocumentChunks)
    .where(
      and(
        eq(agentDocumentChunks.documentId, documentId),
        eq(agentDocumentChunks.userId, userId)
      )
    );
}

export async function getAgentDocumentChunksByDocumentId(
  documentId: string,
  userId: string
): Promise<AgentDocumentChunk[]> {
  return db.query.agentDocumentChunks.findMany({
    where: and(
      eq(agentDocumentChunks.documentId, documentId),
      eq(agentDocumentChunks.userId, userId)
    ),
    orderBy: [asc(agentDocumentChunks.chunkIndex)],
  });
}

export async function listAgentDocumentChunksForCharacter(
  userId: string,
  characterId: string,
  limit = 1000
): Promise<AgentDocumentChunk[]> {
  return db.query.agentDocumentChunks.findMany({
    where: and(
      eq(agentDocumentChunks.userId, userId),
      eq(agentDocumentChunks.characterId, characterId)
    ),
    orderBy: [asc(agentDocumentChunks.documentId), asc(agentDocumentChunks.chunkIndex)],
    limit,
  });
}
