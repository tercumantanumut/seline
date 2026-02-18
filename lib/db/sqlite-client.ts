import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./sqlite-schema";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { runSessionMaintenance } from "./maintenance";

// Get the database path from environment or use default
function getDbPath(): string {
  // In Electron, LOCAL_DATA_PATH is set to userDataPath/data
  // Database goes to userDataPath/data/zlutty.db
  if (process.env.LOCAL_DATA_PATH) {
    const dataDir = process.env.LOCAL_DATA_PATH;
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    return join(dataDir, "zlutty.db");
  }

  // For development/testing outside Electron
  const dataDir = join(process.cwd(), ".local-data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return join(dataDir, "zlutty.db");
}

// Global singleton for the database connection
const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: BetterSQLite3Database<typeof schema> | undefined;
  schemaVersion?: number;
};

const SCHEMA_VERSION = 4;

function createConnection(): { sqlite: Database.Database; db: BetterSQLite3Database<typeof schema> } {
  const dbPath = getDbPath();

  // Ensure directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  console.log("[SQLite] Opening database at:", dbPath);

  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  sqlite.pragma("journal_mode = WAL");

  // Allow short waits for locks during concurrent dev migrations.
  sqlite.pragma("busy_timeout = 5000");

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}

// Initialize the database
function getDb(): BetterSQLite3Database<typeof schema> {
  if (!globalForDb.db) {
    const { sqlite, db } = createConnection();
    globalForDb.sqlite = sqlite;
    globalForDb.db = db;

    // Initialize tables on first connection
    initializeTables(sqlite);
    globalForDb.schemaVersion = SCHEMA_VERSION;
    return globalForDb.db;
  }
  if (globalForDb.schemaVersion !== SCHEMA_VERSION && globalForDb.sqlite) {
    initializeTables(globalForDb.sqlite);
    globalForDb.schemaVersion = SCHEMA_VERSION;
  }
  return globalForDb.db;
}

