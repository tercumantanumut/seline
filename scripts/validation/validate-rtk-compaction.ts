#!/usr/bin/env tsx
/**
 * RTK compaction validation (A/B).
 *
 * Compares direct command output vs RTK-wrapped output on the same command.
 * Uses app data paths (LOCAL_DATA_PATH/.local-data) for RTK_DB_PATH so results
 * reflect real app behavior.
 *
 * Usage examples:
 *   npx tsx scripts/validation/validate-rtk-compaction.ts --dry-run
 *   npx tsx scripts/validation/validate-rtk-compaction.ts
 *   npx tsx scripts/validation/validate-rtk-compaction.ts --command rg --args --files
 *   npx tsx scripts/validation/validate-rtk-compaction.ts --command npm --args run test:run
 */

import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { config as dotenvConfig } from "dotenv";

type CliOptions = {
  dryRun: boolean;
  cwd: string;
  command: string;
  args: string[];
  verbosity?: 0 | 1 | 2 | 3;
  ultraCompact?: boolean;
};

type RunResult = {
  label: "direct" | "rtk";
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
};

type AppSettingsSubset = {
  rtkVerbosity?: 0 | 1 | 2 | 3;
  rtkUltraCompact?: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    cwd: process.cwd(),
    command: "rg",
    args: ["--files"],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (token === "--cwd") {
      opts.cwd = resolve(argv[i + 1] || process.cwd());
      i += 1;
      continue;
    }
    if (token === "--command") {
      opts.command = argv[i + 1] || opts.command;
      i += 1;
      continue;
    }
    if (token === "--args") {
      const collected: string[] = [];
      for (let j = i + 1; j < argv.length; j += 1) {
        if (argv[j].startsWith("--")) {
          break;
        }
        collected.push(argv[j]);
        i = j;
      }
      opts.args = collected;
      continue;
    }
    if (token === "--verbosity") {
      const v = Number(argv[i + 1]);
      if ([0, 1, 2, 3].includes(v)) {
        opts.verbosity = v as 0 | 1 | 2 | 3;
      }
      i += 1;
      continue;
    }
    if (token === "--ultra-compact") {
      opts.ultraCompact = true;
      continue;
    }
  }

  return opts;
}

function getLocalDataPath(): string {
  return process.env.LOCAL_DATA_PATH || join(process.cwd(), ".local-data");
}

function getSettingsPath(): string {
  return join(getLocalDataPath(), "settings.json");
}

function loadSettingsSubset(): AppSettingsSubset {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as AppSettingsSubset;
    return {
      rtkVerbosity: parsed.rtkVerbosity,
      rtkUltraCompact: parsed.rtkUltraCompact,
    };
  } catch {
    return {};
  }
}

function resolveRtkBinary(): string {
  if (process.env.RTK_BINARY_PATH && process.env.RTK_BINARY_PATH.trim().length > 0) {
    return process.env.RTK_BINARY_PATH;
  }
  return "rtk";
}

function getRtkDbPath(): string {
  return join(getLocalDataPath(), "rtk", "history.db");
}

function resolveRtkFlags(cli: CliOptions, settings: AppSettingsSubset): string[] {
  const flags: string[] = [];

  const verbosity = cli.verbosity ?? settings.rtkVerbosity ?? 0;
  if (verbosity > 0) {
    flags.push(`-${"v".repeat(verbosity)}`);
  }

  const ultraCompact = cli.ultraCompact ?? settings.rtkUltraCompact ?? false;
  if (ultraCompact) {
    flags.push("-u");
  }

  return flags;
}

