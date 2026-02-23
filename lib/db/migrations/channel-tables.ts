import Database from "better-sqlite3";

/**
 * Initialize channel tables: channel_connections, channel_conversations, channel_messages.
 */
export function initChannelTablesWith(sqlite: Database.Database): void {
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
}
