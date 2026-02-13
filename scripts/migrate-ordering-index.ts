/**
 * Migration Script: Populate orderingIndex for existing messages
 *
 * This script backfills the orderingIndex column for all existing messages
 * based on their createdAt timestamps within each session.
 *
 * Run with: npx tsx scripts/migrate-ordering-index.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Find the database path - matches lib/db/sqlite-client.ts logic
function findDatabasePath(): string {
  // In Electron, LOCAL_DATA_PATH is set to userDataPath/data
  if (process.env.LOCAL_DATA_PATH) {
    const dataDir = process.env.LOCAL_DATA_PATH;
    return path.join(dataDir, "zlutty.db");
  }

  // For development/testing outside Electron
  const dataDir = path.join(process.cwd(), ".local-data");
  return path.join(dataDir, "zlutty.db");
}

interface MessageRow {
  id: string;
  session_id: string;
  created_at: string;
}

async function migrate() {
  const dbPath = findDatabasePath();
  console.log(`[MIGRATION] Using database: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[MIGRATION] Database not found at ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    // Check if ordering_index column exists
    const columns = db
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    const hasOrderingIndex = columns.some((col) => col.name === "ordering_index");

    if (!hasOrderingIndex) {
      console.log("[MIGRATION] ordering_index column does not exist. Adding it...");
      db.exec(`ALTER TABLE messages ADD COLUMN ordering_index INTEGER;`);
      console.log("[MIGRATION] ordering_index column added.");
    }

    // Check if last_ordering_index column exists in sessions
    const sessionColumns = db
      .prepare("PRAGMA table_info(sessions)")
      .all() as Array<{ name: string }>;
    const hasLastOrderingIndex = sessionColumns.some(
      (col) => col.name === "last_ordering_index"
    );

    if (!hasLastOrderingIndex) {
      console.log("[MIGRATION] last_ordering_index column does not exist in sessions. Adding it...");
      db.exec(`ALTER TABLE sessions ADD COLUMN last_ordering_index INTEGER DEFAULT 0;`);
      console.log("[MIGRATION] last_ordering_index column added to sessions.");
    }

    // Get all messages grouped by session, ordered by createdAt
    console.log("[MIGRATION] Fetching messages...");
    const messages = db
      .prepare(
        `
        SELECT id, session_id, created_at
        FROM messages
        ORDER BY session_id, created_at, id
      `
      )
      .all() as MessageRow[];

    console.log(`[MIGRATION] Found ${messages.length} messages to migrate`);

    if (messages.length === 0) {
      console.log("[MIGRATION] No messages to migrate.");
      return;
    }

    // Group messages by session
    const messagesBySession = new Map<string, MessageRow[]>();
    for (const msg of messages) {
      const sessionMessages = messagesBySession.get(msg.session_id) || [];
      sessionMessages.push(msg);
      messagesBySession.set(msg.session_id, sessionMessages);
    }

    console.log(`[MIGRATION] Found ${messagesBySession.size} sessions with messages`);

    // Update messages with orderingIndex
    const updateStmt = db.prepare(
      `UPDATE messages SET ordering_index = ? WHERE id = ?`
    );

    const updateSessionStmt = db.prepare(
      `UPDATE sessions SET last_ordering_index = ? WHERE id = ?`
    );

    db.exec("BEGIN TRANSACTION");

    try {
      let totalUpdated = 0;

      for (const [sessionId, sessionMessages] of messagesBySession) {
        let maxIndex = 0;

        for (let i = 0; i < sessionMessages.length; i++) {
          const orderingIndex = i + 1; // 1-based indexing
          const msg = sessionMessages[i];

          updateStmt.run(orderingIndex, msg.id);
          maxIndex = orderingIndex;
          totalUpdated++;

          if (totalUpdated % 1000 === 0) {
            console.log(`[MIGRATION] Updated ${totalUpdated} messages...`);
          }
        }

        // Update session's lastOrderingIndex
        updateSessionStmt.run(maxIndex, sessionId);
      }

      db.exec("COMMIT");

      console.log(`[MIGRATION] Successfully migrated ${totalUpdated} messages`);
      console.log(`[MIGRATION] Updated ${messagesBySession.size} sessions`);

      // Verify the migration
      const nullCount = db
        .prepare("SELECT COUNT(*) as count FROM messages WHERE ordering_index IS NULL")
        .get() as { count: number };

      if (nullCount.count > 0) {
        console.warn(`[MIGRATION] WARNING: ${nullCount.count} messages still have NULL ordering_index`);
      } else {
        console.log("[MIGRATION] All messages have ordering_index set.");
      }
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

migrate().catch((error) => {
  console.error("[MIGRATION] Migration failed:", error);
  process.exit(1);
});
