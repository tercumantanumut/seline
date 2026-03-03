/**
 * One-shot LanceDB compaction script.
 * Run with: npx tsx scripts/compact-vectordb.ts [--dry-run]
 *
 * Compacts all agent tables, merging fragmented data files and
 * removing old versions to reclaim disk space.
 */

import * as lancedb from "@lancedb/lancedb";
import { join } from "path";
import { readdirSync, statSync } from "fs";

const VECTORDB_PATH = join(
  process.env.HOME || "",
  "Library/Application Support/seline/data/vectordb"
);

const isDryRun = process.argv.includes("--dry-run");

function getTableSize(tablePath: string): string {
  let total = 0;
  const walk = (dir: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else total += statSync(full).size;
      }
    } catch {}
  };
  walk(tablePath);
  const gb = total / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(total / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  console.log(`[compact-vectordb] VectorDB path: ${VECTORDB_PATH}`);
  console.log(`[compact-vectordb] Mode: ${isDryRun ? "DRY RUN" : "LIVE"}\n`);

  const db = await lancedb.connect(VECTORDB_PATH);
  const tables = await db.tableNames();
  const agentTables = tables.filter((t) => t.startsWith("agent_"));

  console.log(`Found ${agentTables.length} agent tables:\n`);

  for (const tableName of agentTables) {
    const tablePath = join(VECTORDB_PATH, `${tableName}.lance`);
    const sizeBefore = getTableSize(tablePath);
    const table = await db.openTable(tableName);
    const rows = await table.countRows();

    let dataFiles = 0;
    try {
      dataFiles = readdirSync(join(tablePath, "data")).length;
    } catch {}

    console.log(`  ${tableName}: ${rows} rows, ${dataFiles} data fragments, ${sizeBefore}`);

    if (isDryRun) {
      console.log(`    → [DRY RUN] Would compact and clean up old versions\n`);
      continue;
    }

    try {
      const stats = await table.optimize({ cleanupOlderThan: new Date() });
      const sizeAfter = getTableSize(tablePath);
      console.log(
        `    → Compacted: ${stats.compaction.fragmentsRemoved} fragments removed, ` +
        `${stats.compaction.fragmentsAdded} added`
      );
      console.log(`    → Size: ${sizeBefore} → ${sizeAfter}\n`);
    } catch (err) {
      console.error(`    → ERROR compacting: ${err}\n`);
    }
  }

  console.log("[compact-vectordb] Done.");
}

main().catch(console.error);
