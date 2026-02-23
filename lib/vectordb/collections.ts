/**
 * LanceDB Collection/Table Management
 * 
 * Each agent gets its own table in the LanceDB database.
 * Tables store vector embeddings with metadata for semantic search.
 */

import * as lancedb from "@lancedb/lancedb";
import { getLanceDB } from "./client";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import { LEX_DIM } from "./v2/lexical-vectors";

// Table name prefix for agent tables
const TABLE_PREFIX = "agent_";
const tableEnsurePromises = new Map<string, Promise<lancedb.Table | null>>();

/**
 * Get the table name for an agent
 */
export function getAgentTableName(characterId: string): string {
  // Sanitize characterId to be a valid table name
  const sanitized = characterId.replace(/-/g, "_");
  return `${TABLE_PREFIX}${sanitized}`;
}

/**
 * Schema for vector records in LanceDB
 * Using Record<string, unknown> compatible type for LanceDB
 */
export interface VectorRecord {
  id: string;
  vector: number[];
  text: string;
  folderId: string;
  filePath: string;
  relativePath: string;
  chunkIndex: number;
  tokenCount: number;
  indexedAt: string | number;
  lexicalVector?: number[];
  startLine?: number;
  endLine?: number;
  tokenOffset?: number;
  version?: number;
  [key: string]: unknown; // Index signature for LanceDB compatibility
}

/**
 * Create a vector record with proper typing for LanceDB
 */
function createVectorRecord(data: Omit<VectorRecord, keyof Record<string, unknown>> & Record<string, unknown>): Record<string, unknown> {
  return data as Record<string, unknown>;
}

async function ensureV2SchemaCompatibility(params: {
  db: lancedb.Connection;
  table: lancedb.Table;
  tableName: string;
  dimensions: number;
  useV2Schema: boolean;
}): Promise<lancedb.Table> {
  const { db, table, tableName, dimensions, useV2Schema } = params;

  if (!useV2Schema) {
    return table;
  }

  try {
    const schema = await table.schema();
    const hasLexicalColumn = schema.fields.some((f: { name: string }) => f.name === "lexicalVector");
    if (hasLexicalColumn) {
      return table;
    }

    console.log(`[VectorDB] Schema mismatch for ${tableName}. Dropping to upgrade to V2 schema.`);
    await db.dropTable(tableName);
  } catch (error) {
    console.warn(`[VectorDB] Error checking schema for ${tableName}, proceeding with existing:`, error);
    return table;
  }

  const dummyRecord = createVectorRecord({
    id: "__schema__",
    vector: new Array(dimensions).fill(0),
    text: "",
    folderId: "",
    filePath: "",
    relativePath: "",
    chunkIndex: 0,
    tokenCount: 0,
    indexedAt: Date.now(),
    lexicalVector: new Array(LEX_DIM).fill(0),
    startLine: 0,
    endLine: 0,
    tokenOffset: 0,
    version: 2,
  });

  const recreated = await db.createTable(tableName, [dummyRecord]);
  await recreated.delete('id = "__schema__"');
  console.log(`[VectorDB] Created table: ${tableName}`);
  return recreated;
}

/**
 * Ensure an agent's table exists, creating it if necessary
 */
export async function ensureAgentTable(
  characterId: string,
  dimensions: number = 1536
): Promise<lancedb.Table | null> {
  const tableName = getAgentTableName(characterId);
  const inFlight = tableEnsurePromises.get(tableName);
  if (inFlight) {
    return inFlight;
  }

  const ensurePromise = (async (): Promise<lancedb.Table | null> => {
  const db = await getLanceDB();
  if (!db) return null;

  const existingTables = await db.tableNames();
  const config = getVectorSearchConfig();
  const useV2Schema = config.enableHybridSearch || config.enableTokenChunking;

  if (existingTables.includes(tableName)) {
    const table = await db.openTable(tableName);
    return ensureV2SchemaCompatibility({
      db,
      table,
      tableName,
      dimensions,
      useV2Schema,
    });
  }

  // Create empty table with schema
  // LanceDB requires at least one record to infer schema, so we use a dummy record
  const dummyRecord = createVectorRecord({
    id: "__schema__",
    vector: new Array(dimensions).fill(0),
    text: "",
    folderId: "",
    filePath: "",
    relativePath: "",
    chunkIndex: 0,
    tokenCount: 0,
    indexedAt: useV2Schema ? Date.now() : new Date().toISOString(),
    ...(useV2Schema
      ? {
        lexicalVector: new Array(LEX_DIM).fill(0),
        startLine: 0,
        endLine: 0,
        tokenOffset: 0,
        version: 2,
      }
      : {}),
  });

  let table: lancedb.Table;
  try {
    table = await db.createTable(tableName, [dummyRecord]);
  } catch (error) {
    const errorMessage = String(error);
    if (!/already exists/i.test(errorMessage)) {
      throw error;
    }

    const existingTable = await db.openTable(tableName);
    return ensureV2SchemaCompatibility({
      db,
      table: existingTable,
      tableName,
      dimensions,
      useV2Schema,
    });
  }

  // Delete the dummy record
  await table.delete('id = "__schema__"');

  console.log(`[VectorDB] Created table: ${tableName}`);
  return table;
  })();

  tableEnsurePromises.set(tableName, ensurePromise);

  try {
    return await ensurePromise;
  } finally {
    if (tableEnsurePromises.get(tableName) === ensurePromise) {
      tableEnsurePromises.delete(tableName);
    }
  }
}

/**
 * Delete an agent's table
 */
export async function deleteAgentTable(characterId: string): Promise<boolean> {
  const db = await getLanceDB();
  if (!db) return false;

  const tableName = getAgentTableName(characterId);
  const existingTables = await db.tableNames();

  if (existingTables.includes(tableName)) {
    await db.dropTable(tableName);
    console.log(`[VectorDB] Deleted table: ${tableName}`);
    return true;
  }

  return false;
}

/**
 * List all agent tables
 */
export async function listAgentTables(): Promise<string[]> {
  const db = await getLanceDB();
  if (!db) return [];

  const allTables = await db.tableNames();
  return allTables.filter(name => name.startsWith(TABLE_PREFIX));
}

/**
 * Get table statistics for an agent
 */
export async function getAgentTableStats(characterId: string): Promise<{
  exists: boolean;
  rowCount: number;
} | null> {
  const db = await getLanceDB();
  if (!db) return null;

  const tableName = getAgentTableName(characterId);
  const existingTables = await db.tableNames();

  if (!existingTables.includes(tableName)) {
    return { exists: false, rowCount: 0 };
  }

  const table = await db.openTable(tableName);
  const count = await table.countRows();

  return { exists: true, rowCount: count };
}

