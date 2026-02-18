#!/usr/bin/env tsx
/**
 * Validate macOS signing + notarization guard rails.
 *
 * Usage:
 *   npx tsx scripts/validation/validate-macos-signing-notarization.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";

interface GuardCheck {
  id: string;
  description: string;
  filePath: string;
  requiredSnippets: string[];
}

const checks: GuardCheck[] = [
  {
    id: "electron-builder-after-sign-hook",
    description: "electron-builder triggers notarization after signing",
    filePath: "electron-builder.yml",
    requiredSnippets: [
      'afterSign: "scripts/notarize.js"',
      "sign: true",
      "hardenedRuntime: true",
      'entitlements: "build-resources/entitlements.mac.plist"',
      'entitlementsInherit: "build-resources/entitlements.mac.inherit.plist"',
      "dmg:",
    ],
  },
  {
    id: "electron-builder-dmg-signing",
    description: "macOS DMG artifacts are signed",
    filePath: "electron-builder.yml",
    requiredSnippets: ["dmg:", "sign: true"],
  },
  {
    id: "notarize-script-supported-auth-strategies",
    description: "notarization script supports keychain, API key, and Apple ID auth",
    filePath: "scripts/notarize.js",
    requiredSnippets: [
      'tool: "notarytool"',
      "APPLE_KEYCHAIN_PROFILE",
      "APPLE_API_KEY",
      "APPLE_API_KEY_ID",
      "APPLE_API_ISSUER",
      "APPLE_ID",
      "APPLE_TEAM_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "Missing notarization credentials",
    ],
  },
  {
    id: "env-example-documents-notary-vars",
    description: ".env example documents notarization environment variables",
    filePath: ".env.example",
    requiredSnippets: [
      "APPLE_KEYCHAIN_PROFILE",
      "APPLE_API_KEY",
      "APPLE_API_KEY_ID",
      "APPLE_API_ISSUER",
      "APPLE_ID",
      "APPLE_TEAM_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_NOTARIZE_SKIP",
    ],
  },
];

function readUtf8(filePath: string): string {
  const absolutePath = path.join(process.cwd(), filePath);
  return fs.readFileSync(absolutePath, "utf-8");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  console.log("\n=== macOS Signing + Notarization Validation ===");
  console.log(`Mode: ${dryRun ? "dry-run" : "validate"}`);
  console.log("This script is read-only and performs no file writes.\n");

  let failed = 0;

  for (const check of checks) {
    const content = readUtf8(check.filePath);
    const missing = check.requiredSnippets.filter((snippet) => !content.includes(snippet));

    if (missing.length === 0) {
      console.log(`PASS ${check.id}`);
      console.log(`  ${check.description}`);
      continue;
    }

    failed += 1;
    console.error(`FAIL ${check.id}`);
    console.error(`  ${check.description}`);
    console.error(`  File: ${check.filePath}`);
    for (const snippet of missing) {
      console.error(`  Missing snippet: ${snippet}`);
    }
  }

  console.log("\n=== Validation Summary ===");
  if (failed > 0) {
    console.error(`Failed checks: ${failed}/${checks.length}`);
    process.exit(1);
  }

  console.log(`All checks passed: ${checks.length}/${checks.length}`);
  process.exit(0);
}

main();
