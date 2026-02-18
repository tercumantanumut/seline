#!/usr/bin/env tsx
/**
 * Validate tool error auditability guard rails.
 *
 * Verifies key code paths that prevent silent loss of failed tool context:
 * - localGrep honors regex flag (no implicit regex auto-detection)
 * - localGrep regex parse errors include actionable hints
 * - localGrep UI renders explicit error output
 * - compaction keeps failed tool results instead of compacting them away
 * - Antigravity Claude sanitization preserves error breadcrumbs
 *
 * Usage:
 *   npx tsx scripts/validation/validate-tool-error-auditability.ts [--dry-run]
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
    id: "localgrep-strict-regex-contract",
    description: "localGrep only enters regex mode when regex=true",
    filePath: "lib/ai/ripgrep/tool.ts",
    requiredSnippets: [
      "const isRegex = regex === true;",
      "buildRegexErrorHint(pattern, rawError)",
    ],
  },
  {
    id: "localgrep-ui-error-rendering",
    description: "Tool fallback explicitly renders localGrep error payload",
    filePath: "components/assistant-ui/tool-fallback.tsx",
    requiredSnippets: [
      "if (grepResult.status === \"error\")",
      "grepResult.error || \"Unknown localGrep error\"",
      "TOOL_RESULT_ERROR_PRE_CLASS",
    ],
  },
  {
    id: "compaction-preserves-failed-tools",
    description: "Compaction does not prune old failed tool results",
    filePath: "lib/context-window/compaction-service.ts",
    requiredSnippets: [
      "Keep failed tool results visible for forensic/audit history",
      "return { tokensFreed: 0, prunedCount: 0 };",
    ],
  },
  {
    id: "claude-sanitizer-error-breadcrumb",
    description: "Antigravity Claude sanitizer distinguishes prior tool errors",
    filePath: "app/api/chat/route.ts",
    requiredSnippets: [
      "[Previous ${toolName} error]",
      "const outputCandidate = rawPart.output !== undefined ? rawPart.output : rawPart.result;",
    ],
  },
  {
    id: "tool-discovery-literal-default-guidance",
    description: "Prompt guidance tells agent to default localGrep to literal mode",
    filePath: "lib/ai/prompts/shared-blocks.ts",
    requiredSnippets: [
      "Default \\`localGrep\\` to literal mode (\\`regex: false\\`) unless user explicitly asks for regex",
      "If regex mode fails with parse errors, suggest escaping metacharacters or switching to literal mode",
    ],
  },
];

function readUtf8(filePath: string): string {
  const absolutePath = path.join(process.cwd(), filePath);
  return fs.readFileSync(absolutePath, "utf-8");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  console.log("\n=== Tool Error Auditability Validation ===");
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
