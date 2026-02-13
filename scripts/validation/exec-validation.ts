#!/usr/bin/env tsx
/**
 * Validation Execution Helper
 * 
 * Provides a standardized way to run validation scripts with dry-run support.
 * This helper shells out to validation scripts and aborts on non-zero exit codes.
 * 
 * Usage:
 *   import { execValidation } from "./exec-validation";
 *   await execValidation("validate-message-ordering-migration");
 * 
 * Or run directly:
 *   npx tsx scripts/validation/exec-validation.ts <validation-name> [--dry-run]
 */

import { spawn } from "child_process";
import { join } from "path";

export interface ValidationOptions {
  /** Run in dry-run mode (validate only, don't modify) */
  dryRun?: boolean;
  /** Additional arguments to pass to the validation script */
  args?: string[];
  /** Working directory for the validation script */
  cwd?: string;
}

export interface ValidationResult {
  /** Exit code from the validation script */
  exitCode: number;
  /** stdout output */
  stdout: string;
  /** stderr output */
  stderr: string;
  /** Whether the validation passed */
  success: boolean;
}

/**
 * Execute a validation script by name.
 * 
 * @param name - Name of the validation script (without .ts extension)
 * @param options - Validation options
 * @returns Promise<ValidationResult>
 * @throws Error if validation fails (non-zero exit code)
 * 
 * @example
 * ```typescript
 * // Dry-run validation
 * await execValidation("validate-message-ordering-migration", { dryRun: true });
 * 
 * // Full validation
 * await execValidation("validate-message-ordering-migration");
 * ```
 */
export async function execValidation(
  name: string,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const { dryRun = false, args = [], cwd = process.cwd() } = options;
  
  const scriptPath = join(__dirname, `${name}.ts`);
  const allArgs = [scriptPath, ...(dryRun ? ["--dry-run"] : []), ...args];

  console.log(`🔍 Running validation: ${name}${dryRun ? " (dry-run)" : ""}`);
  console.log(`   Command: tsx ${allArgs.join(" ")}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn("tsx", allArgs, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("close", (exitCode) => {
      const result: ValidationResult = {
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        success: exitCode === 0,
      };

      if (exitCode !== 0) {
        const error = new Error(
          `Validation "${name}" failed with exit code ${exitCode}`
        );
        (error as any).validationResult = result;
        reject(error);
      } else {
        console.log(`\n✅ Validation "${name}" passed`);
        resolve(result);
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to spawn validation script: ${error.message}`));
    });
  });
}

/**
 * Run multiple validations in sequence.
 * Stops on first failure.
 * 
 * @param validations - Array of validation names or [name, options] tuples
 * @returns Promise<ValidationResult[]>
 * @throws Error if any validation fails
 */
export async function execValidations(
  validations: Array<string | [string, ValidationOptions]>
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (const validation of validations) {
    const [name, options] = Array.isArray(validation) 
      ? validation 
      : [validation, {}];
    
    const result = await execValidation(name, options);
    results.push(result);
  }

  return results;
}

// ============================================================================
// CLI Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/validation/exec-validation.ts <validation-name> [--dry-run]");
    console.error("\nAvailable validations:");
    console.error("  - validate-message-ordering-migration");
    process.exit(1);
  }

  const name = args[0];
  const dryRun = args.includes("--dry-run");
  const extraArgs = args.slice(1).filter(arg => arg !== "--dry-run");

  try {
    await execValidation(name, { dryRun, args: extraArgs });
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Validation failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
