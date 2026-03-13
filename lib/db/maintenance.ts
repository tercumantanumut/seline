import type Database from "better-sqlite3";

function recomputeVisibleConversationCounts(sqlite: Database.Database): void {
  const result = sqlite.prepare(`
    UPDATE sessions
    SET message_count = COALESCE((
      SELECT COUNT(*)
      FROM messages
      WHERE messages.session_id = sessions.id
        AND messages.role IN ('user', 'assistant')
        AND (
          messages.role != 'user'
          OR json_extract(messages.metadata, '$.livePromptInjected') IS NULL
          OR json_extract(messages.metadata, '$.livePromptInjected') = 0
        )
    ), 0)
    WHERE message_count != COALESCE((
      SELECT COUNT(*)
      FROM messages
      WHERE messages.session_id = sessions.id
        AND messages.role IN ('user', 'assistant')
        AND (
          messages.role != 'user'
          OR json_extract(messages.metadata, '$.livePromptInjected') IS NULL
          OR json_extract(messages.metadata, '$.livePromptInjected') = 0
        )
    ), 0)
  `).run();
  if (result.changes > 0) {
    console.log(`[SQLite Maintenance] Recomputed visible conversation counts for ${result.changes} session(s)`);
  }
}

export function runSessionMaintenance(sqlite: Database.Database): void {
  try {
    recomputeVisibleConversationCounts(sqlite);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const deletedResult = sqlite.prepare(`
      DELETE FROM sessions
      WHERE status = 'deleted'
        AND updated_at < ?
    `).run(thirtyDaysAgo);
    if (deletedResult.changes > 0) {
      console.log(`[SQLite Maintenance] Purged ${deletedResult.changes} deleted session(s) older than 30 days`);
    }

    const archivedResult = sqlite.prepare(`
      UPDATE sessions
      SET status = 'archived', updated_at = datetime('now')
      WHERE status = 'active'
        AND COALESCE(message_count, 0) = 0
        AND updated_at < ?
    `).run(ninetyDaysAgo);
    if (archivedResult.changes > 0) {
      console.log(`[SQLite Maintenance] Archived ${archivedResult.changes} empty inactive session(s)`);
    }
  } catch (error) {
    console.warn("[SQLite Maintenance] Session maintenance failed:", error);
  }
}

