import Database from "better-sqlite3";
import { initCoreTablesWith } from "./migrations/core-tables";
import { initCharacterTablesWith } from "./migrations/character-tables";
import { initChannelTablesWith } from "./migrations/channel-tables";
import { initObservabilityTablesWith } from "./migrations/observability-tables";
import { initSkillsTablesWith, runSkillsMigrations } from "./migrations/skills-tables";
import { initPluginWorkflowTablesWith } from "./migrations/plugin-workflow-tables";
import { runDataMigrations } from "./migrations/data-migrations";

// Re-export for external consumers that import from this file path.
export { runSkillsMigrations } from "./migrations/skills-tables";
export { runDataMigrations } from "./migrations/data-migrations";

/**
 * Initialize all database tables and run inline schema migrations.
 * This function is idempotent and safe to call on every connection.
 */
export function initializeTables(sqlite: Database.Database): void {
  initCoreTablesWith(sqlite);
  initCharacterTablesWith(sqlite);
  initChannelTablesWith(sqlite);
  initObservabilityTablesWith(sqlite);
  initSkillsTablesWith(sqlite);
  initPluginWorkflowTablesWith(sqlite);

  console.log("[SQLite] All tables initialized (including plugin and workflow systems)");

  runDataMigrations(sqlite);
  runSkillsMigrations(sqlite);
}
