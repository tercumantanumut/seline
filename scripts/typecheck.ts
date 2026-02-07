#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

type SectionName = "app" | "lib" | "electron" | "tooling";

type Section = {
  name: SectionName;
  title: string;
  description: string;
  config: string;
};

type Result = {
  section: Section;
  ok: boolean;
  durationSeconds: number;
  errorCount: number;
  output: string;
};

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m"
} as const;

const SECTIONS: Section[] = [
  {
    name: "app",
    title: "Next App",
    description: "app/, components/, hooks/, i18n/, middleware/instrumentation",
    config: "tsconfig.app.json"
  },
  {
    name: "lib",
    title: "Shared Lib",
    description: "lib/ and shared type declarations",
    config: "tsconfig.lib.json"
  },
  {
    name: "electron",
    title: "Electron",
    description: "electron/ main + preload",
    config: "tsconfig.electron.json"
  },
  {
    name: "tooling",
    title: "Tooling",
    description: "root config files and scripts/",
    config: "tsconfig.tooling.json"
  }
];

function color(text: string, ansi: string): string {
  return `${ansi}${text}${COLORS.reset}`;
}

function line(width = 74): string {
  return "-".repeat(width);
}

function errorCount(output: string): number {
  const matches = output.match(/error TS\d+:/g);
  return matches ? matches.length : 0;
}

function selectSections(): Section[] {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return SECTIONS;
  }

  const requested = new Set(args.map((value) => value.trim().toLowerCase()));
  const selected = SECTIONS.filter((section) => requested.has(section.name));
  if (selected.length === 0) {
    const valid = SECTIONS.map((section) => section.name).join(", ");
    console.error(`Unknown section names. Valid values: ${valid}`);
    process.exit(1);
  }
  return selected;
}

async function run(section: Section): Promise<Result> {
  const start = performance.now();
  const tscPath = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");

  if (!existsSync(section.config)) {
    return {
      section,
      ok: false,
      durationSeconds: 0,
      errorCount: 1,
      output: `Missing config file: ${section.config}`
    };
  }

  if (!existsSync(tscPath)) {
    return {
      section,
      ok: false,
      durationSeconds: 0,
      errorCount: 1,
      output: "TypeScript binary not found at node_modules/typescript/bin/tsc"
    };
  }

  return new Promise<Result>((resolve) => {
    const proc = spawn(
      process.execPath,
      [tscPath, "-p", section.config, "--noEmit", "--pretty", "false"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      const output = `${stdout}${stderr}`.trim();
      resolve({
        section,
        ok: code === 0,
        durationSeconds: (performance.now() - start) / 1000,
        errorCount: errorCount(output),
        output
      });
    });

    proc.on("error", (err: Error) => {
      resolve({
        section,
        ok: false,
        durationSeconds: (performance.now() - start) / 1000,
        errorCount: 1,
        output: err.message
      });
    });
  });
}

function printHeader(section: Section, index: number, total: number): void {
  console.log("");
  console.log(color(line(), COLORS.cyan));
  console.log(
    color(`[${index}/${total}] ${section.title} (${section.name})`, COLORS.bold)
  );
  console.log(color(`Config: ${section.config}`, COLORS.dim));
  console.log(color(`Scope:  ${section.description}`, COLORS.dim));
  console.log(color(line(), COLORS.cyan));
}

function printSectionResult(result: Result): void {
  const status = result.ok
    ? color("PASS", COLORS.green)
    : color("FAIL", COLORS.red);
  const errSuffix =
    result.errorCount > 0 ? `, errors: ${result.errorCount}` : "";
  console.log(`${status} in ${result.durationSeconds.toFixed(2)}s${errSuffix}`);

  if (!result.ok && result.output) {
    console.log("");
    console.log(color("TypeScript output:", COLORS.yellow));
    console.log(result.output);
  }
}

function printSummary(results: Result[], totalSeconds: number): void {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("");
  console.log(color(line(), COLORS.bold));
  console.log(color("Typecheck Summary", COLORS.bold));
  console.log(color(line(), COLORS.bold));

  for (const result of results) {
    const status = result.ok
      ? color("PASS", COLORS.green)
      : color("FAIL", COLORS.red);
    const errors = result.errorCount.toString().padStart(2, " ");
    console.log(
      `${result.section.name.padEnd(10)} ${status}  ${result.durationSeconds
        .toFixed(2)
        .padStart(6, " ")}s  errors:${errors}`
    );
  }

  const totalLabel = `${passed} passed, ${failed} failed, ${results.length} total`;
  const totalColor = failed === 0 ? COLORS.green : COLORS.red;
  console.log("");
  console.log(color(totalLabel, totalColor));
  console.log(`Total time: ${totalSeconds.toFixed(2)}s`);
}

async function main(): Promise<void> {
  const selected = selectSections();
  const startedAt = performance.now();
  const results: Result[] = [];

  for (const [idx, section] of selected.entries()) {
    printHeader(section, idx + 1, selected.length);
    const result = await run(section);
    results.push(result);
    printSectionResult(result);
  }

  const totalSeconds = (performance.now() - startedAt) / 1000;
  printSummary(results, totalSeconds);

  if (results.some((r) => !r.ok)) {
    process.exit(1);
  }
}

void main();
