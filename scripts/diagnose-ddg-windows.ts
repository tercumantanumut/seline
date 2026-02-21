#!/usr/bin/env tsx
/**
 * Windows-focused DDG diagnostics.
 *
 * Usage:
 *   npx tsx scripts/diagnose-ddg-windows.ts
 *   npx tsx scripts/diagnose-ddg-windows.ts --query "latest ai news"
 *   npx tsx scripts/diagnose-ddg-windows.ts --apply
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createDDGS } from "@/lib/ai/web-search/ddgs";

type Backend = "lite" | "html" | "auto";
type Scenario = { name: string; overrides: Record<string, string | undefined> };
type ScenarioResult = { name: string; counts: Record<Backend, number>; errors: string[]; overrides: Scenario["overrides"] };

const backends: Backend[] = ["lite", "html", "auto"];
const argList = process.argv.slice(2);
const applyFix = argList.includes("--apply");
const queryFlag = argList.indexOf("--query");
const query = queryFlag >= 0 && argList[queryFlag + 1] ? argList[queryFlag + 1] : "openai";
const systemProxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.ALL_PROXY;

function setEnv(overrides: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const restore = setEnv(scenario.overrides);
  const counts: Record<Backend, number> = { lite: 0, html: 0, auto: 0 };
  const errors: string[] = [];

  try {
    const ddgs = await createDDGS();
    for (const backend of backends) {
      try {
        const result = await ddgs.text({ keywords: query, maxResults: 3, backend });
        counts[backend] = Array.isArray(result) ? result.length : 0;
      } catch (error: any) {
        errors.push(`${backend}: ${error?.message ?? String(error)}`);
      }
    }
  } finally {
    restore();
  }

  return { name: scenario.name, counts, errors, overrides: scenario.overrides };
}

function upsertEnv(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const base = content.trimEnd();
  return base.length > 0 ? `${base}\n${line}\n` : `${line}\n`;
}

function applyEnvFixes(overrides: Record<string, string | undefined>) {
  const envPath = join(process.cwd(), ".env.local");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  let next = current;

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) next = upsertEnv(next, key, value);
  }

  if (next !== current) {
    writeFileSync(envPath, next, "utf8");
    console.log(`Applied recommended DDG env overrides to ${envPath}`);
  } else {
    console.log("No .env.local changes were necessary.");
  }
}

async function main() {
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Node: ${process.version}`);
  console.log(`Query: ${query}`);
  console.log(`HTTPS_PROXY=${process.env.HTTPS_PROXY ?? "(unset)"}`);
  console.log(`DDG_VERIFY_TLS=${process.env.DDG_VERIFY_TLS ?? "(unset)"}`);
  console.log(`DDG_TIMEOUT_MS=${process.env.DDG_TIMEOUT_MS ?? "(unset)"}`);

  const scenarios: Scenario[] = [
    { name: "default", overrides: {} },
    { name: "timeout-20s", overrides: { DDG_TIMEOUT_MS: "20000" } },
    { name: "tls-off", overrides: { DDG_VERIFY_TLS: "false" } },
    { name: "tls-off-timeout-20s", overrides: { DDG_VERIFY_TLS: "false", DDG_TIMEOUT_MS: "20000" } },
  ];

  if (systemProxy) {
    scenarios.push({ name: "proxy-timeout-20s", overrides: { DDG_PROXY: systemProxy, DDG_TIMEOUT_MS: "20000" } });
  }

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const output = await runScenario(scenario);
    results.push(output);
    console.log(`${scenario.name}: lite=${output.counts.lite}, html=${output.counts.html}, auto=${output.counts.auto}`);
    if (output.errors.length > 0) console.log(`  errors: ${output.errors.join(" | ")}`);
  }

  const defaultResult = results.find((r) => r.name === "default");
  const winner = results.find((r) => r.counts.lite > 0) ?? results.find((r) => r.counts.auto > 0 || r.counts.html > 0);

  if (!winner) {
    console.log("No scenario returned results. Check firewall/proxy/corporate TLS interception first.");
    return;
  }

  if (defaultResult && defaultResult.counts.lite > 0) {
    console.log("Default scenario works. The 0-results issue is likely app runtime config or environment-specific.");
    return;
  }

  console.log(`Recommended workaround: ${winner.name}`);
  for (const [key, value] of Object.entries(winner.overrides)) {
    if (value !== undefined) console.log(`  ${key}=${value}`);
  }

  if (applyFix) {
    applyEnvFixes(winner.overrides);
  } else {
    console.log("Run with --apply to write the recommended overrides into .env.local.");
  }
}

main().catch((error) => {
  console.error("DDG Windows diagnosis failed:", error);
  process.exit(1);
});
