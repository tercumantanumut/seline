import { sql } from "drizzle-orm";
import { db } from "../sqlite-client";

export async function addPrimaryFolderFlag() {
    console.log("[Migration] Adding isPrimary column to agent_sync_folders...");

    try {
        // Check if column exists first to be idempotent
        // In Better-SQLite3 we can check table_info
        // But for simplicity with Drizzle/SQL we can try-catch or check metadata

        // Check if column exists
        const tableInfo = await db.run(sql`PRAGMA table_info(agent_sync_folders)`);
        // @ts-ignore - drizzle run return type can be complex
        const columns = tableInfo.values || [];
        const hasIsPrimary = columns.some((col: any) => col[1] === "is_primary");

        if (!hasIsPrimary) {
            // Add column with default false
            await db.run(sql`
        ALTER TABLE agent_sync_folders 
        ADD COLUMN is_primary INTEGER DEFAULT 0 NOT NULL
      `);
            console.log("[Migration] Added is_primary column");
        }

        // For each character, set the first folder (by created_at) as primary if none are primary
        // This query sets is_primary = 1 for the oldest folder of each character 
        // where that character doesn't already have a primary folder
        await db.run(sql`
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

        // Create index if it doesn't exist
        await db.run(sql`
      CREATE INDEX IF NOT EXISTS agent_sync_folders_primary_idx 
      ON agent_sync_folders(character_id, is_primary)
    `);

        console.log("[Migration] ✅ Successfully processed is_primary column and primary folders");
    } catch (error) {
        // If it's a "duplicate column name" error, we can ignore it
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("duplicate column name")) {
            console.log("[Migration] Column is_primary already exists, skipping ADD COLUMN");
        } else {
            console.error("[Migration] ❌ Failed to add isPrimary column:", error);
            throw error;
        }
    }
}
