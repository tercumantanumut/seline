import Database from "better-sqlite3";

/**
 * Initialize observability tables: agent_runs, agent_run_events, prompt_templates, prompt_versions.
 */
export function initObservabilityTablesWith(sqlite: Database.Database): void {
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
}
