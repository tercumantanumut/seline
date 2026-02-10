/**
 * Post-Write Diagnostics
 *
 * After file write operations, attempts to run available linters/compilers
 * to detect errors introduced by the change. Results are appended to the
 * tool response so the LLM can self-correct.
 *
 * Non-blocking with a configurable timeout (default 5s).
 */

import { extname } from "path";
import { executeCommandWithValidation } from "@/lib/command-execution";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosticResult {
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: string;
  tool: string; // which linter/compiler produced this
}

// ---------------------------------------------------------------------------
// Linter Detection
// ---------------------------------------------------------------------------

interface LinterConfig {
  extensions: string[];
  command: string;
  args: (filePath: string) => string[];
  parseOutput: (stdout: string, stderr: string) => { errors: number; warnings: number };
}

const LINTER_CONFIGS: LinterConfig[] = [
  {
    extensions: [".ts", ".tsx"],
    command: "npx",
    args: (filePath) => ["tsc", "--noEmit", "--pretty", filePath],
    parseOutput: (stdout, stderr) => {
      const combined = stdout + stderr;
      const errorMatches = combined.match(/error TS\d+/g);
      const warningMatches = combined.match(/warning TS\d+/g);
      return {
        errors: errorMatches?.length ?? 0,
        warnings: warningMatches?.length ?? 0,
      };
    },
  },
  {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    command: "npx",
    args: (filePath) => ["eslint", "--no-eslintrc", "--format", "compact", filePath],
    parseOutput: (stdout, stderr) => {
      const combined = stdout + stderr;
      const errorMatches = combined.match(/Error -/g);
      const warningMatches = combined.match(/Warning -/g);
      return {
        errors: errorMatches?.length ?? 0,
        warnings: warningMatches?.length ?? 0,
      };
    },
  },
  {
    extensions: [".py"],
    command: "python3",
    args: (filePath) => ["-m", "py_compile", filePath],
    parseOutput: (_stdout, stderr) => ({
      errors: stderr.length > 0 ? 1 : 0,
      warnings: 0,
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run post-write diagnostics on a file.
 *
 * Attempts to find and run an appropriate linter for the file type.
 * Returns null if no linter is available or if the timeout is exceeded.
 *
 * @param filePath - Absolute path to the file that was written
 * @param syncedFolders - Allowed folder paths for CWD
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 */
export async function runPostWriteDiagnostics(
  filePath: string,
  syncedFolders: string[],
  timeoutMs: number = 5000
): Promise<DiagnosticResult | null> {
  const ext = extname(filePath).toLowerCase();

  // Find a matching linter
  const linter = LINTER_CONFIGS.find((l) => l.extensions.includes(ext));
  if (!linter) return null;

  // Determine CWD: use the first synced folder that contains this file
  const cwd = syncedFolders.find((folder) => filePath.startsWith(folder));
  if (!cwd) return null;

  try {
    const result = await executeCommandWithValidation(
      {
        command: linter.command,
        args: linter.args(filePath),
        cwd,
        characterId: "", // Not needed for direct execution
        timeout: timeoutMs,
      },
      syncedFolders
    );

    const { errors, warnings } = linter.parseOutput(result.stdout, result.stderr);
    const diagnosticOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    // Only return diagnostics if there's something to report
    if (errors === 0 && warnings === 0 && !diagnosticOutput) return null;

    return {
      hasErrors: errors > 0,
      errorCount: errors,
      warningCount: warnings,
      diagnostics: diagnosticOutput.slice(0, 3000), // Cap output size
      tool: `${linter.command} ${linter.args(filePath)[0]}`,
    };
  } catch {
    // Linter not available or timed out -- not an error
    return null;
  }
}
