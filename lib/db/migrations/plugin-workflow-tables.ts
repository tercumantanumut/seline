import Database from "better-sqlite3";

/**
 * Initialize plugin and workflow tables:
 * plugins, plugin_hooks, plugin_mcp_servers, plugin_lsp_servers, plugin_files,
 * plugin_skill_revisions, marketplaces, agent_workflows, agent_workflow_members, agent_plugins.
 */
export function initPluginWorkflowTablesWith(sqlite: Database.Database): void {
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
}
