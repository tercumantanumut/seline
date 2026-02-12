import { embed, embedMany, cosineSimilarity } from "ai";
import { and, eq } from "drizzle-orm";

import {
  getAgentDocumentById,
  getAgentDocumentChunksByDocumentId,
  listAgentDocumentChunksForCharacter,
  listReadyAgentDocumentsForCharacter,
  updateAgentDocument,
} from "@/lib/db/queries";
import { db } from "@/lib/db/sqlite-client";
import { agentDocumentChunks } from "@/lib/db/sqlite-schema";
import { getEmbeddingModel, getEmbeddingModelId } from "@/lib/ai/providers";
import { normalizeEmbedding, normalizeEmbeddings } from "@/lib/ai/embedding-utils";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import { validateLocalModelExists } from "@/lib/ai/local-embeddings";
import { DocumentProcessingError, DocumentErrorCode } from "@/lib/documents/errors";

export interface AgentDocumentEmbeddingIndexResult {
  documentId: string;
  chunkCount: number;
  embeddedChunkCount: number;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
}

export interface AgentDocumentSearchOptions {
  topK?: number;
  /**
   * Minimum cosine similarity (0-1). Results below this threshold are dropped.
   */
  minSimilarity?: number;
  /**
   * Optional hard cap on the number of chunks scanned before scoring.
   */
  maxChunks?: number;
}

export interface AgentDocumentSearchHit {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  similarity: number;
  originalFilename: string;
  title: string | null;
  description: string | null;
  tags: string[];
}

/**
 * Compute embeddings for all chunks of a single document and persist them.
 *
 * This function is idempotent for a given embedding model: chunks that already
 * have an embedding for the active model are skipped.
 */
export async function indexAgentDocumentEmbeddings(params: {
  documentId: string;
  userId: string;
}): Promise<AgentDocumentEmbeddingIndexResult> {
  const { documentId, userId } = params;

  const document = await getAgentDocumentById(documentId, userId);
  if (!document) {
    throw new Error("Document not found or access denied");
  }

  const chunks = await getAgentDocumentChunksByDocumentId(documentId, userId);
  if (!chunks.length) {
    return {
      documentId,
      chunkCount: 0,
      embeddedChunkCount: 0,
      embeddingModel: null,
      embeddingDimensions: null,
    };
  }

  // Pre-flight: verify local model exists before attempting embedding
  const embeddingProvider = process.env.EMBEDDING_PROVIDER;
  if (embeddingProvider === "local") {
    const validation = validateLocalModelExists();
    if (!validation.exists) {
      throw new DocumentProcessingError(
        DocumentErrorCode.MODEL_NOT_DOWNLOADED,
        `Local embedding model "${validation.modelId}" is not available. ` +
        `Missing: ${validation.missingFiles.join(", ")} at ${validation.expectedPath}`,
        undefined,
        "Download the model from Settings → Embeddings, or switch to OpenRouter embeddings.",
      );
    }
  }

  const embeddingModelId = getEmbeddingModelId();
  const embeddingModel = getEmbeddingModel(embeddingModelId);

  const chunksToEmbed = chunks.filter(
    (chunk) =>
      !chunk.embedding ||
      !chunk.embeddingModel ||
      chunk.embeddingModel !== embeddingModelId
  );

  if (!chunksToEmbed.length) {
    // Already fully indexed for this model; ensure document metadata is set.
    await updateAgentDocument(documentId, userId, {
      embeddingModel: embeddingModelId,
      status: "ready",
      lastIndexedAt: new Date().toISOString(),
    });

    const dimensions =
      typeof chunks[0].embeddingDimensions === "number"
        ? chunks[0].embeddingDimensions
        : (Array.isArray(chunks[0].embedding)
            ? chunks[0].embedding.length
            : null);

    return {
      documentId,
      chunkCount: chunks.length,
      embeddedChunkCount: 0,
      embeddingModel: embeddingModelId,
      embeddingDimensions: dimensions,
    };
  }

  const now = new Date().toISOString();
  const config = getVectorSearchConfig();
  const batchSize =
    Number.isFinite(config.embeddingBatchSize) && config.embeddingBatchSize > 0
      ? Math.floor(config.embeddingBatchSize)
      : 64;
  let embeddingDimensions: number | null = null;

  for (let start = 0; start < chunksToEmbed.length; start += batchSize) {
    const batch = chunksToEmbed.slice(start, start + batchSize);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch.map((chunk) => chunk.text),
    });
    const normalizedEmbeddings = normalizeEmbeddings(embeddings);

    if (!normalizedEmbeddings.length || normalizedEmbeddings.length !== batch.length) {
      throw new Error("Embedding batch size mismatch");
    }

    if (embeddingDimensions == null) {
      embeddingDimensions = normalizedEmbeddings[0]?.length ?? null;
    }

    // Persist embeddings for each updated chunk
    for (let i = 0; i < batch.length; i += 1) {
      const chunk = batch[i];
      const vector = normalizedEmbeddings[i];
      if (!vector) continue;

      await db
        .update(agentDocumentChunks)
        .set({
          embedding: vector,
          embeddingModel: embeddingModelId,
          embeddingDimensions: vector.length,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentDocumentChunks.id, chunk.id),
            eq(agentDocumentChunks.userId, userId),
          ),
        );
    }
  }

  await updateAgentDocument(documentId, userId, {
    embeddingModel: embeddingModelId,
    status: "ready",
    lastIndexedAt: now,
  });

  return {
    documentId,
    chunkCount: chunks.length,
    embeddedChunkCount: chunksToEmbed.length,
    embeddingModel: embeddingModelId,
    embeddingDimensions,
  };
}

