import { db } from "./sqlite-client";
import { agentDocuments, agentDocumentChunks } from "./sqlite-schema";
import type {
  AgentDocument,
  NewAgentDocument,
  AgentDocumentChunk,
  NewAgentDocumentChunk,
} from "./sqlite-schema";
import { eq, desc, asc, and, notInArray, sql } from "drizzle-orm";

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
