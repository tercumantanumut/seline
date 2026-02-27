/**
 * Settings-Aware Tool Resolver for Agent Templates
 *
 * Dynamically resolves which tools should be enabled for an agent template
 * based on user settings, API keys, and feature flags. This replaces the
 * static hardcoded tool lists that would include tools users can't use.
 *
 * @module resolve-tools
 */

import type { AppSettings } from "@/lib/settings/settings-manager";

/** Result of tool resolution — includes enabled tools and any warnings */
export interface ToolResolutionResult {
  /** Tool IDs that should be enabled */
  enabledTools: string[];
  /** Warnings about tools that were excluded due to missing prerequisites */
  warnings: ToolWarning[];
}

export interface ToolWarning {
  toolId: string;
  toolName: string;
  reason: string;
  /** Settings key(s) that need to be configured */
  settingsKeys: string[];
  /** Human-readable action to fix */
  action: string;
}

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

/** Core tools that are ALWAYS enabled — no prerequisites */
export const ALWAYS_ENABLED_TOOLS = [
  "docsSearch",
  "localGrep",
  "readFile",
  "editFile",
  "writeFile",
  "executeCommand",
] as const;

/** Utility tools that are ALWAYS enabled — no external dependencies */
export const UTILITY_TOOLS = [
  "calculator",
  "memorize",
  "runSkill",
  "scheduleTask",
  "sendMessageToChannel",
  "showProductImages",
  "updatePlan",
  "updateSkill",
  "delegateToSubagent",
] as const;

/**
 * Static default tools for new agents.
 *
 * Includes always-on core + utility tools plus unified webSearch.
 */
export const DEFAULT_ENABLED_TOOLS: string[] = [
  ...ALWAYS_ENABLED_TOOLS,
  ...UTILITY_TOOLS,
  "webSearch",
  "chromiumWorkspace",
];

/** Tools that are EXCLUDED from the Seline template by design */
const EXCLUDED_TOOLS = [
  "describeImage", // Not essential for default template; can be added manually
  "patchFile",     // Redundant with editFile for most use cases
] as const;

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Resolve which tools should be enabled for the Seline default template
 * based on the current user settings.
 *
 * This function is called at agent creation time (not at template definition time)
 * so it can check the actual state of API keys, feature flags, etc.
 *
 * @param settings - Current application settings
 * @returns Resolved tool list and any warnings about excluded tools
 */
export function resolveSelineTemplateTools(settings: AppSettings): ToolResolutionResult {
  const enabledTools: string[] = [];
  const warnings: ToolWarning[] = [];

  // 1. Always-enabled core tools
  enabledTools.push(...ALWAYS_ENABLED_TOOLS);

  // 2. Always-enabled utility tools
  enabledTools.push(...UTILITY_TOOLS);

  // 3. Conditional: Vector Search
  if (settings.vectorDBEnabled === true) {
    enabledTools.push("vectorSearch");
    console.log("[SelineTemplate] Vector Search enabled: vectorDBEnabled=true");
  } else {
    warnings.push({
      toolId: "vectorSearch",
      toolName: "Vector Search",
      reason: "Vector Database is disabled in settings",
      settingsKeys: ["vectorDBEnabled"],
      action: "Enable Vector Database in Settings → Vector Search to use semantic code search",
    });
    console.log("[SelineTemplate] Vector Search disabled: vectorDBEnabled is not true");
  }

  // 4. Unified Web tool (always enabled)
  enabledTools.push("webSearch");
  const hasTavilyKey = typeof settings.tavilyApiKey === "string" && settings.tavilyApiKey.trim().length > 0;
  const webSearchProvider = settings.webSearchProvider || "auto";
  if (hasTavilyKey) {
    console.log("[SelineTemplate] Web enabled: Tavily configured (provider: " + webSearchProvider + ")");
  } else {
    console.log("[SelineTemplate] Web enabled: DuckDuckGo/local fallback active (provider: " + webSearchProvider + ")");
  }

  // 5. Chromium Workspace (always enabled — embedded browser, no external deps)
  enabledTools.push("chromiumWorkspace");
  console.log("[SelineTemplate] Chromium Workspace enabled: embedded browser automation");

  // 6. Log excluded tools
  for (const toolId of EXCLUDED_TOOLS) {
    console.log(`[SelineTemplate] ${toolId} excluded by design (not in Seline default template)`);
  }

  return { enabledTools, warnings };
}

/**
 * Get the list of tools that are always excluded from the Seline template.
 * Useful for UI to show which tools were intentionally removed.
 */
export function getExcludedSelineTools(): readonly string[] {
  return EXCLUDED_TOOLS;
}

/**
 * Check if a specific tool would be enabled given the current settings.
 * Useful for UI to show tool availability before agent creation.
 */
export function isToolAvailableForSeline(toolId: string, settings: AppSettings): boolean {
  const result = resolveSelineTemplateTools(settings);
  return result.enabledTools.includes(toolId);
}