function hasExecutable(command: string, env: NodeJS.ProcessEnv): boolean {
  const check = spawnSync(command, ["--version"], {
    env,
    stdio: "ignore",
    shell: false,
    windowsHide: true,
  });

  if (check.error) {
    const code = (check.error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }

  return true;
}

function resolveCommandFallback(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): { command: string; args: string[]; fallbackUsed: boolean } {
  if (hasExecutable(command, env)) {
    return { command, args, fallbackUsed: false };
  }

  if (command === "rg") {
    // Keep a file-list baseline even when ripgrep is not installed.
    return { command: "find", args: [".", "-type", "f"], fallbackUsed: true };
  }

  return { command, args, fallbackUsed: false };
}

function runCommand(
  label: "direct" | "rtk",
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<RunResult> {
  const startedAt = Date.now();

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => rejectPromise(err));

    child.on("close", (exitCode, signal) => {
      resolvePromise({
        label,
        command,
        args,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function summarize(result: RunResult): void {
  const totalOutput = result.stdout + result.stderr;
  const lineCount = totalOutput.length === 0 ? 0 : totalOutput.split(/\r?\n/).length;
  console.log(`\n[${result.label.toUpperCase()}]`);
  console.log(`  cmd: ${result.command} ${result.args.join(" ")}`);
  console.log(`  exit: ${result.exitCode} signal: ${result.signal ?? "none"}`);
  console.log(`  duration_ms: ${result.durationMs}`);
  console.log(`  stdout_chars: ${result.stdout.length}`);
  console.log(`  stderr_chars: ${result.stderr.length}`);
  console.log(`  total_lines: ${lineCount}`);
  console.log(`  est_tokens: ${estimatedTokens(totalOutput)}`);
}

function printDelta(direct: RunResult, rtk: RunResult): void {
  const directChars = direct.stdout.length + direct.stderr.length;
  const rtkChars = rtk.stdout.length + rtk.stderr.length;
  const savedChars = directChars - rtkChars;
  const savingsPct = directChars > 0 ? (savedChars / directChars) * 100 : 0;

  const directTokens = estimatedTokens(direct.stdout + direct.stderr);
  const rtkTokens = estimatedTokens(rtk.stdout + rtk.stderr);
  const savedTokens = directTokens - rtkTokens;

  console.log("\n[COMPARISON]");
  console.log(`  chars_direct: ${directChars}`);
  console.log(`  chars_rtk: ${rtkChars}`);
  console.log(`  chars_saved: ${savedChars}`);
  console.log(`  savings_pct: ${savingsPct.toFixed(2)}%`);
  console.log(`  est_tokens_direct: ${directTokens}`);
  console.log(`  est_tokens_rtk: ${rtkTokens}`);
  console.log(`  est_tokens_saved: ${savedTokens}`);

  if (rtk.exitCode !== 0) {
    console.log("\n[RESULT] RTK run failed. Check stderr output and RTK installation.");
  } else if (savedChars > 0) {
    console.log("\n[RESULT] PASS: RTK compaction reduced output size.");
  } else {
    console.log("\n[RESULT] NO REDUCTION: Output was not smaller with RTK for this command.");
  }
}

async function main(): Promise<void> {
  dotenvConfig({ path: ".env.local" });

  const options = parseArgs(process.argv.slice(2));
  const settings = loadSettingsSubset();
  const rtkBinary = resolveRtkBinary();
  const rtkFlags = resolveRtkFlags(options, settings);
  const rtkDbPath = getRtkDbPath();

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    RTK_DB_PATH: rtkDbPath,
  };

  const resolved = resolveCommandFallback(options.command, options.args, baseEnv);
  const directCmd = resolved.command;
  const directArgs = resolved.args;

  const rtkCmd = rtkBinary;
  const rtkArgs = [...rtkFlags, directCmd, ...directArgs];

  console.log("RTK Compaction Validation");
  console.log("========================");
  console.log(`cwd: ${options.cwd}`);
  console.log(`local_data_path: ${getLocalDataPath()}`);
  console.log(`settings_path: ${getSettingsPath()}`);
  console.log(`rtk_db_path: ${rtkDbPath}`);
  console.log(`rtk_binary: ${rtkBinary}`);
  console.log(`rtk_flags: ${rtkFlags.length ? rtkFlags.join(" ") : "(none)"}`);
  console.log(`test_command: ${directCmd} ${directArgs.join(" ")}`);
  if (resolved.fallbackUsed) {
    console.log(`fallback: '${options.command}' not found, using '${directCmd} ${directArgs.join(" ")}'`);
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] No commands executed.");
    console.log(`Would run direct: ${directCmd} ${directArgs.join(" ")}`);
    console.log(`Would run rtk: ${rtkCmd} ${rtkArgs.join(" ")}`);
    process.exit(0);
  }

  const direct = await runCommand("direct", directCmd, directArgs, options.cwd, baseEnv);
  summarize(direct);

  let rtk: RunResult;
  try {
    rtk = await runCommand("rtk", rtkCmd, rtkArgs, options.cwd, baseEnv);
  } catch (error) {
    console.error("\n[ERROR] Failed to run RTK command.");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Tip: install RTK or set RTK_BINARY_PATH in .env.local.");
    process.exit(1);
    return;
  }

  summarize(rtk);
  printDelta(direct, rtk);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
