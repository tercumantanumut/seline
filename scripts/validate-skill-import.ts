#!/usr/bin/env tsx

import { parseSkillPackage } from "../lib/skills/import-parser";
import fs from "fs/promises";

interface ValidationOptions {
  filePath: string;
  dryRun: boolean;
  verbose: boolean;
}

async function validateSkillPackage(options: ValidationOptions) {
  const { filePath, dryRun, verbose } = options;

  console.log(`\n🔍 Validating skill package: ${filePath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE IMPORT"}\n`);

  try {
    // Read file
    const buffer = await fs.readFile(filePath);
    console.log(`✓ File read successfully (${(buffer.length / 1024).toFixed(2)} KB)`);

    // Parse package
    const parsed = await parseSkillPackage(buffer);
    console.log(`✓ Package parsed successfully`);

    // Display results
    console.log(`\n📦 Package Contents:`);
    console.log(`  Name: ${parsed.name}`);
    console.log(`  Description: ${parsed.description}`);
    console.log(`  License: ${parsed.license || "None"}`);
    console.log(`  Compatibility: ${parsed.compatibility || "None"}`);
    console.log(`  Allowed Tools: ${parsed.allowedTools?.join(", ") || "None specified"}`);

    console.log(`\n📁 Files:`);
    console.log(`  Total files: ${parsed.files.length}`);
    console.log(`  Scripts: ${parsed.scripts.length}`);
    console.log(`  References: ${parsed.references.length}`);
    console.log(`  Assets: ${parsed.assets.length}`);

    if (verbose && parsed.scripts.length > 0) {
      console.log(`\n📜 Scripts:`);
      for (const script of parsed.scripts) {
        console.log(`  - ${script.relativePath} (${(script.size / 1024).toFixed(2)} KB, ${script.mimeType})`);
      }
    }

    if (verbose && parsed.files.length > 0) {
      console.log(`\n📄 All Files:`);
      for (const file of parsed.files) {
        console.log(`  - ${file.relativePath} (${(file.size / 1024).toFixed(2)} KB)`);
      }
    }

    console.log(`\n✅ Validation successful!`);

    if (dryRun) {
      console.log(`\n⚠️  DRY RUN MODE: No data was written to the database.`);
      console.log(`Remove --dry-run flag to perform actual import.`);
    }

    return { success: true, parsed };
  } catch (error) {
    console.error(`\n❌ Validation failed:`);
    console.error(error instanceof Error ? error.message : String(error));
    
    if (verbose && error instanceof Error && error.stack) {
      console.error(`\nStack trace:`);
      console.error(error.stack);
    }

    return { success: false, error };
  }
}

// CLI interface
const args = process.argv.slice(2);
const options: ValidationOptions = {
  filePath: args.find((arg) => !arg.startsWith("--")) || "",
  dryRun: args.includes("--dry-run"),
  verbose: args.includes("--verbose") || args.includes("-v"),
};

if (!options.filePath) {
  console.error("Usage: tsx scripts/validate-skill-import.ts <path-to-zip> [--dry-run] [--verbose]");
  process.exit(1);
}

validateSkillPackage(options).then((result) => {
  process.exit(result.success ? 0 : 1);
});
