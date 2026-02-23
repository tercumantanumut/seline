import Database from "better-sqlite3";

/**
 * Initialize skills-related tables: skills, skill_telemetry_events,
 * scheduled_tasks, scheduled_task_runs.
 */
export function initSkillsTablesWith(sqlite: Database.Database): void {
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
}

/**
 * Run skills-related schema migrations.
 * These migrations add support for scripted skills (Agent Skills packages).
 */
export function runSkillsMigrations(sqlite: Database.Database): void {
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
