import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./sqlite-schema";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

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
};

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
      completed_at TEXT,
      duration_ms INTEGER,
      trace_id TEXT,
      span_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

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
      delivery_method TEXT NOT NULL DEFAULT 'session' CHECK(delivery_method IN ('session', 'email', 'slack', 'webhook')),
      delivery_config TEXT NOT NULL DEFAULT '{}',
      result_session_id TEXT REFERENCES sessions(id),
      create_new_session_per_run INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_run_at TEXT,
      next_run_at TEXT
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

  console.log("[SQLite] All tables initialized");

  // Run data migrations
  runDataMigrations(sqlite);
}

/**
 * Run data migrations to keep data consistent with code changes.
 * These migrations are idempotent and safe to run multiple times.
 */
function runDataMigrations(sqlite: Database.Database): void {
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
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        sqlite.exec(col.sql);
        console.log(`[SQLite Migration] Added column ${col.name} to scheduled_tasks`);
      }
    }
  } catch (error) {
    console.warn("[SQLite Migration] Scheduled tasks column migration failed:", error);
    // Don't throw - this is a non-critical migration
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
