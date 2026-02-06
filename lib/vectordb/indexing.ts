/**
 * LanceDB Document Indexing
 * 
 * Handles chunking documents, generating embeddings, and storing them in LanceDB.
 */

import { embedMany } from "ai";
import { readFile } from "fs/promises";
import { getLanceDB } from "./client";
import { ensureAgentTable, getAgentTableName, type VectorRecord } from "./collections";
import { getEmbeddingModel, getEmbeddingModelId } from "@/lib/ai/providers";
import { normalizeEmbeddings } from "@/lib/ai/embedding-utils";
import { chunkText } from "@/lib/documents/chunking";
import { chunkByTokens } from "@/lib/documents/v2/token-chunking";
import { extractTextFromDocument } from "@/lib/documents/parser";
import { generateLexicalVector } from "./v2/lexical-vectors";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import { loadSettings } from "@/lib/settings/settings-manager";

export interface IndexFileResult {
  filePath: string;
  chunkCount: number;
  pointIds: string[];
  error?: string;
}

/**
 * Get content type from file extension
 */
function getContentTypeFromExtension(ext: string): string {
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    pdf: "application/pdf",
    html: "text/html",
    htm: "text/html",
    json: "application/json",
    js: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    jsx: "text/javascript",
    py: "text/x-python",
    css: "text/css",
    xml: "text/xml",
  };
  return types[ext.toLowerCase()] || "text/plain";
}

interface IndexChunk {
  index: number;
  text: string;
  tokenCount?: number;
  startLine?: number;
  endLine?: number;
  tokenOffset?: number;
}

function getChunksForIndexing(text: string): IndexChunk[] {
  const config = getVectorSearchConfig();

  if (config.enableTokenChunking || config.chunkingStrategy === "token") {
    return chunkByTokens(text, {
      windowTokens: config.tokenChunkSize,
      strideTokens: config.tokenChunkStride,
    }).map((chunk) => ({
      index: chunk.index,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      tokenOffset: chunk.tokenOffset,
    }));
  }

  const maxChunks = config.maxChunksPerFile > 0 ? config.maxChunksPerFile : undefined;

  return chunkText(text, { maxChunks }).map((chunk) => ({
    index: chunk.index,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
  }));
}

function resolveEmbeddingBatchSize(): number {
  const { embeddingBatchSize } = getVectorSearchConfig();
  const settings = loadSettings();
  const isLocalEmbeddingProvider = settings.embeddingProvider === "local";
  const maxBatch = isLocalEmbeddingProvider ? 16 : 64;

  if (!Number.isFinite(embeddingBatchSize) || embeddingBatchSize <= 0) {
    return maxBatch;
  }
  return Math.min(Math.floor(embeddingBatchSize), maxBatch);
}

function createDocumentRecord(params: {
  text: string;
  filePath: string;
  relativePath: string;
  chunkIndex: number;
  folderId: string;
  embedding: number[];
  tokenCount?: number;
  startLine?: number;
  endLine?: number;
  tokenOffset?: number;
}): Record<string, unknown> {
  const config = getVectorSearchConfig();

  const baseRecord: VectorRecord = {
    id: crypto.randomUUID(),
    vector: params.embedding,
    text: params.text,
    folderId: params.folderId,
    filePath: params.filePath,
    relativePath: params.relativePath,
    chunkIndex: params.chunkIndex,
    tokenCount: params.tokenCount ?? 0,
    indexedAt: new Date().toISOString(),
  };

  if (config.enableTokenChunking || config.enableHybridSearch) {
    return {
      ...baseRecord,
      lexicalVector: generateLexicalVector(params.text),
      startLine: params.startLine,
      endLine: params.endLine,
      tokenOffset: params.tokenOffset,
      version: 2 as const,
      indexedAt: Date.now(),
    };
  }

  return baseRecord as Record<string, unknown>;
}

/**
 * Index a file into LanceDB for an agent
 */
