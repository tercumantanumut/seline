/**
 * Real plugin test — runs our parser against actual plugins
 * from the official Anthropic marketplace and community.
 */
import { readFileSync } from "fs";
import { parsePluginPackage } from "../../../lib/plugins/import-parser";

async function testPlugin(name: string, zipPath: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`${"=".repeat(60)}`);

  try {
    const buffer = readFileSync(zipPath);
    const result = await parsePluginPackage(buffer);

    console.log(`  Manifest: ${result.manifest.name} v${result.manifest.version}`);
    console.log(`  Description: ${result.manifest.description}`);
    console.log(`  Author: ${JSON.stringify(result.manifest.author)}`);
    console.log(`  Legacy format: ${result.isLegacySkillFormat}`);
    console.log(`  Files: ${result.files.length}`);
    console.log(`  Skills: ${result.components.skills.length}`);
    result.components.skills.forEach((s) => {
      console.log(`    - ${s.namespacedName}: ${s.description || "(no description)"}`);
    });
    console.log(`  Agents: ${result.components.agents.length}`);
    result.components.agents.forEach((a) => {
      console.log(`    - ${a.name}: ${a.description || "(no description)"}`);
    });
    console.log(`  Hooks: ${result.components.hooks ? "yes" : "no"}`);
    if (result.components.hooks?.hooks) {
      for (const [event, entries] of Object.entries(result.components.hooks.hooks)) {
        console.log(`    - ${event}: ${(entries as unknown[]).length} entries`);
      }
    }
    console.log(`  MCP Servers: ${result.components.mcpServers ? Object.keys(result.components.mcpServers).join(", ") : "none"}`);
    console.log(`  LSP Servers: ${result.components.lspServers ? Object.keys(result.components.lspServers).join(", ") : "none"}`);
    console.log(`  Warnings: ${result.warnings.length}`);
    result.warnings.forEach((w) => console.log(`    ⚠ ${w}`));

    return { name, success: true };
  } catch (error) {
    console.error(`  FAILED: ${error instanceof Error ? error.message : error}`);
    return { name, success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const results = [];

  results.push(await testPlugin(
    "hookify (Anthropic official — hooks + commands + skills + agents)",
    "/tmp/real-plugin-test/hookify.zip"
  ));

  results.push(await testPlugin(
    "everything-claude-code (community — 13 agents, many commands/skills)",
    "/tmp/real-plugin-test/everything-claude-code.zip"
  ));

  results.push(await testPlugin(
    "pr-review-toolkit (Anthropic official — agents + commands)",
    "/tmp/real-plugin-test/pr-review-toolkit.zip"
  ));

  results.push(await testPlugin(
    "commit-commands (Anthropic official — simple commands)",
    "/tmp/real-plugin-test/commit-commands.zip"
  ));

  results.push(await testPlugin(
    "code-review (Anthropic official)",
    "/tmp/real-plugin-test/code-review.zip"
  ));

  results.push(await testPlugin(
    "agent-sdk-dev (Anthropic official)",
    "/tmp/real-plugin-test/agent-sdk-dev.zip"
  ));

  results.push(await testPlugin(
    "feature-dev (Anthropic official)",
    "/tmp/real-plugin-test/feature-dev.zip"
  ));

  results.push(await testPlugin(
    "frontend-design (Anthropic official)",
    "/tmp/real-plugin-test/frontend-design.zip"
  ));

  results.push(await testPlugin(
    "ralph-wiggum (Anthropic official)",
    "/tmp/real-plugin-test/ralph-wiggum.zip"
  ));

  results.push(await testPlugin(
    "security-guidance (Anthropic official)",
    "/tmp/real-plugin-test/security-guidance.zip"
  ));

  results.push(await testPlugin(
    "explanatory-output-style (Anthropic official)",
    "/tmp/real-plugin-test/explanatory-output-style.zip"
  ));

  results.push(await testPlugin(
    "learning-output-style (Anthropic official)",
    "/tmp/real-plugin-test/learning-output-style.zip"
  ));

  results.push(await testPlugin(
    "claude-opus-4-5-migration (Anthropic official)",
    "/tmp/real-plugin-test/claude-opus-4-5-migration.zip"
  ));

  results.push(await testPlugin(
    "plugin-dev (Anthropic official)",
    "/tmp/real-plugin-test/plugin-dev.zip"
  ));

  results.push(await testPlugin(
    "laravel-simplifier (Laravel/Taylor Otwell)",
    "/tmp/real-plugin-test/laravel-simplifier.zip"
  ));

  console.log(`\n${"=".repeat(60)}`);
  console.log("RESULTS SUMMARY");
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    console.log(`  ${r.success ? "PASS" : "FAIL"} ${r.name}`);
    if (!r.success) console.log(`       ${(r as any).error}`);
  }

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
