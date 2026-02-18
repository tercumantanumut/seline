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
const ALWAYS_ENABLED_TOOLS = [
  "docsSearch",
  "localGrep",
  "readFile",
  "editFile",
  "writeFile",
  "executeCommand",
] as const;

/** Utility tools that are ALWAYS enabled — no external dependencies */
const UTILITY_TOOLS = [
  "calculator",
  "memorize",
  "runSkill",
  "scheduleTask",
  "sendMessageToChannel",
  "showProductImages",
  "updatePlan",
  "updateSkill",
] as const;

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

  // 4. Web Search (always enabled — DuckDuckGo fallback needs no API key)
  enabledTools.push("webSearch");
  const hasTavilyKey = typeof settings.tavilyApiKey === "string" && settings.tavilyApiKey.trim().length > 0;
  const webSearchProvider = settings.webSearchProvider || "auto";
  if (hasTavilyKey) {
    console.log("[SelineTemplate] Web Search enabled: tavilyApiKey is set (provider: " + webSearchProvider + ")");
  } else {
    console.log("[SelineTemplate] Web Search enabled: using DuckDuckGo fallback (provider: " + webSearchProvider + ")");
  }

  // 5. Conditional: Web Browse (requires Firecrawl API key OR local web scraper)
  const hasFirecrawlKey = typeof settings.firecrawlApiKey === "string" && settings.firecrawlApiKey.trim().length > 0;
  const isLocalScraper = settings.webScraperProvider === "local";
  if (hasFirecrawlKey || isLocalScraper) {
    enabledTools.push("webBrowse");
    console.log(
      `[SelineTemplate] Web Browse enabled: ${isLocalScraper ? "local scraper" : "firecrawlApiKey is set"}`
    );
  } else {
    warnings.push({
      toolId: "webBrowse",
      toolName: "Web Browse",
      reason: "No web scraping provider configured (Firecrawl API key missing and local scraper not enabled)",
      settingsKeys: ["firecrawlApiKey", "webScraperProvider"],
      action: "Add a Firecrawl API key or switch to local web scraper in Settings → API Keys",
    });
    console.log("[SelineTemplate] Web Browse disabled: firecrawlApiKey not set and webScraperProvider is not 'local'");
  }

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
