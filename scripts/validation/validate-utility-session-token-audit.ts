#!/usr/bin/env tsx
/**
 * Validate utility-session token audit behavior (read-only).
 *
 * Simulates repeated enhancement calls and reports estimated token usage
 * before/after memory dedup + session-scoped injection behavior.
 *
 * Usage:
 *   npx tsx scripts/validation/validate-utility-session-token-audit.ts [--dry-run]
 */

import { decideMemoryInjection } from "../../lib/ai/prompt-enhancement-memory";

interface WorkflowSample {
  name: string;
  memoryMarkdown: string;
  turns: number;
  sessions: number;
}

const WORKFLOWS: WorkflowSample[] = [
  {
    name: "single-session repeated enhance",
    memoryMarkdown: [
      "- Prefer concise responses",
      "- Use line-level file refs",
      "- Prefer concise responses",
      "- Validate assumptions before implementation",
      "- Use line-level file refs",
    ].join("\n"),
    turns: 6,
    sessions: 1,
  },
  {
    name: "two sessions same character",
    memoryMarkdown: [
      "- Keep backward compatibility",
      "- Avoid destructive git commands",
      "- Keep backward compatibility",
    ].join("\n"),
    turns: 4,
    sessions: 2,
  },
  {
    name: "multi-step with vector + web workflows",
    memoryMarkdown: [
      "- Keep response factual",
      "- Run dry-run validation first",
      "- Run dry-run validation first",
      "- Provide commit title and description",
    ].join("\n"),
    turns: 8,
    sessions: 1,
  },
];

function runSample(sample: WorkflowSample) {
  let baselineTokens = 0;
  let optimizedTokens = 0;

  for (let sessionIndex = 0; sessionIndex < sample.sessions; sessionIndex += 1) {
    let previousSignature: string | null = null;

    for (let turn = 0; turn < sample.turns; turn += 1) {
      const decision = decideMemoryInjection(sample.memoryMarkdown, previousSignature);
      previousSignature = decision.signature;

      baselineTokens += decision.tokenEstimateBeforeDedup;
      optimizedTokens += decision.tokenEstimateInjected;
    }
  }

  const saved = baselineTokens - optimizedTokens;
  const reductionPct = baselineTokens > 0 ? (saved / baselineTokens) * 100 : 0;

  return {
    ...sample,
    baselineTokens,
    optimizedTokens,
    saved,
    reductionPct,
  };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("\n=== Utility Session Token Audit Validation ===");
  console.log(`Mode: ${dryRun ? "dry-run" : "validate"}`);
  console.log("Read-only simulation. No DB writes, no network calls.\n");

  const results = WORKFLOWS.map(runSample);

  let totalBaseline = 0;
  let totalOptimized = 0;

  for (const result of results) {
    totalBaseline += result.baselineTokens;
    totalOptimized += result.optimizedTokens;

    console.log(`Scenario: ${result.name}`);
    console.log(`  sessions=${result.sessions}, turns=${result.turns}`);
    console.log(`  baselineTokens=${result.baselineTokens}`);
    console.log(`  optimizedTokens=${result.optimizedTokens}`);
    console.log(`  savedTokens=${result.saved}`);
    console.log(`  reduction=${result.reductionPct.toFixed(2)}%\n`);
  }

  const totalSaved = totalBaseline - totalOptimized;
  const totalReductionPct = totalBaseline > 0 ? (totalSaved / totalBaseline) * 100 : 0;

  console.log("=== Aggregate ===");
  console.log(`baselineTokens=${totalBaseline}`);
  console.log(`optimizedTokens=${totalOptimized}`);
  console.log(`savedTokens=${totalSaved}`);
  console.log(`reduction=${totalReductionPct.toFixed(2)}%`);

  if (totalSaved <= 0) {
    console.error("\nFAIL: expected positive token savings from dedup/session-scoped injection.");
    process.exit(1);
  }

  console.log("\nPASS: utility-session memory optimization reduces estimated token usage.");
}

main();