/**
 * Perform a semantic search over all ready documents for a specific agent.
 */
export async function searchAgentDocumentsForCharacter(params: {
  userId: string;
  characterId: string;
  query: string;
  options?: AgentDocumentSearchOptions;
}): Promise<AgentDocumentSearchHit[]> {
  const { userId, characterId, query, options } = params;
  const topK = options?.topK ?? 6;
  const minSimilarity = options?.minSimilarity ?? 0.2;
  const maxChunks = options?.maxChunks ?? 2_000;

  const embeddingModelId = getEmbeddingModelId();
  const embeddingModel = getEmbeddingModel(embeddingModelId);

  const documents = await listReadyAgentDocumentsForCharacter(userId, characterId);
  if (!documents.length) return [];

  const eligibleDocs = documents.filter(
    (doc) => !doc.embeddingModel || doc.embeddingModel === embeddingModelId,
  );
  if (!eligibleDocs.length) return [];

  const allowedDocumentIds = new Set(eligibleDocs.map((doc) => doc.id));

  const allChunks = await listAgentDocumentChunksForCharacter(userId, characterId, maxChunks);
  const candidateChunks = allChunks.filter((chunk) => {
    if (!allowedDocumentIds.has(chunk.documentId)) return false;
    if (!chunk.embedding || !Array.isArray(chunk.embedding)) return false;
    if (!chunk.embeddingModel || chunk.embeddingModel !== embeddingModelId) return false;
    return true;
  });

  if (!candidateChunks.length) return [];

  const { embedding: queryEmbedding } = await embed({
    model: embeddingModel,
    value: query,
  });
  const normalizedQuery = normalizeEmbedding(queryEmbedding);

  const scored = candidateChunks
    .map((chunk) => {
      const vector = Array.isArray(chunk.embedding) ? chunk.embedding : [];
      if (!vector.length || vector.length !== normalizedQuery.length) {
        return null;
      }
      const similarity = cosineSimilarity(normalizedQuery, vector);
      return { chunk, similarity };
    })
    .filter((entry): entry is { chunk: (typeof candidateChunks)[number]; similarity: number } =>
      !!entry && entry.similarity >= minSimilarity,
    )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  if (!scored.length) return [];

  const docById = new Map(documents.map((doc) => [doc.id, doc]));

  return scored.map(({ chunk, similarity }) => {
    const doc = docById.get(chunk.documentId);
    const rawTags = doc?.tags;
    const tags = Array.isArray(rawTags)
      ? rawTags.map((t) => String(t)).filter(Boolean)
      : [];

    return {
      documentId: chunk.documentId,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      similarity,
      originalFilename: doc?.originalFilename ?? "",
      title: doc?.title ?? null,
      description: doc?.description ?? null,
      tags,
    };
  });
}