export async function indexFileToVectorDB(params: {
  characterId: string;
  folderId: string;
  filePath: string;
  relativePath: string;
  signal?: AbortSignal;
}): Promise<IndexFileResult> {
  const { characterId, folderId, filePath, relativePath, signal } = params;

  const db = await getLanceDB();
  if (!db) {
    return { filePath, chunkCount: 0, pointIds: [], error: "VectorDB not enabled" };
  }

  try {
    // Read file content
    const buffer = await readFile(filePath);
    const ext = filePath.split(".").pop() || "txt";
    const contentType = getContentTypeFromExtension(ext);

    // Parse document to extract text
    const parsed = await extractTextFromDocument(buffer, contentType, filePath);

    // Chunk the text
    const chunks = getChunksForIndexing(parsed.text);

    if (chunks.length === 0) {
      return { filePath, chunkCount: 0, pointIds: [] };
    }

    const batchSize = resolveEmbeddingBatchSize();
    const embeddingModelId = getEmbeddingModelId();
    const embeddingModel = getEmbeddingModel(embeddingModelId);
    const pointIds: string[] = [];
    let table: Awaited<ReturnType<typeof ensureAgentTable>> | null = null;

    try {
      for (let start = 0; start < chunks.length; start += batchSize) {
        // Check for abortion before starting next batch
        if (signal?.aborted) {
          throw new Error("Indexing aborted");
        }

        const batch = chunks.slice(start, start + batchSize);
        const { embeddings } = await embedMany({
          model: embeddingModel,
          values: batch.map(c => c.text),
          abortSignal: signal,
        });
        const normalizedEmbeddings = normalizeEmbeddings(embeddings);

        if (!normalizedEmbeddings.length || normalizedEmbeddings.length !== batch.length) {
          throw new Error("Embedding batch size mismatch");
        }

        if (!table) {
          const dimensions = normalizedEmbeddings[0]?.length || 1536;
          table = await ensureAgentTable(characterId, dimensions);
          if (!table) {
            return { filePath, chunkCount: 0, pointIds: [], error: "Failed to create table" };
          }
        }

        const records = batch.map((chunk, index) => {
          const record = createDocumentRecord({
            text: chunk.text,
            filePath,
            relativePath,
            chunkIndex: chunk.index,
            folderId,
            embedding: normalizedEmbeddings[index],
            tokenCount: chunk.tokenCount,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            tokenOffset: chunk.tokenOffset,
          });
          pointIds.push(record.id as string);
          return record;
        });

        await table.add(records);
      }
    } catch (error) {
      if (pointIds.length > 0) {
        try {
          await removeFileFromVectorDB({ characterId, pointIds });
        } catch (cleanupError) {
          console.error("[VectorDB] Cleanup failed after indexing error:", cleanupError);
        }
      }
      throw error;
    }

    console.log(`[VectorDB] Indexed ${chunks.length} chunks from: ${relativePath}`);
    return { filePath, chunkCount: chunks.length, pointIds };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Indexing failed";
    console.error(`[VectorDB] Error indexing file ${filePath}:`, errorMsg);
    return { filePath, chunkCount: 0, pointIds: [], error: errorMsg };
  }
}

/**
 * Index raw text into LanceDB (for manual content)
 */
export async function indexTextToVectorDB(params: {
  characterId: string;
  folderId: string;
  text: string;
  sourceName: string;
}): Promise<IndexFileResult> {
  const { characterId, folderId, text, sourceName } = params;

  const db = await getLanceDB();
  if (!db) {
    return { filePath: sourceName, chunkCount: 0, pointIds: [], error: "VectorDB not enabled" };
  }

  try {
    const chunks = getChunksForIndexing(text);
    if (chunks.length === 0) {
      return { filePath: sourceName, chunkCount: 0, pointIds: [] };
    }

    const batchSize = resolveEmbeddingBatchSize();
    const embeddingModelId = getEmbeddingModelId();
    const embeddingModel = getEmbeddingModel(embeddingModelId);
    const pointIds: string[] = [];
    let table: Awaited<ReturnType<typeof ensureAgentTable>> | null = null;

    try {
      for (let start = 0; start < chunks.length; start += batchSize) {
        const batch = chunks.slice(start, start + batchSize);
        const { embeddings } = await embedMany({
          model: embeddingModel,
          values: batch.map(c => c.text),
        });
        const normalizedEmbeddings = normalizeEmbeddings(embeddings);

        if (!normalizedEmbeddings.length || normalizedEmbeddings.length !== batch.length) {
          throw new Error("Embedding batch size mismatch");
        }

        if (!table) {
          const dimensions = normalizedEmbeddings[0]?.length || 1536;
          table = await ensureAgentTable(characterId, dimensions);
          if (!table) {
            return { filePath: sourceName, chunkCount: 0, pointIds: [], error: "Failed to create table" };
          }
        }

        const records = batch.map((chunk, index) => {
          const record = createDocumentRecord({
            text: chunk.text,
            filePath: sourceName,
            relativePath: sourceName,
            chunkIndex: chunk.index,
            folderId,
            embedding: normalizedEmbeddings[index],
            tokenCount: chunk.tokenCount,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            tokenOffset: chunk.tokenOffset,
          });
          pointIds.push(record.id as string);
          return record;
        });

        await table.add(records);
      }
    } catch (error) {
      if (pointIds.length > 0) {
        try {
          await removeFileFromVectorDB({ characterId, pointIds });
        } catch (cleanupError) {
          console.error("[VectorDB] Cleanup failed after indexing error:", cleanupError);
        }
      }
      throw error;
    }

    return { filePath: sourceName, chunkCount: chunks.length, pointIds };
  } catch (error) {
    return { filePath: sourceName, chunkCount: 0, pointIds: [], error: String(error) };
  }
}

/**
 * Remove indexed content for specific point IDs
 */
export async function removeFileFromVectorDB(params: {
  characterId: string;
  pointIds: string[];
}): Promise<void> {
  const { characterId, pointIds } = params;

  if (pointIds.length === 0) return;

  const db = await getLanceDB();
  if (!db) return;

  const tableName = getAgentTableName(characterId);
  const existingTables = await db.tableNames();

  if (!existingTables.includes(tableName)) return;

  const table = await db.openTable(tableName);

  // Delete by IDs - LanceDB uses SQL-like filter syntax
  const idList = pointIds.map(id => `"${id}"`).join(", ");
  await table.delete(`id IN (${idList})`);

  console.log(`[VectorDB] Removed ${pointIds.length} points from ${tableName}`);
}

