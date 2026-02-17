/**
 * Post-Write Diagnostics
 *
 * Runs configurable post-edit checks after file write operations.
 * Checks are non-blocking and controlled from settings.
 */

import { extname } from "path";
import { executeCommandWithValidation } from "@/lib/command-execution";
import { loadSettings, type PostEditHooksPreset } from "@/lib/settings/settings-manager";

export interface DiagnosticResult {
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: string;
  tool: string;
}

type TypecheckScope = "auto" | "app" | "lib" | "electron" | "tooling" | "all";
type InvocationSource = "edit_file" | "write_file" | "patch_file";

interface ResolvedHookSettings {
  enabled: boolean;
  typecheckEnabled: boolean;
  lintEnabled: boolean;
  typecheckScope: TypecheckScope;
  runInPatchTool: boolean;
}

interface HookExecutionResult {
  tool: string;
  output: string;
  errors: number;
  warnings: number;
}

const PRESET_DEFAULTS: Record<PostEditHooksPreset, ResolvedHookSettings> = {
  off: {
    enabled: false,
    typecheckEnabled: false,
    lintEnabled: false,
    typecheckScope: "auto",
    runInPatchTool: false,
  },
  fast: {
    enabled: true,
    typecheckEnabled: true,
    lintEnabled: false,
    typecheckScope: "auto",
    runInPatchTool: false,
  },
  strict: {
    enabled: true,
    typecheckEnabled: true,
    lintEnabled: true,
    typecheckScope: "all",
    runInPatchTool: true,
  },
};

const TSC_CONFIGS: Record<Exclude<TypecheckScope, "auto">, string[]> = {
  app: ["tsconfig.app.json"],
  lib: ["tsconfig.lib.json"],
  electron: ["tsconfig.electron.json"],
  tooling: ["tsconfig.tooling.json"],
  all: [
    "tsconfig.app.json",
    "tsconfig.lib.json",
    "tsconfig.electron.json",
    "tsconfig.tooling.json",
  ],
};

function mapConfigToScript(config: string): string {
  switch (config) {
    case "tsconfig.app.json":
      return "typecheck:app";
    case "tsconfig.lib.json":
      return "typecheck:lib";
    case "tsconfig.electron.json":
      return "typecheck:electron";
    case "tsconfig.tooling.json":
      return "typecheck:tooling";
    default:
      return "typecheck:all";
  }
}

function resolveHookSettings(): ResolvedHookSettings {
  const settings = loadSettings();
  const preset = settings.postEditHooksPreset ?? "off";
  const defaults = PRESET_DEFAULTS[preset];

  return {
    enabled: settings.postEditHooksEnabled ?? defaults.enabled,
    typecheckEnabled: settings.postEditTypecheckEnabled ?? defaults.typecheckEnabled,
    lintEnabled: settings.postEditLintEnabled ?? defaults.lintEnabled,
    typecheckScope: settings.postEditTypecheckScope ?? defaults.typecheckScope,
    runInPatchTool: settings.postEditRunInPatchTool ?? defaults.runInPatchTool,
  };
}

function inferTypecheckScope(filePath: string): Exclude<TypecheckScope, "auto"> {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  if (normalized.includes("/electron/")) return "electron";
  if (normalized.includes("/lib/")) return "lib";
  if (
    normalized.includes("/app/") ||
    normalized.includes("/components/") ||
    normalized.includes("/hooks/") ||
    normalized.includes("/i18n/") ||
    normalized.includes("/middleware/")
  ) {
    return "app";
  }
  if (normalized.includes("/scripts/")) return "tooling";

  return "all";
}

function countTypeScriptIssues(output: string): { errors: number; warnings: number } {
  return {
    errors: (output.match(/error TS\d+:/g) ?? []).length,
    warnings: (output.match(/warning TS\d+:/g) ?? []).length,
  };
}

function countEslintIssues(output: string): { errors: number; warnings: number } {
  return {
    errors: (output.match(/\berror\b/gi) ?? []).length,
    warnings: (output.match(/\bwarning\b/gi) ?? []).length,
  };
}

