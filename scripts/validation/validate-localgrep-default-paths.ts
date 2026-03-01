#!/usr/bin/env tsx
/**
 * Validate localGrep default path handling and workspace fallback contracts.
 *
 * Usage:
 *   npx tsx scripts/validation/validate-localgrep-default-paths.ts --dry-run
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Check {
  id: string;
  description: string;
  filePath: string;
  requiredSnippets: string[];
}

const checks: Check[] = [
  {
    id: "workspace-default-resolution",
    description: "localGrep resolves workspace path from session metadata before synced folders",
    filePath: "lib/ai/ripgrep/tool.ts",
    requiredSnippets: [
      "const workspacePath = await resolveWorkspaceSearchPath(sessionId);",
      "pathSource = \"workspace\";",
      "attemptedScopes.push(\"workspace\");",
    ],
  },
  {
    id: "same-call-fallback",
    description: "localGrep retries with synced folders in the same call when workspace returns zero matches",
    filePath: "lib/ai/ripgrep/tool.ts",
    requiredSnippets: [
      "if (!hasExplicitPaths && pathSource === \"workspace\" && searchResult.matches.length === 0)",
      "finalPathSource = \"workspace_then_synced\";",
      "fallbackUsed = true;",
    ],
  },
  {
    id: "structured-path-diagnostics",
    description: "localGrep response exposes path diagnostics for auditing",
    filePath: "lib/ai/ripgrep/tool.ts",
    requiredSnippets: [
      "pathSource: finalPathSource,",
      "attemptedScopes: attemptedScopes.length > 0 ? attemptedScopes : undefined,",
      "fallbackUsed,",
    ],
  },
  {
    id: "ui-success-message-visibility",
    description: "localGrep success message is rendered in tool fallback UI",
    filePath: "components/assistant-ui/tool-fallback.tsx",
    requiredSnippets: [
      "{grepResult.message && (",
      "text-terminal-muted",
    ],
  },
  {
    id: "tests-cover-workspace-defaults",
    description: "localGrep tests cover workspace-first and fallback-to-synced behavior",
    filePath: "tests/lib/ai/tools/local-grep-tool.test.ts",
    requiredSnippets: [
      "prefers workspace path when no explicit paths are provided",
      "retries with synced folders in same call when workspace search has zero matches",
      "pathSource: \"workspace_then_synced\"",
    ],
  },
];

function readUtf8(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  console.log("\n=== localGrep Default Path Validation ===");
  console.log(`Mode: ${dryRun ? "dry-run" : "validate"}`);
  console.log("This validation script is read-only and does not modify files.\n");

  let failed = 0;

  for (const check of checks) {
    const fileContent = readUtf8(check.filePath);
    const missing = check.requiredSnippets.filter((snippet) => !fileContent.includes(snippet));

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
}

main();
