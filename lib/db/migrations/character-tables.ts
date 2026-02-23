import Database from "better-sqlite3";

/**
 * Initialize character-related tables: characters, character_images, agent_documents,
 * agent_document_chunks, agent_sync_folders, agent_sync_files.
 */
export function initCharacterTablesWith(sqlite: Database.Database): void {
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
}