// Initialize database tables
function initializeTables(sqlite: Database.Database): void {
  // Users table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add password_hash column if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  } catch {
    // Column already exists, ignore error
  }

  // Sessions table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      title TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
      provider_session_id TEXT,
      summary TEXT,
      summary_up_to_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Migration: Promote frequently queried session metadata to first-class columns
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN character_id TEXT`);
    console.log("[SQLite Migration] Added character_id column to sessions");
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0`);
    console.log("[SQLite Migration] Added message_count column to sessions");
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN total_token_count INTEGER NOT NULL DEFAULT 0`);
    console.log("[SQLite Migration] Added total_token_count column to sessions");
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN last_message_at TEXT`);
    console.log("[SQLite Migration] Added last_message_at column to sessions");
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN channel_type TEXT`);
    console.log("[SQLite Migration] Added channel_type column to sessions");
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`
      UPDATE sessions
      SET
        character_id = COALESCE(character_id, json_extract(metadata, '$.characterId')),
        channel_type = COALESCE(channel_type, json_extract(metadata, '$.channelType'))
      WHERE character_id IS NULL OR channel_type IS NULL
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Failed to backfill sessions metadata columns:", error);
  }

  try {
    sqlite.exec(`
      UPDATE sessions
      SET
        message_count = COALESCE((
          SELECT COUNT(*)
          FROM messages
          WHERE messages.session_id = sessions.id
        ), 0),
        total_token_count = COALESCE((
          SELECT SUM(COALESCE(messages.token_count, 0))
          FROM messages
          WHERE messages.session_id = sessions.id
        ), 0),
        last_message_at = (
          SELECT MAX(messages.created_at)
          FROM messages
          WHERE messages.session_id = sessions.id
        )
      WHERE message_count = 0 AND total_token_count = 0 AND last_message_at IS NULL
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Failed to backfill sessions counters:", error);
  }

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_character
      ON sessions (user_id, character_id, status)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
      ON sessions (user_id, updated_at DESC)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_character_updated
      ON sessions (character_id, updated_at DESC)
  `);

  // Messages table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      parent_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      model TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      is_compacted INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Migration: Add ordering_index column for bullet-proof message ordering
  try {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN ordering_index INTEGER`);
    console.log("[SQLite Migration] Added ordering_index column to messages");
  } catch {
    // Column already exists
  }

  // Migration: Add last_ordering_index column to sessions for atomic index allocation
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN last_ordering_index INTEGER DEFAULT 0`);
    console.log("[SQLite Migration] Added last_ordering_index column to sessions");
  } catch {
    // Column already exists
  }

  // Migration: Backfill ordering_index for existing messages
  try {
    const needsBackfill = sqlite.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE ordering_index IS NULL`
    ).get() as { count: number };

    if (needsBackfill.count > 0) {
      console.log(`[SQLite Migration] Backfilling ordering_index for ${needsBackfill.count} messages...`);

      // Get all messages grouped by session, ordered by createdAt
      const messages = sqlite.prepare(
        `SELECT id, session_id, created_at FROM messages ORDER BY session_id, created_at, id`
      ).all() as Array<{ id: string; session_id: string; created_at: string }>;

      // Group by session and assign ordering indices
      const messagesBySession = new Map<string, Array<{ id: string; created_at: string }>>();
      for (const msg of messages) {
        const sessionMessages = messagesBySession.get(msg.session_id) || [];
        sessionMessages.push({ id: msg.id, created_at: msg.created_at });
        messagesBySession.set(msg.session_id, sessionMessages);
      }

      const updateStmt = sqlite.prepare(`UPDATE messages SET ordering_index = ? WHERE id = ?`);
      const updateSessionStmt = sqlite.prepare(`UPDATE sessions SET last_ordering_index = ? WHERE id = ?`);

      sqlite.exec("BEGIN TRANSACTION");
      try {
        for (const [sessionId, sessionMessages] of messagesBySession) {
          let maxIndex = 0;
          for (let i = 0; i < sessionMessages.length; i++) {
            const orderingIndex = i + 1; // 1-based indexing
            updateStmt.run(orderingIndex, sessionMessages[i].id);
            maxIndex = orderingIndex;
          }
          updateSessionStmt.run(maxIndex, sessionId);
        }
        sqlite.exec("COMMIT");
        console.log(`[SQLite Migration] Backfilled ordering_index for ${messages.length} messages in ${messagesBySession.size} sessions`);
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  } catch (error) {
    console.warn("[SQLite Migration] Failed to backfill ordering_index:", error);
  }

  // Create index for efficient session message ordering
  try {
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_ordering
        ON messages (session_id, ordering_index)
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Failed to create ordering index:", error);
  }

  // Tool runs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id),
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
      error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Web browse entries table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS web_browse_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_length INTEGER NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      og_image TEXT,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_web_browse_entries_session
      ON web_browse_entries (session_id, fetched_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_web_browse_entries_session_url
      ON web_browse_entries (session_id, url)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_web_browse_entries_expires
      ON web_browse_entries (expires_at)
  `);

  // Images table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id),
      tool_run_id TEXT REFERENCES tool_runs(id),
      role TEXT NOT NULL CHECK(role IN ('upload', 'reference', 'generated', 'mask', 'tile')),
      local_path TEXT NOT NULL,
      url TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      format TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Characters table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT,
      tagline TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'archived')),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_interaction_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Create unique partial index to enforce only one default per user
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_user_default
      ON characters(user_id, is_default)
      WHERE is_default = 1
  `);


  // Character images table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS character_images (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      image_type TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      local_path TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      width INTEGER,
      height INTEGER,
      format TEXT,
      prompt TEXT,
      seed INTEGER,
      generation_model TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Agent documents table
  sqlite.exec(`
	    CREATE TABLE IF NOT EXISTS agent_documents (
	      id TEXT PRIMARY KEY,
	      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	      original_filename TEXT NOT NULL,
	      content_type TEXT NOT NULL,
	      extension TEXT,
	      storage_path TEXT NOT NULL,
	      size_bytes INTEGER,
	      title TEXT,
	      description TEXT,
	      page_count INTEGER,
	      source_type TEXT,
	      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'failed')),
	      tags TEXT NOT NULL DEFAULT '[]',
	      metadata TEXT NOT NULL DEFAULT '{}',
	      embedding_model TEXT,
	      last_indexed_at TEXT,
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	    )
	  `);

  // Migration: Add error_message column to agent_documents if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_documents ADD COLUMN error_message TEXT`);
    console.log("[SQLite Migration] Added error_message column to agent_documents");
  } catch {
    // Column already exists, ignore error
  }

  // Agent document chunks table
  sqlite.exec(`
	    CREATE TABLE IF NOT EXISTS agent_document_chunks (
	      id TEXT PRIMARY KEY,
	      document_id TEXT NOT NULL REFERENCES agent_documents(id) ON DELETE CASCADE,
	      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	      chunk_index INTEGER NOT NULL,
	      text TEXT NOT NULL,
	      token_count INTEGER,
	      embedding TEXT,
	      embedding_model TEXT,
	      embedding_dimensions INTEGER,
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	    )
	  `);

  // Indexes for agent documents and chunks
  sqlite.exec(`
	    CREATE INDEX IF NOT EXISTS idx_agent_documents_user_character
	      ON agent_documents (user_id, character_id, created_at DESC)
	  `);

  sqlite.exec(`
	    CREATE INDEX IF NOT EXISTS idx_agent_document_chunks_document
	      ON agent_document_chunks (document_id, chunk_index)
	  `);

  sqlite.exec(`
	    CREATE INDEX IF NOT EXISTS idx_agent_document_chunks_user_character
	      ON agent_document_chunks (user_id, character_id)
	  `);

  // Agent sync folders table (for LanceDB Vector Search)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_sync_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      display_name TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      recursive INTEGER NOT NULL DEFAULT 1,
      include_extensions TEXT NOT NULL DEFAULT '["md","txt","pdf","html"]',
      exclude_patterns TEXT NOT NULL DEFAULT '["node_modules",".*",".git","package-lock.json","pnpm-lock.yaml","yarn.lock","*.lock"]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'error', 'paused')),
      last_synced_at TEXT,
      last_error TEXT,
      file_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      embedding_model TEXT,
      indexing_mode TEXT NOT NULL DEFAULT 'auto' CHECK(indexing_mode IN ('files-only', 'full', 'auto')),
      sync_mode TEXT NOT NULL DEFAULT 'auto' CHECK(sync_mode IN ('auto', 'manual', 'scheduled', 'triggered')),
      sync_cadence_minutes INTEGER NOT NULL DEFAULT 60,
      file_type_filters TEXT NOT NULL DEFAULT '[]',
      max_file_size_bytes INTEGER NOT NULL DEFAULT 10485760,
      chunk_preset TEXT NOT NULL DEFAULT 'balanced' CHECK(chunk_preset IN ('balanced', 'small', 'large', 'custom')),
      chunk_size_override INTEGER,
      chunk_overlap_override INTEGER,
      reindex_policy TEXT NOT NULL DEFAULT 'smart' CHECK(reindex_policy IN ('smart', 'always', 'never')),
      skipped_count INTEGER NOT NULL DEFAULT 0,
      skip_reasons TEXT NOT NULL DEFAULT '{}',
      last_run_metadata TEXT NOT NULL DEFAULT '{}',
      last_run_trigger TEXT CHECK(last_run_trigger IN ('manual', 'scheduled', 'triggered', 'auto')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Agent sync files table (track individual synced files)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_sync_files (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES agent_sync_folders(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      content_hash TEXT,
      size_bytes INTEGER,
      modified_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'indexed', 'error')),
      vector_point_ids TEXT DEFAULT '[]',
      chunk_count INTEGER DEFAULT 0,
      last_indexed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Indexes for agent sync tables
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_sync_folders_user_character
      ON agent_sync_folders (user_id, character_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_sync_files_folder
      ON agent_sync_files (folder_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_sync_files_character
      ON agent_sync_files (character_id)
  `);

  // Channel connections (per-agent external inbox)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK(channel_type IN ('whatsapp', 'telegram', 'slack')),
      display_name TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'connected', 'error')),
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_connections_user
      ON channel_connections (user_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_connections_character
      ON channel_connections (character_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_connections_type
      ON channel_connections (channel_type)
  `);

  // Channel conversations (map external peers to internal sessions)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_conversations (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK(channel_type IN ('whatsapp', 'telegram', 'slack')),
      peer_id TEXT NOT NULL,
      peer_name TEXT,
      thread_id TEXT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_conversations_connection
      ON channel_conversations (connection_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_conversations_character
      ON channel_conversations (character_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_conversations_peer
      ON channel_conversations (channel_type, peer_id, thread_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_conversations_session
      ON channel_conversations (session_id)
  `);

  // Channel message map (dedupe inbound/outbound)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK(channel_type IN ('whatsapp', 'telegram', 'slack')),
      external_message_id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_messages_connection
      ON channel_messages (connection_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_messages_external
      ON channel_messages (channel_type, external_message_id, direction)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_messages_session
      ON channel_messages (session_id)
  `);

  // Migration: Add embedding_model column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN embedding_model TEXT`);
    console.log("[SQLite Migration] Added embedding_model column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add is_primary column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0`);
    console.log("[SQLite Migration] Added is_primary column to agent_sync_folders");

    // Set the first folder of each character as primary if none are primary
    sqlite.exec(`
      UPDATE agent_sync_folders
      SET is_primary = 1
      WHERE id IN (
        SELECT id FROM agent_sync_folders asf1
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_sync_folders asf2
          WHERE asf2.character_id = asf1.character_id
          AND asf2.is_primary = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_sync_folders asf3
          WHERE asf3.character_id = asf1.character_id
          AND asf3.created_at < asf1.created_at
        )
      )
    `);
    console.log("[SQLite Migration] Initialized primary folders for existing characters");
  } catch (error) {
    // Column already exists or other error, ignore error
  }

  // Create index for primary flag after ensuring column exists
  try {
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS agent_sync_folders_primary_idx
      ON agent_sync_folders(character_id, is_primary)
    `);
  } catch (error) {
    console.error("[SQLite Migration] Failed to create primary index:", error);
  }

  // Migration: Add indexing_mode column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN indexing_mode TEXT NOT NULL DEFAULT 'auto'`);
    console.log("[SQLite Migration] Added indexing_mode column to agent_sync_folders");

    // Set smart defaults based on existing embeddingModel:
    // - If embeddingModel exists (NOT NULL) → "full" (was using embeddings)
    // - If embeddingModel is NULL → "files-only" (was not using embeddings)
    sqlite.exec(`
      UPDATE agent_sync_folders
      SET indexing_mode = CASE
        WHEN embedding_model IS NOT NULL THEN 'full'
        ELSE 'files-only'
      END
      WHERE indexing_mode = 'auto'
    `);
    console.log("[SQLite Migration] Set indexing_mode based on embedding_model presence");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add sync_mode column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'auto'`);
    console.log("[SQLite Migration] Added sync_mode column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add sync_cadence_minutes column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN sync_cadence_minutes INTEGER NOT NULL DEFAULT 60`);
    console.log("[SQLite Migration] Added sync_cadence_minutes column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add file_type_filters column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN file_type_filters TEXT NOT NULL DEFAULT '[]'`);
    console.log("[SQLite Migration] Added file_type_filters column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add max_file_size_bytes column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN max_file_size_bytes INTEGER NOT NULL DEFAULT 10485760`);
    console.log("[SQLite Migration] Added max_file_size_bytes column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add chunk_preset column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN chunk_preset TEXT NOT NULL DEFAULT 'balanced'`);
    console.log("[SQLite Migration] Added chunk_preset column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add chunk_size_override column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN chunk_size_override INTEGER`);
    console.log("[SQLite Migration] Added chunk_size_override column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add chunk_overlap_override column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN chunk_overlap_override INTEGER`);
    console.log("[SQLite Migration] Added chunk_overlap_override column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add reindex_policy column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN reindex_policy TEXT NOT NULL DEFAULT 'smart'`);
    console.log("[SQLite Migration] Added reindex_policy column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add skipped_count column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0`);
    console.log("[SQLite Migration] Added skipped_count column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add skip_reasons column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN skip_reasons TEXT NOT NULL DEFAULT '{}'`);
    console.log("[SQLite Migration] Added skip_reasons column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add last_run_metadata column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN last_run_metadata TEXT NOT NULL DEFAULT '{}'`);
    console.log("[SQLite Migration] Added last_run_metadata column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add last_run_trigger column to agent_sync_folders if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_sync_folders ADD COLUMN last_run_trigger TEXT`);
    console.log("[SQLite Migration] Added last_run_trigger column to agent_sync_folders");
  } catch {
    // Column already exists, ignore error
  }

  // Ensure legacy rows have safe defaults for the new columns.
  try {
    sqlite.exec(`
      UPDATE agent_sync_folders
      SET
        sync_mode = COALESCE(sync_mode, 'auto'),
        sync_cadence_minutes = COALESCE(sync_cadence_minutes, 60),
        file_type_filters = COALESCE(file_type_filters, '[]'),
        max_file_size_bytes = COALESCE(max_file_size_bytes, 10485760),
        chunk_preset = COALESCE(chunk_preset, 'balanced'),
        reindex_policy = COALESCE(reindex_policy, 'smart'),
        skipped_count = COALESCE(skipped_count, 0),
        skip_reasons = COALESCE(skip_reasons, '{}'),
        last_run_metadata = COALESCE(last_run_metadata, '{}')
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Failed to backfill vector sync defaults:", error);
  }

  // =========================================================================
  // Observability Tables (Agent Runs, Events, Prompt Versioning)
  // =========================================================================

  // Migration: Drop old agent_runs table if it has outdated CHECK constraints
  // This is safe because observability data is ephemeral and can be regenerated
  try {
    const tableInfo = sqlite.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_runs'`
    ).get() as { sql: string } | undefined;

    if (tableInfo?.sql && tableInfo.sql.includes("user_message")) {
      console.log("[SQLite Migration] Dropping agent_runs with outdated CHECK constraints");
      sqlite.exec(`DROP TABLE IF EXISTS agent_run_events`); // Drop events first (FK constraint)
      sqlite.exec(`DROP TABLE IF EXISTS agent_runs`);
    }
  } catch (error) {
    console.warn("[SQLite Migration] Failed to check agent_runs schema:", error);
  }

  // Agent runs table - top-level execution tracking
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      character_id TEXT,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      pipeline_name TEXT NOT NULL,
      pipeline_version TEXT,
      trigger_type TEXT NOT NULL DEFAULT 'api' CHECK(trigger_type IN ('chat', 'api', 'job', 'cron', 'webhook', 'tool')),
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'succeeded', 'failed', 'cancelled')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER,
      trace_id TEXT,
      span_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Migration: Ensure updated_at column exists in agent_runs
  try {
    const agentRunsColumns = sqlite.prepare("PRAGMA table_info(agent_runs)").all() as Array<{ name: string }>;
    const hasUpdatedAt = agentRunsColumns.some((column) => column.name === "updated_at");
    if (!hasUpdatedAt) {
      sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN updated_at TEXT`);
      sqlite.exec(`UPDATE agent_runs SET updated_at = COALESCE(updated_at, started_at, datetime('now'))`);
      console.log("[SQLite Migration] Added updated_at to agent_runs and backfilled values");
    }
  } catch (error) {
    console.warn("[SQLite Migration] Failed to ensure updated_at column on agent_runs:", error);
  }

  // Agent run events table - timeline of events within a run
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug', 'info', 'warn', 'error')),
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER,
      tool_name TEXT,
      tool_run_id TEXT REFERENCES tool_runs(id) ON DELETE SET NULL,
      pipeline_name TEXT,
      step_name TEXT,
      llm_operation TEXT,
      prompt_version_id TEXT REFERENCES prompt_versions(id) ON DELETE SET NULL,
      data TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Migration: Add message_id column to agent_run_events if it doesn't exist
  try {
    sqlite.exec(`ALTER TABLE agent_run_events ADD COLUMN message_id TEXT REFERENCES messages(id)`);
  } catch {
    // Column already exists, ignore error
  }

  // Prompt templates table - named prompt templates
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      template_key TEXT NOT NULL UNIQUE,
      name TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Prompt versions table - versioned prompt content
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Indexes for observability tables
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session
      ON agent_runs (session_id, started_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_runs_user
      ON agent_runs (user_id, started_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_runs_pipeline
      ON agent_runs (pipeline_name, started_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_run_events_run
      ON agent_run_events (run_id, timestamp ASC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_run_events_type
      ON agent_run_events (event_type, timestamp DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_template
      ON prompt_versions (template_id, version DESC)
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_hash
      ON prompt_versions (template_id, content_hash)
  `);

  // =========================================================================
  // Scheduled Tasks Tables
  // =========================================================================

  // Skills table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      prompt_template TEXT NOT NULL,
      input_parameters TEXT NOT NULL DEFAULT '[]',
      tool_hints TEXT NOT NULL DEFAULT '[]',
      trigger_examples TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'general',
      version INTEGER NOT NULL DEFAULT 1,
      copied_from_skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
      copied_from_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL DEFAULT 'conversation' CHECK(source_type IN ('conversation', 'manual', 'template')),
      source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      run_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skill_telemetry_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
      skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Scheduled tasks table - schedule definitions
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      schedule_type TEXT NOT NULL DEFAULT 'cron' CHECK(schedule_type IN ('cron', 'interval', 'once')),
      cron_expression TEXT,
      interval_minutes INTEGER,
      scheduled_at TEXT,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      initial_prompt TEXT NOT NULL,
      prompt_variables TEXT NOT NULL DEFAULT '{}',
      context_sources TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      max_retries INTEGER NOT NULL DEFAULT 3,
      timeout_ms INTEGER NOT NULL DEFAULT 300000,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('high', 'normal', 'low')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'paused', 'archived')),
      paused_at TEXT,
      paused_until TEXT,
      pause_reason TEXT,
      delivery_method TEXT NOT NULL DEFAULT 'session' CHECK(delivery_method IN ('session', 'email', 'slack', 'webhook', 'channel')),
      delivery_config TEXT NOT NULL DEFAULT '{}',
      result_session_id TEXT REFERENCES sessions(id),
      create_new_session_per_run INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_run_at TEXT,
      next_run_at TEXT,
      skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL
    )
  `);

  // Scheduled task runs table - execution history
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      agent_run_id TEXT,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout')),
      scheduled_for TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      result_summary TEXT,
      error TEXT,
      resolved_prompt TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Indexes for scheduled tasks
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_skills_user_character
      ON skills (user_id, character_id, status)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_skills_character_name
      ON skills (character_id, name)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_skill_telemetry_user_event
      ON skill_telemetry_events (user_id, event_type, created_at DESC)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_skill_telemetry_skill_event
      ON skill_telemetry_events (skill_id, event_type, created_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user
      ON scheduled_tasks (user_id, enabled, created_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_character
      ON scheduled_tasks (character_id, enabled)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
      ON scheduled_tasks (enabled, next_run_at)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task
      ON scheduled_task_runs (task_id, created_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status
      ON scheduled_task_runs (status, scheduled_for)
  `);

  // ==========================================================================
  // Plugin System Tables
  // ==========================================================================

  // Plugins table — installed plugin records
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'user' CHECK(scope IN ('user', 'project', 'local', 'managed')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'error')),
      marketplace_name TEXT,
      manifest TEXT NOT NULL DEFAULT '{}',
      components TEXT NOT NULL DEFAULT '{}',
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
      cache_path TEXT,
      last_error TEXT,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_plugins_user_scope
      ON plugins (user_id, scope, status)
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plugins_name_marketplace_user
      ON plugins (name, marketplace_name, user_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_plugins_character
      ON plugins (character_id)
  `);

  // Plugin hooks table — hook registrations from plugins
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugin_hooks (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      matcher TEXT,
      handler_type TEXT NOT NULL CHECK(handler_type IN ('command', 'prompt', 'agent')),
      command TEXT,
      timeout INTEGER DEFAULT 600,
      status_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_plugin_hooks_plugin_event
      ON plugin_hooks (plugin_id, event)
  `);

  // Plugin MCP servers table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugin_mcp_servers (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      server_name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_mcp_servers_plugin_server
      ON plugin_mcp_servers (plugin_id, server_name)
  `);

  // Plugin LSP servers table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugin_lsp_servers (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      server_name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_lsp_servers_plugin_server
      ON plugin_lsp_servers (plugin_id, server_name)
  `);

  // Plugin files table — raw file metadata from imported plugins
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugin_files (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      is_executable INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_plugin_files_plugin_path
      ON plugin_files (plugin_id, relative_path)
  `);

  // Plugin skill revisions table — editable skill content history
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugin_skill_revisions (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      namespaced_name TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      change_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_skill_revisions_plugin_name_version
      ON plugin_skill_revisions (plugin_id, namespaced_name, version)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_plugin_skill_revisions_plugin_name_created
      ON plugin_skill_revisions (plugin_id, namespaced_name, created_at)
  `);

  // Marketplaces table — registered marketplace catalogs
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS marketplaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      catalog TEXT,
      auto_update INTEGER NOT NULL DEFAULT 1,
      last_fetched_at TEXT,
      last_error TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_marketplaces_user
      ON marketplaces (user_id)
  `);

  // Agent workflows table — links an initiator agent with workflow metadata
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_workflows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      initiator_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'archived')),
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_workflows_user_status
      ON agent_workflows (user_id, status)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_workflows_initiator
      ON agent_workflows (initiator_id)
  `);

  // Agent workflow members table — maps agents into workflow membership and role
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_workflow_members (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('initiator', 'subagent')),
      source_path TEXT,
      metadata_seed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workflow_members_workflow_agent
      ON agent_workflow_members (workflow_id, agent_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_workflow_members_agent
      ON agent_workflow_members (agent_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_workflow_members_workflow_role
      ON agent_workflow_members (workflow_id, role)
  `);

  // Agent Plugins junction table — per-agent plugin assignments
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_plugins (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      workflow_id TEXT REFERENCES agent_workflows(id) ON DELETE SET NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    sqlite.exec(`ALTER TABLE agent_plugins ADD COLUMN workflow_id TEXT REFERENCES agent_workflows(id) ON DELETE SET NULL`);
    console.log("[SQLite Migration] Added workflow_id column to agent_plugins");
  } catch {
    // Column already exists
  }

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_plugins_agent_plugin
      ON agent_plugins (agent_id, plugin_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_plugins_agent
      ON agent_plugins (agent_id, enabled)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_plugins_plugin
      ON agent_plugins (plugin_id)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_plugins_workflow
      ON agent_plugins (workflow_id)
  `);

  console.log("[SQLite] All tables initialized (including plugin and workflow systems)");

  // Run data migrations
  runDataMigrations(sqlite);
  runSkillsMigrations(sqlite);
  runSessionMaintenance(sqlite);
}

/**
 * Run skills-related schema migrations.
 * These migrations add support for scripted skills (Agent Skills packages).
 */
function runSkillsMigrations(sqlite: Database.Database): void {
  try {
    // Check if skill_files table exists
    const tableExists = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='skill_files'
    `).get();

    if (!tableExists) {
      console.log("[SQLite Migration] Creating skill_files table...");
      
      // Create skill_files table
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS skill_files (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
          relative_path TEXT NOT NULL,
          content BLOB NOT NULL,
          mime_type TEXT,
          size INTEGER NOT NULL,
          is_executable INTEGER DEFAULT 0 NOT NULL,
          created_at TEXT DEFAULT (datetime('now')) NOT NULL
        )
      `);

      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_skill_files_skill_path 
        ON skill_files(skill_id, relative_path)
      `);

      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_skill_files_skill_created 
        ON skill_files(skill_id, created_at)
      `);

      console.log("[SQLite Migration] skill_files table created");
    }

    // Add new columns to skills table if they don't exist
    const columnsToAdd = [
      { name: "source_format", sql: "ALTER TABLE skills ADD COLUMN source_format TEXT DEFAULT 'prompt-only' NOT NULL" },
      { name: "has_scripts", sql: "ALTER TABLE skills ADD COLUMN has_scripts INTEGER DEFAULT 0 NOT NULL" },
      { name: "has_references", sql: "ALTER TABLE skills ADD COLUMN has_references INTEGER DEFAULT 0 NOT NULL" },
      { name: "has_assets", sql: "ALTER TABLE skills ADD COLUMN has_assets INTEGER DEFAULT 0 NOT NULL" },
      { name: "script_languages", sql: "ALTER TABLE skills ADD COLUMN script_languages TEXT DEFAULT '[]' NOT NULL" },
      { name: "package_version", sql: "ALTER TABLE skills ADD COLUMN package_version TEXT" },
      { name: "license", sql: "ALTER TABLE skills ADD COLUMN license TEXT" },
      { name: "compatibility", sql: "ALTER TABLE skills ADD COLUMN compatibility TEXT" },
    ];

    for (const column of columnsToAdd) {
      try {
        // Check if column exists
        const columnExists = sqlite.prepare(`
          SELECT COUNT(*) as count FROM pragma_table_info('skills') 
          WHERE name = ?
        `).get(column.name) as { count: number };

        if (columnExists.count === 0) {
          console.log(`[SQLite Migration] Adding column ${column.name} to skills table...`);
          sqlite.exec(column.sql);
        }
      } catch (error) {
        console.warn(`[SQLite Migration] Failed to add column ${column.name}:`, error);
      }
    }

    console.log("[SQLite Migration] Skills schema migrations complete");
  } catch (error) {
    console.error("[SQLite Migration] Skills migrations failed:", error);
  }
}

/**
 * Run data migrations to keep data consistent with code changes.
 * These migrations are idempotent and safe to run multiple times.
 */
function runDataMigrations(sqlite: Database.Database): void {
  // Migration: Mark old stuck pending documents as failed
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const stmt = sqlite.prepare(`
      UPDATE agent_documents
      SET status = 'failed',
          error_message = 'Processing timeout - please retry',
          updated_at = datetime('now')
      WHERE status = 'pending'
        AND created_at < ?
    `);
    const result = stmt.run(oneWeekAgo);
    if (result.changes > 0) {
      console.log(`[SQLite Migration] Marked ${result.changes} stuck documents as failed`);
    }
  } catch (error) {
    console.warn("[SQLite Migration] Stuck documents migration failed:", error);
  }

  // Migration: Rename tool names in character metadata (editRoomImage -> editImage)
  // This migration updates existing agent configurations to use the new tool name
  try {
    const toolRenameMap: Record<string, string> = {
      "editRoomImage": "editImage",
      // Add more renames here as needed
    };
    const toolsToRemove = ["batchEditRoomImage"];

    // Get all characters with metadata containing enabled tools
    const rows = sqlite.prepare(
      `SELECT id, metadata FROM characters WHERE metadata LIKE '%enabledTools%'`
    ).all() as Array<{ id: string; metadata: string }>;

    let updatedCount = 0;
    for (const row of rows) {
      try {
        const metadata = JSON.parse(row.metadata || "{}");
        if (!metadata.enabledTools || !Array.isArray(metadata.enabledTools)) {
          continue;
        }

        let modified = false;
        const newEnabledTools: string[] = [];

        for (const tool of metadata.enabledTools) {
          // Skip tools that should be removed
          if (toolsToRemove.includes(tool)) {
            modified = true;
            continue;
          }
          // Rename tools that need renaming
          if (toolRenameMap[tool]) {
            newEnabledTools.push(toolRenameMap[tool]);
            modified = true;
          } else {
            newEnabledTools.push(tool);
          }
        }

        if (modified) {
          metadata.enabledTools = newEnabledTools;
          sqlite.prepare(
            `UPDATE characters SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(JSON.stringify(metadata), row.id);
          updatedCount++;
        }
      } catch (parseError) {
        console.warn(`[SQLite Migration] Failed to parse metadata for character ${row.id}:`, parseError);
      }
    }

    if (updatedCount > 0) {
      console.log(`[SQLite Migration] Updated tool names in ${updatedCount} character(s)`);
    }
  } catch (error) {
    console.warn("[SQLite Migration] Tool name migration failed:", error);
    // Don't throw - this is a non-critical migration
  }

  // Migration: Ensure skills table exists for skill-linked prompting and scheduling.
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        prompt_template TEXT NOT NULL,
        input_parameters TEXT NOT NULL DEFAULT '[]',
        tool_hints TEXT NOT NULL DEFAULT '[]',
        trigger_examples TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT 'general',
        version INTEGER NOT NULL DEFAULT 1,
        copied_from_skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
        copied_from_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        source_type TEXT NOT NULL DEFAULT 'conversation' CHECK(source_type IN ('conversation', 'manual', 'template')),
        source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        run_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'archived')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_user_character
      ON skills (user_id, character_id, status)
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_character_name
      ON skills (character_id, name)
    `);

    const skillColumns = sqlite.prepare("PRAGMA table_info(skills)").all() as Array<{ name: string }>;
    const skillColumnNames = new Set(skillColumns.map((column) => column.name));
    const skillColumnsToAdd = [
      { name: "trigger_examples", sql: "ALTER TABLE skills ADD COLUMN trigger_examples TEXT NOT NULL DEFAULT '[]'" },
      { name: "category", sql: "ALTER TABLE skills ADD COLUMN category TEXT NOT NULL DEFAULT 'general'" },
      { name: "version", sql: "ALTER TABLE skills ADD COLUMN version INTEGER NOT NULL DEFAULT 1" },
      { name: "copied_from_skill_id", sql: "ALTER TABLE skills ADD COLUMN copied_from_skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL" },
      { name: "copied_from_character_id", sql: "ALTER TABLE skills ADD COLUMN copied_from_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL" },
    ];

    for (const column of skillColumnsToAdd) {
      if (!skillColumnNames.has(column.name)) {
        sqlite.exec(column.sql);
        console.log(`[SQLite Migration] Added column ${column.name} to skills`);
      }
    }

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_user_updated
      ON skills (user_id, updated_at)
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_user_category
      ON skills (user_id, category)
    `);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS skill_versions (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        prompt_template TEXT NOT NULL,
        input_parameters TEXT NOT NULL DEFAULT '[]',
        tool_hints TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        change_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_version
      ON skill_versions (skill_id, version)
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_created
      ON skill_versions (skill_id, created_at)
    `);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS skill_telemetry_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_telemetry_user_event
      ON skill_telemetry_events (user_id, event_type, created_at DESC)
    `);
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_skill_telemetry_skill_event
      ON skill_telemetry_events (skill_id, event_type, created_at DESC)
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Skills table migration failed:", error);
  }

  // Migration: Add new columns to scheduled_tasks for pause/resume and delivery
  try {
    // Check if columns exist by trying to query them
    const tableInfo = sqlite.prepare("PRAGMA table_info(scheduled_tasks)").all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map(c => c.name));

    const columnsToAdd = [
      { name: "paused_at", sql: "ALTER TABLE scheduled_tasks ADD COLUMN paused_at TEXT" },
      { name: "paused_until", sql: "ALTER TABLE scheduled_tasks ADD COLUMN paused_until TEXT" },
      { name: "pause_reason", sql: "ALTER TABLE scheduled_tasks ADD COLUMN pause_reason TEXT" },
      { name: "status", sql: "ALTER TABLE scheduled_tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'paused', 'archived'))" },
      { name: "delivery_method", sql: "ALTER TABLE scheduled_tasks ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'session'" },
      { name: "delivery_config", sql: "ALTER TABLE scheduled_tasks ADD COLUMN delivery_config TEXT NOT NULL DEFAULT '{}'" },
      { name: "skill_id", sql: "ALTER TABLE scheduled_tasks ADD COLUMN skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL" },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        sqlite.exec(col.sql);
        console.log(`[SQLite Migration] Added column ${col.name} to scheduled_tasks`);
      }
    }

    const updatedTableInfo = sqlite.prepare("PRAGMA table_info(scheduled_tasks)").all() as Array<{ name: string }>;
    const hasSkillId = updatedTableInfo.some((column) => column.name === "skill_id");
    if (hasSkillId) {
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_skill_id
          ON scheduled_tasks (skill_id)
      `);
    }
  } catch (error) {
    console.warn("[SQLite Migration] Scheduled tasks column migration failed:", error);
    // Don't throw - this is a non-critical migration
  }

  // Migration: Expand delivery_method constraint to include "channel"
  try {
    sqlite.exec("BEGIN IMMEDIATE");

    const tableSqlRow = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'"
    ).get() as { sql?: string } | undefined;
    const tableSql = tableSqlRow?.sql || "";
    if (!tableSql || tableSql.includes("'channel'")) {
      sqlite.exec("COMMIT");
    } else {
      console.log("[SQLite Migration] Updating scheduled_tasks delivery_method constraint to include channel");
      sqlite.exec("PRAGMA foreign_keys=OFF");
      try {
        sqlite.exec("ALTER TABLE scheduled_tasks RENAME TO scheduled_tasks_old");
        const oldTableExists = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks_old'"
        ).get();
        if (!oldTableExists) {
          sqlite.exec("ROLLBACK");
          console.warn("[SQLite Migration] scheduled_tasks_old missing after rename, skipping migration");
        } else {
          sqlite.exec(`
            CREATE TABLE scheduled_tasks (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              description TEXT,
              schedule_type TEXT NOT NULL DEFAULT 'cron' CHECK(schedule_type IN ('cron', 'interval', 'once')),
              cron_expression TEXT,
              interval_minutes INTEGER,
              scheduled_at TEXT,
              timezone TEXT NOT NULL DEFAULT 'UTC',
              initial_prompt TEXT NOT NULL,
              prompt_variables TEXT NOT NULL DEFAULT '{}',
              context_sources TEXT NOT NULL DEFAULT '[]',
              enabled INTEGER NOT NULL DEFAULT 1,
              max_retries INTEGER NOT NULL DEFAULT 3,
              timeout_ms INTEGER NOT NULL DEFAULT 300000,
              priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('high', 'normal', 'low')),
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'paused', 'archived')),
              paused_at TEXT,
              paused_until TEXT,
              pause_reason TEXT,
              delivery_method TEXT NOT NULL DEFAULT 'session' CHECK(delivery_method IN ('session', 'email', 'slack', 'webhook', 'channel')),
              delivery_config TEXT NOT NULL DEFAULT '{}',
              result_session_id TEXT REFERENCES sessions(id),
              skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
              create_new_session_per_run INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              last_run_at TEXT,
              next_run_at TEXT
            )
          `);
          sqlite.exec(`
            INSERT INTO scheduled_tasks (
              id, user_id, character_id, name, description, schedule_type, cron_expression,
              interval_minutes, scheduled_at, timezone, initial_prompt, prompt_variables,
              context_sources, enabled, max_retries, timeout_ms, priority, status, paused_at,
              paused_until, pause_reason, delivery_method, delivery_config, result_session_id,
              skill_id, create_new_session_per_run, created_at, updated_at, last_run_at, next_run_at
            )
            SELECT
              id, user_id, character_id, name, description, schedule_type, cron_expression,
              interval_minutes, scheduled_at, timezone, initial_prompt, prompt_variables,
              context_sources, enabled, max_retries, timeout_ms, priority, status, paused_at,
              paused_until, pause_reason, delivery_method, delivery_config, result_session_id,
              NULL as skill_id, create_new_session_per_run, created_at, updated_at, last_run_at, next_run_at
            FROM scheduled_tasks_old
          `);

          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user
              ON scheduled_tasks (user_id, enabled, created_at DESC)
          `);
          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_character
              ON scheduled_tasks (character_id, enabled)
          `);
          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
              ON scheduled_tasks (enabled, next_run_at)
          `);
          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_skill_id
              ON scheduled_tasks (skill_id)
          `);

          sqlite.exec("DROP TABLE IF EXISTS scheduled_tasks_old");
          sqlite.exec("COMMIT");
        }
      } catch (migrationError) {
        sqlite.exec("ROLLBACK");
        const hasOldTable = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks_old'"
        ).get();
        const hasNewTable = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'"
        ).get();
        if (hasOldTable && !hasNewTable) {
          sqlite.exec("ALTER TABLE scheduled_tasks_old RENAME TO scheduled_tasks");
        }
        console.warn("[SQLite Migration] Delivery method migration aborted:", migrationError);
      } finally {
        sqlite.exec("PRAGMA foreign_keys=ON");
      }
    }
  } catch (error) {
    try {
      if (sqlite.inTransaction) {
        sqlite.exec("ROLLBACK");
      }
    } catch {
      // ignore rollback errors
    }
    console.warn("[SQLite Migration] Scheduled tasks delivery_method migration failed:", error);
    // Don't throw - this is a non-critical migration
  }

  // Migration: Repair scheduled_task_runs foreign key if it points to scheduled_tasks_old
  try {
    const tableSqlRow = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduled_task_runs'"
    ).get() as { sql?: string } | undefined;
    const tableSql = tableSqlRow?.sql || "";
    if (tableSql && tableSql.includes("scheduled_tasks_old")) {
      console.log("[SQLite Migration] Updating scheduled_task_runs foreign key to scheduled_tasks");
      sqlite.exec("BEGIN IMMEDIATE");
      sqlite.exec("PRAGMA foreign_keys=OFF");
      try {
        sqlite.exec("ALTER TABLE scheduled_task_runs RENAME TO scheduled_task_runs_old");
        const oldTableExists = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_task_runs_old'"
        ).get();
        if (!oldTableExists) {
          sqlite.exec("ROLLBACK");
          console.warn("[SQLite Migration] scheduled_task_runs_old missing after rename, skipping migration");
        } else {
          sqlite.exec(`
            CREATE TABLE scheduled_task_runs (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
              agent_run_id TEXT,
              session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
              status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout')),
              scheduled_for TEXT NOT NULL,
              started_at TEXT,
              completed_at TEXT,
              duration_ms INTEGER,
              attempt_number INTEGER NOT NULL DEFAULT 1,
              result_summary TEXT,
              error TEXT,
              resolved_prompt TEXT,
              metadata TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          sqlite.exec(`
            INSERT INTO scheduled_task_runs (
              id, task_id, agent_run_id, session_id, status, scheduled_for, started_at,
              completed_at, duration_ms, attempt_number, result_summary, error, resolved_prompt,
              metadata, created_at
            )
            SELECT
              id, task_id, agent_run_id, session_id, status, scheduled_for, started_at,
              completed_at, duration_ms, attempt_number, result_summary, error, resolved_prompt,
              metadata, created_at
            FROM scheduled_task_runs_old
          `);

          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task
              ON scheduled_task_runs (task_id, created_at DESC)
          `);
          sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status
              ON scheduled_task_runs (status, scheduled_for)
          `);

          sqlite.exec("DROP TABLE IF EXISTS scheduled_task_runs_old");
          sqlite.exec("COMMIT");
        }
      } catch (migrationError) {
        sqlite.exec("ROLLBACK");
        const hasOldTable = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_task_runs_old'"
        ).get();
        const hasNewTable = sqlite.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_task_runs'"
        ).get();
        if (hasOldTable && !hasNewTable) {
          sqlite.exec("ALTER TABLE scheduled_task_runs_old RENAME TO scheduled_task_runs");
        }
        console.warn("[SQLite Migration] scheduled_task_runs foreign key migration aborted:", migrationError);
      } finally {
        sqlite.exec("PRAGMA foreign_keys=ON");
      }
    }
  } catch (error) {
    try {
      if (sqlite.inTransaction) {
        sqlite.exec("ROLLBACK");
      }
    } catch {
      // ignore rollback errors
    }
    console.warn("[SQLite Migration] scheduled_task_runs foreign key migration failed:", error);
  }

  // Migration: Ensure default agents do not auto-enable MCP tools
  try {
    const rows = sqlite.prepare(
      "SELECT id, metadata FROM characters WHERE is_default = 1"
    ).all() as Array<{ id: string; metadata: string }>;

    let updatedCount = 0;
    for (const row of rows) {
      try {
        const metadata = JSON.parse(row.metadata || "{}");
        metadata.enabledMcpServers = [];
        metadata.enabledMcpTools = [];
        metadata.mcpToolPreferences = {};
        sqlite.prepare(
          "UPDATE characters SET metadata = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(metadata), row.id);
        updatedCount++;
      } catch (parseError) {
        console.warn(`[SQLite Migration] Failed to update MCP defaults for character ${row.id}:`, parseError);
      }
    }

    if (updatedCount > 0) {
      console.log(`[SQLite Migration] Disabled MCP tools for ${updatedCount} default agent(s)`);
    }
  } catch (error) {
    console.warn("[SQLite Migration] Default agent MCP disable migration failed:", error);
  }

  // Migration: Add workflow folder inheritance tracking columns
  try {
    const folderCols = sqlite.prepare("PRAGMA table_info(agent_sync_folders)").all() as Array<{ name: string }>;
    const colNames = new Set(folderCols.map((c) => c.name));

    if (!colNames.has("inherited_from_workflow_id")) {
      sqlite.exec("ALTER TABLE agent_sync_folders ADD COLUMN inherited_from_workflow_id TEXT");
    }
    if (!colNames.has("inherited_from_agent_id")) {
      sqlite.exec("ALTER TABLE agent_sync_folders ADD COLUMN inherited_from_agent_id TEXT");
    }
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS agent_sync_folders_inherited_workflow_idx
      ON agent_sync_folders (inherited_from_workflow_id)
    `);
  } catch (error) {
    console.warn("[SQLite Migration] Workflow folder tracking columns migration failed:", error);
  }
}

// Check if we're in a build environment (Next.js static generation)
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" ||
  process.argv.some(arg => arg.includes("next") && process.argv.includes("build"));

// Export the database instance (lazy initialization to avoid build-time issues)
// During build time, we export a proxy that throws if accessed
export const db: BetterSQLite3Database<typeof schema> = isBuildTime
  ? (new Proxy({} as BetterSQLite3Database<typeof schema>, {
    get(_, prop) {
      if (prop === "then") return undefined; // Allow Promise checks
      throw new Error(`Database accessed during build time. Property: ${String(prop)}`);
    },
  }))
  : getDb();

// Export close function for cleanup
export function closeDb(): void {
  if (globalForDb.sqlite) {
    globalForDb.sqlite.close();
    globalForDb.sqlite = undefined;
    globalForDb.db = undefined;
    console.log("[SQLite] Database connection closed");
  }
}
