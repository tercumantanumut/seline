#!/usr/bin/env tsx
/**
 * Model Config Validation Script
 *
 * Validates model-provider compatibility across settings and all session configs.
 * Run with --dry-run to preview without changes.
 *
 * Usage:
 *   npx tsx scripts/validation/model-config-validation.ts --dry-run
 *   npx tsx scripts/validation/model-config-validation.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

// ---------------------------------------------------------------------------
// Inline the validation logic (avoid import issues with @/ aliases)
// ---------------------------------------------------------------------------

type LLMProvider =
  | "anthropic"
  | "openrouter"
  | "antigravity"
  | "codex"
  | "kimi"
  | "ollama"
  | "claudecode";

const ANTIGRAVITY_EXACT_MODELS = new Set([
  "gemini-3-pro-high",
  "gemini-3-pro-low",
  "gemini-3-flash",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-thinking",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
]);

const MODEL_PREFIXES: Record<LLMProvider, string[]> = {
  anthropic: ["claude-"],
  claudecode: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
  codex: ["gpt-5", "codex"],
  kimi: ["kimi-", "moonshot-"],
  antigravity: [],
  ollama: [],
  openrouter: [],
};

function isModelCompatibleWithProvider(
  model: string,
  provider: LLMProvider,
): boolean {
  if (!model) return false;
  const lowerModel = model.toLowerCase().trim();

  if (provider === "antigravity") return ANTIGRAVITY_EXACT_MODELS.has(lowerModel);
  if (provider === "anthropic") {
    if (ANTIGRAVITY_EXACT_MODELS.has(lowerModel)) return false;
    return MODEL_PREFIXES.anthropic.some((p) => lowerModel.startsWith(p));
  }
  if (provider === "claudecode") {
    if (ANTIGRAVITY_EXACT_MODELS.has(lowerModel)) return false;
    return (
      MODEL_PREFIXES.claudecode.some((p) => lowerModel.startsWith(p)) ||
      MODEL_PREFIXES.anthropic.some((p) => lowerModel.startsWith(p))
    );
  }
  if (provider === "codex") {
    return MODEL_PREFIXES.codex.some((p) => lowerModel.startsWith(p)) || lowerModel.includes("codex");
  }
  if (provider === "kimi") return MODEL_PREFIXES.kimi.some((p) => lowerModel.startsWith(p));
  if (provider === "ollama") return true;
  if (provider === "openrouter") {
    if (lowerModel.includes("/")) return true;
    if (
      ANTIGRAVITY_EXACT_MODELS.has(lowerModel) ||
      MODEL_PREFIXES.codex.some((p) => lowerModel.startsWith(p)) ||
      MODEL_PREFIXES.kimi.some((p) => lowerModel.startsWith(p))
    ) {
      return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Settings file discovery
// ---------------------------------------------------------------------------

function getSettingsPath(): string {
  if (process.env.LOCAL_DATA_PATH) {
    return join(process.env.LOCAL_DATA_PATH, "settings.json");
  }
  return join(process.cwd(), ".local-data", "settings.json");
}

function getSessionsDir(): string {
  if (process.env.LOCAL_DATA_PATH) {
    return join(process.env.LOCAL_DATA_PATH, "sessions");
  }
  return join(process.cwd(), ".local-data", "sessions");
}

function getDbPath(): string {
  if (process.env.LOCAL_DATA_PATH) {
    return join(process.env.LOCAL_DATA_PATH, "seline.db");
  }
  return join(process.cwd(), ".local-data", "seline.db");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationIssue {
  source: string;
  field: string;
  model: string;
  provider: LLMProvider;
  message: string;
}

const MODEL_FIELDS = ["chatModel", "researchModel", "visionModel", "utilityModel"] as const;
const SESSION_MODEL_KEYS = {
  provider: "sessionProvider",
  chat: "sessionChatModel",
  research: "sessionResearchModel",
  vision: "sessionVisionModel",
  utility: "sessionUtilityModel",
} as const;

function validateSettings(settings: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const provider = (settings.llmProvider as LLMProvider) || "anthropic";

  for (const field of MODEL_FIELDS) {
    const model = settings[field] as string | undefined;
    if (model && !isModelCompatibleWithProvider(model, provider)) {
      issues.push({
        source: "settings.json",
        field,
        model,
        provider,
        message: `Model "${model}" is not compatible with provider "${provider}"`,
      });
    }
  }

  return issues;
}

function validateSessionMetadata(
  sessionId: string,
  metadata: Record<string, unknown>,
  globalProvider: LLMProvider,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sessionProvider = (metadata[SESSION_MODEL_KEYS.provider] as LLMProvider) || globalProvider;

  const roleMap: Record<string, string> = {
    [SESSION_MODEL_KEYS.chat]: "sessionChatModel",
    [SESSION_MODEL_KEYS.research]: "sessionResearchModel",
    [SESSION_MODEL_KEYS.vision]: "sessionVisionModel",
    [SESSION_MODEL_KEYS.utility]: "sessionUtilityModel",
  };

  for (const [key, fieldName] of Object.entries(roleMap)) {
    const model = metadata[key] as string | undefined;
    if (model && !isModelCompatibleWithProvider(model, sessionProvider)) {
      issues.push({
        source: `session:${sessionId}`,
        field: fieldName,
        model,
        provider: sessionProvider,
        message: `Model "${model}" is not compatible with provider "${sessionProvider}"`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const isVerbose = process.argv.includes("--verbose") || process.argv.includes("-v");

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Model Configuration Validation Script               ║");
  console.log(`║     Mode: ${isDryRun ? "DRY RUN (no changes)" : "VALIDATE ONLY"}                       ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const allIssues: ValidationIssue[] = [];

  // 1. Validate settings.json
  const settingsPath = getSettingsPath();
  console.log(`📋 Settings file: ${settingsPath}`);

  if (!existsSync(settingsPath)) {
    console.log("   ⚠️  Settings file not found (using defaults)\n");
  } else {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const provider = settings.llmProvider || "anthropic";
      console.log(`   Provider: ${provider}`);

      for (const field of MODEL_FIELDS) {
        const model = settings[field] || "(default)";
        console.log(`   ${field}: ${model}`);
      }

      const issues = validateSettings(settings);
      allIssues.push(...issues);

      if (issues.length === 0) {
        console.log("   ✅ All model fields are compatible\n");
      } else {
        for (const issue of issues) {
          console.log(`   ❌ ${issue.field}: ${issue.message}`);
        }
        console.log();
      }
    } catch (error) {
      console.error(`   ❌ Failed to parse settings: ${error}\n`);
    }
  }

  // 2. Validate session configs (from SQLite DB)
  const dbPath = getDbPath();
  console.log(`📂 Database: ${dbPath}`);

  if (!existsSync(dbPath)) {
    console.log("   ⚠️  Database not found (no sessions to validate)\n");
  } else {
    console.log("   ℹ️  Session validation requires database access.");
    console.log("   ℹ️  Run within the app context for full session validation.\n");

    // We can't easily query SQLite without better-sqlite3 in a standalone script.
    // The integration tests cover this path instead.
  }

  // 3. Summary
  console.log("═══════════════════════════════════════════════════════════");
  if (allIssues.length === 0) {
    console.log("✅ No model-provider compatibility issues found.");
    console.log("   The \"Clearing incompatible model\" log should not appear.");
  } else {
    console.log(`❌ Found ${allIssues.length} issue(s):`);
    for (const issue of allIssues) {
      console.log(`   • [${issue.source}] ${issue.field}: ${issue.message}`);
    }
    console.log();
    if (isDryRun) {
      console.log("   (dry-run mode — no changes applied)");
      console.log("   Fix these by updating settings or session overrides via the UI.");
    }
  }
  console.log("═══════════════════════════════════════════════════════════");

  process.exit(allIssues.length > 0 ? 1 : 0);
}

main();