function sanitizeDiagnosticOutput(output: string, maxLength: number = 3000): string {
  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.includes("node_modules/"));

  const filtered = lines.join("\n").trim();
  const value = filtered.length > 0 ? filtered : output.trim();
  return value.slice(0, maxLength);
}

async function runCommand(
  cwd: string,
  syncedFolders: string[],
  timeoutMs: number,
  command: string,
  args: string[]
): Promise<string> {
  const result = await executeCommandWithValidation(
    {
      command,
      args,
      cwd,
      characterId: "",
      timeout: timeoutMs,
    },
    syncedFolders
  );

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

async function runTypecheckHooks(
  filePath: string,
  cwd: string,
  syncedFolders: string[],
  timeoutMs: number,
  scope: TypecheckScope
): Promise<HookExecutionResult | null> {
  const selectedScope = scope === "auto" ? inferTypecheckScope(filePath) : scope;
  const configs = TSC_CONFIGS[selectedScope];

  const outputs: string[] = [];
  let errors = 0;
  let warnings = 0;

  for (const config of configs) {
    const output = await runCommand(cwd, syncedFolders, timeoutMs, "npm", [
      "run",
      "-s",
      mapConfigToScript(config),
    ]).catch(() => "");

    if (!output) continue;

    const counts = countTypeScriptIssues(output);
    errors += counts.errors;
    warnings += counts.warnings;
    outputs.push(`[tsc -p ${config}]\n${sanitizeDiagnosticOutput(output, 1800)}`);
  }

  if (errors === 0 && warnings === 0 && outputs.length === 0) return null;

  return {
    tool: "npx tsc",
    output: outputs.join("\n\n"),
    errors,
    warnings,
  };
}

async function runLintHook(
  filePath: string,
  cwd: string,
  syncedFolders: string[],
  timeoutMs: number
): Promise<HookExecutionResult | null> {
  const output = await runCommand(cwd, syncedFolders, timeoutMs, "npx", [
    "eslint",
    "--format",
    "compact",
    filePath,
  ]).catch(() => "");

  if (!output) return null;

  const sanitized = sanitizeDiagnosticOutput(output, 1800);
  const counts = countEslintIssues(sanitized);

  if (counts.errors === 0 && counts.warnings === 0 && !sanitized) return null;

  return {
    tool: "npx eslint",
    output: `[eslint]\n${sanitized}`,
    errors: counts.errors,
    warnings: counts.warnings,
  };
}

export async function runPostWriteDiagnostics(
  filePath: string,
  syncedFolders: string[],
  timeoutMs: number = 5000,
  source: InvocationSource = "write_file"
): Promise<DiagnosticResult | null> {
  const ext = extname(filePath).toLowerCase();
  const cwd = syncedFolders.find((folder) => filePath.startsWith(folder));
  if (!cwd) return null;

  const settings = resolveHookSettings();
  if (!settings.enabled) return null;
  if (source === "patch_file" && !settings.runInPatchTool) return null;

  const canTypecheck = ext === ".ts" || ext === ".tsx";
  const canLint = [".js", ".jsx", ".ts", ".tsx"].includes(ext);

  const hookResults: HookExecutionResult[] = [];

  if (settings.typecheckEnabled && canTypecheck) {
    const typecheckResult = await runTypecheckHooks(
      filePath,
      cwd,
      syncedFolders,
      timeoutMs,
      settings.typecheckScope
    );
    if (typecheckResult) hookResults.push(typecheckResult);
  }

  if (settings.lintEnabled && canLint) {
    const lintResult = await runLintHook(filePath, cwd, syncedFolders, timeoutMs);
    if (lintResult) hookResults.push(lintResult);
  }

  if (hookResults.length === 0) return null;

  const errorCount = hookResults.reduce((sum, item) => sum + item.errors, 0);
  const warningCount = hookResults.reduce((sum, item) => sum + item.warnings, 0);
  const diagnostics = hookResults.map((item) => item.output).join("\n\n").slice(0, 3000);

  if (errorCount === 0 && warningCount === 0 && !diagnostics) return null;

  return {
    hasErrors: errorCount > 0,
    errorCount,
    warningCount,
    diagnostics,
    tool: hookResults.map((item) => item.tool).join(", "),
  };
}
