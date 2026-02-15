#!/usr/bin/env tsx
/**
 * Validate chat overflow guard rails.
 *
 * Ensures critical UI containers keep long unbroken tool/chat output from
 * stretching the session layout horizontally.
 *
 * Usage:
 *   npx tsx scripts/validation/validate-chat-overflow-guards.ts [--dry-run]
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
    id: "thread-viewport-overflow-containment",
    description: "Thread viewport clips horizontal overflow and allows flex shrink",
    filePath: "components/assistant-ui/thread.tsx",
    requiredSnippets: [
      "flex min-w-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto",
    ],
  },
  {
    id: "assistant-message-flex-shrink",
    description: "Assistant message container and content column can shrink within flex rows",
    filePath: "components/assistant-ui/thread.tsx",
    requiredSnippets: [
      "max-w-[80rem] min-w-0 gap-3",
      "flex min-w-0 flex-1 flex-col gap-2",
      "flex min-w-0 flex-col gap-1",
    ],
  },
  {
    id: "tool-fallback-wrap-helpers",
    description: "Tool fallback uses shared wrap-safe classes for text and pre blocks",
    filePath: "components/assistant-ui/tool-fallback.tsx",
    requiredSnippets: [
      "const TOOL_RESULT_TEXT_CLASS",
      "const TOOL_RESULT_PRE_CLASS",
      "[overflow-wrap:anywhere]",
      "<div className={cn(\"font-mono\", TOOL_RESULT_TEXT_CLASS)}>",
      "<pre className={cn(\"max-h-64\", TOOL_RESULT_PRE_CLASS)}>",
    ],
  },
  {
    id: "terminal-prompt-long-command-wrap",
    description: "Terminal prompt wraps long commands/results instead of expanding layout",
    filePath: "components/ui/terminal-prompt.tsx",
    requiredSnippets: [
      "min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
    ],
  },
];

function readUtf8(filePath: string): string {
  const absolutePath = path.join(process.cwd(), filePath);
  return fs.readFileSync(absolutePath, "utf-8");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  console.log("\n=== Chat Overflow Guard Validation ===");
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
