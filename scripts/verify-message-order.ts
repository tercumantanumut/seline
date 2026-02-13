/**
 * Verification Script: Message Ordering
 *
 * Verifies that all messages have proper orderingIndex values
 * and that there are no gaps or duplicates.
 *
 * Run with: npx tsx scripts/verify-message-order.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Find the database path
function findDatabasePath(): string {
  const possiblePaths = [
    path.join(process.cwd(), "data", "seline.db"),
    path.join(process.cwd(), "seline.db"),
    path.join(process.cwd(), "..", "data", "seline.db"),
    path.join(process.cwd(), "..", "seline.db"),
  ];

  for (const dbPath of possiblePaths) {
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }

  return path.join(process.cwd(), "data", "seline.db");
}

interface MessageRow {
  id: string;
  session_id: string;
  ordering_index: number | null;
  role: string;
}

async function verify() {
  const dbPath = findDatabasePath();
  console.log(`[VERIFY] Using database: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[VERIFY] Database not found at ${dbPath}`);
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
      console.error("[VERIFY] ordering_index column does not exist. Run migration first.");
      process.exit(1);
    }

    console.log("[VERIFY] Checking message ordering...");

    // Get all messages grouped by session
    const messages = db
      .prepare(
        `
        SELECT id, session_id, ordering_index, role
        FROM messages
        ORDER BY session_id, ordering_index, created_at
      `
      )
      .all() as MessageRow[];

    console.log(`[VERIFY] Found ${messages.length} messages`);

    // Group by session
    const messagesBySession = new Map<string, MessageRow[]>();
    for (const msg of messages) {
      const sessionMessages = messagesBySession.get(msg.session_id) || [];
      sessionMessages.push(msg);
      messagesBySession.set(msg.session_id, sessionMessages);
    }

    let totalErrors = 0;
    let sessionsWithErrors = 0;

    for (const [sessionId, sessionMessages] of messagesBySession) {
      const errors: string[] = [];

      // Check for NULL ordering indices
      const nullIndices = sessionMessages.filter((m) => m.ordering_index === null);
      if (nullIndices.length > 0) {
        errors.push(`${nullIndices.length} messages have NULL ordering_index`);
      }

      // Check for duplicates
      const indexCounts = new Map<number, number>();
      for (const msg of sessionMessages) {
        if (msg.ordering_index !== null) {
          const count = indexCounts.get(msg.ordering_index) || 0;
          indexCounts.set(msg.ordering_index, count + 1);
        }
      }

      for (const [index, count] of Array.from(indexCounts.entries())) {
        if (count > 1) {
          errors.push(`Duplicate ordering_index ${index} (${count} messages)`);
        }
      }

      // Check for gaps
      const sortedIndices = sessionMessages
        .map((m) => m.ordering_index)
        .filter((i): i is number => i !== null)
        .sort((a, b) => a - b);

      for (let i = 1; i < sortedIndices.length; i++) {
        const prev = sortedIndices[i - 1];
        const curr = sortedIndices[i];
        if (curr !== prev + 1) {
          errors.push(`Gap in ordering: ${prev} -> ${curr}`);
        }
      }

      // Check that indices start at 1
      if (sortedIndices.length > 0 && sortedIndices[0] !== 1) {
        errors.push(`First index is ${sortedIndices[0]}, expected 1`);
      }

      if (errors.length > 0) {
        sessionsWithErrors++;
        totalErrors += errors.length;
        console.error(`\n[VERIFY] Session ${sessionId} (${sessionMessages.length} messages):`);
        for (const error of errors) {
          console.error(`  ❌ ${error}`);
        }
      }
    }

    console.log("\n[VERIFY] Summary:");
    console.log(`  Total sessions: ${messagesBySession.size}`);
    console.log(`  Sessions with errors: ${sessionsWithErrors}`);
    console.log(`  Total errors: ${totalErrors}`);

    if (totalErrors === 0) {
      console.log("\n✅ All messages properly ordered");
      process.exit(0);
    } else {
      console.error(`\n❌ Found ${totalErrors} ordering issues`);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

verify().catch((error) => {
  console.error("[VERIFY] Verification failed:", error);
  process.exit(1);
});
