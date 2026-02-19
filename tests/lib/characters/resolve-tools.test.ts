import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveSelineTemplateTools,
  getExcludedSelineTools,
  isToolAvailableForSeline,
  DEFAULT_ENABLED_TOOLS,
  ALWAYS_ENABLED_TOOLS,
  UTILITY_TOOLS,
  type ToolResolutionResult,
} from "@/lib/characters/templates/resolve-tools";
import type { AppSettings } from "@/lib/settings/settings-manager";

/**
 * Build a minimal AppSettings object for testing.
 * Only the fields relevant to tool resolution are included.
 */
function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    llmProvider: "anthropic",
    localUserId: "test-user",
    localUserEmail: "test@test.com",
    theme: "dark",
    vectorDBEnabled: false,
    webScraperProvider: "firecrawl",
    ...overrides,
  } as AppSettings;
}

describe("resolveSelineTemplateTools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Core tools — always enabled regardless of settings
  // =========================================================================
  describe("always-enabled core tools", () => {
    it("should always include docsSearch, localGrep, readFile, editFile, writeFile, executeCommand", () => {
      const settings = buildSettings(); // No API keys, no vector DB
      const result = resolveSelineTemplateTools(settings);

      const coreTools = ["docsSearch", "localGrep", "readFile", "editFile", "writeFile", "executeCommand"];
      for (const tool of coreTools) {
        expect(result.enabledTools).toContain(tool);
      }
    });

    it("should export always-enabled core tools constant", () => {
      expect(ALWAYS_ENABLED_TOOLS).toEqual([
        "docsSearch",
        "localGrep",
        "readFile",
        "editFile",
        "writeFile",
        "executeCommand",
      ]);
    });
  });

  // =========================================================================
  // Utility tools — always enabled
  // =========================================================================
  describe("always-enabled utility tools", () => {
    it("should always include all utility tools", () => {
      const settings = buildSettings();
      const result = resolveSelineTemplateTools(settings);

      const utilityTools = [
        "calculator",
        "memorize",
        "runSkill",
        "scheduleTask",
        "sendMessageToChannel",
        "showProductImages",
        "updatePlan",
        "updateSkill",
        "delegateToSubagent",
      ];
      for (const tool of utilityTools) {
        expect(result.enabledTools).toContain(tool);
      }
    });

    it("should export utility tools constant including delegateToSubagent", () => {
      expect(UTILITY_TOOLS).toContain("delegateToSubagent");
    });
  });

  // =========================================================================
  // Excluded tools — never included
  // =========================================================================
  describe("excluded tools", () => {
    it("should NOT include describeImage", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("describeImage");
    });

    it("should NOT include patchFile", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("patchFile");
    });
  });

  // =========================================================================
  // Vector Search — conditional on vectorDBEnabled
  // =========================================================================
  describe("vectorSearch", () => {
    it("should include vectorSearch when vectorDBEnabled is true", () => {
      const settings = buildSettings({ vectorDBEnabled: true });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("vectorSearch");
      expect(result.warnings.find((w) => w.toolId === "vectorSearch")).toBeUndefined();
    });

    it("should NOT include vectorSearch when vectorDBEnabled is false", () => {
      const settings = buildSettings({ vectorDBEnabled: false });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("vectorSearch");
    });

    it("should include a warning when vectorSearch is disabled", () => {
      const settings = buildSettings({ vectorDBEnabled: false });
      const result = resolveSelineTemplateTools(settings);
      const warning = result.warnings.find((w) => w.toolId === "vectorSearch");
      expect(warning).toBeDefined();
      expect(warning!.settingsKeys).toContain("vectorDBEnabled");
      expect(warning!.action).toContain("Settings");
    });

    it("should NOT include vectorSearch when vectorDBEnabled is undefined", () => {
      const settings = buildSettings();
      delete (settings as Partial<AppSettings>).vectorDBEnabled;
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("vectorSearch");
    });
  });

  // =========================================================================
  // Web Search — conditional on tavilyApiKey
  // =========================================================================
  describe("webSearch", () => {
    it("should include webSearch when tavilyApiKey is set", () => {
      const settings = buildSettings({ tavilyApiKey: "tvly-abc123" });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webSearch");
      expect(result.warnings.find((w) => w.toolId === "webSearch")).toBeUndefined();
    });

    it("should include webSearch in default enabled tools", () => {
      expect(DEFAULT_ENABLED_TOOLS).toContain("webSearch");
    });

    it("should include webSearch even when tavilyApiKey is missing (DuckDuckGo fallback)", () => {
      const settings = buildSettings({ tavilyApiKey: undefined });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webSearch");
    });

    it("should include webSearch even when tavilyApiKey is empty string (DuckDuckGo fallback)", () => {
      const settings = buildSettings({ tavilyApiKey: "" });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webSearch");
    });

    it("should include webSearch even when tavilyApiKey is whitespace only (DuckDuckGo fallback)", () => {
      const settings = buildSettings({ tavilyApiKey: "   " });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webSearch");
    });

    it("should NOT emit a warning for webSearch (always enabled via DuckDuckGo fallback)", () => {
      const settings = buildSettings({ tavilyApiKey: undefined });
      const result = resolveSelineTemplateTools(settings);
      const warning = result.warnings.find((w) => w.toolId === "webSearch");
      expect(warning).toBeUndefined();
    });
  });

  // =========================================================================
  // Web Browse — conditional on firecrawlApiKey OR local scraper
  // =========================================================================
  describe("webBrowse", () => {
    it("should include webBrowse when firecrawlApiKey is set", () => {
      const settings = buildSettings({ firecrawlApiKey: "fc-abc123" });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webBrowse");
      expect(result.warnings.find((w) => w.toolId === "webBrowse")).toBeUndefined();
    });

    it("should not include webBrowse in default enabled tools", () => {
      expect(DEFAULT_ENABLED_TOOLS).not.toContain("webBrowse");
    });

    it("should include webBrowse when webScraperProvider is 'local'", () => {
      const settings = buildSettings({
        webScraperProvider: "local",
        firecrawlApiKey: undefined,
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).toContain("webBrowse");
    });

    it("should NOT include webBrowse when firecrawl key missing AND scraper is not local", () => {
      const settings = buildSettings({
        firecrawlApiKey: undefined,
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("webBrowse");
    });

    it("should NOT include webBrowse when firecrawl key is empty AND scraper is firecrawl", () => {
      const settings = buildSettings({
        firecrawlApiKey: "",
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.enabledTools).not.toContain("webBrowse");
    });

    it("should include a warning when webBrowse is disabled", () => {
      const settings = buildSettings({
        firecrawlApiKey: undefined,
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);
      const warning = result.warnings.find((w) => w.toolId === "webBrowse");
      expect(warning).toBeDefined();
      expect(warning!.settingsKeys).toContain("firecrawlApiKey");
      expect(warning!.settingsKeys).toContain("webScraperProvider");
    });
  });

  // =========================================================================
  // Full configuration — all tools enabled
  // =========================================================================
  describe("full configuration", () => {
    it("should enable all conditional tools when everything is configured", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);

      expect(result.enabledTools).toContain("vectorSearch");
      expect(result.enabledTools).toContain("webSearch");
      expect(result.enabledTools).toContain("webBrowse");
      expect(result.warnings).toHaveLength(0);
    });

    it("should have no warnings when all prerequisites are met", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // =========================================================================
  // Bare minimum configuration — only core and utility tools
  // =========================================================================
  describe("bare minimum configuration", () => {
    it("should have 2 warnings when nothing is configured (webSearch always on via DuckDuckGo)", () => {
      const settings = buildSettings({
        vectorDBEnabled: false,
        tavilyApiKey: undefined,
        firecrawlApiKey: undefined,
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.map((w) => w.toolId).sort()).toEqual([
        "vectorSearch",
        "webBrowse",
      ]);
    });

    it("should still include core + utility + webSearch tools with no configuration", () => {
      const settings = buildSettings({
        vectorDBEnabled: false,
        tavilyApiKey: undefined,
        firecrawlApiKey: undefined,
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);

      // 6 core + 9 utility + 1 always-on webSearch = 16 tools minimum
      expect(result.enabledTools.length).toBeGreaterThanOrEqual(16);
      expect(result.enabledTools).not.toContain("vectorSearch");
      expect(result.enabledTools).toContain("webSearch");
      expect(result.enabledTools).not.toContain("webBrowse");
    });
  });

  // =========================================================================
  // Tool count verification
  // =========================================================================
  describe("tool count", () => {
    it("should return exactly 18 tools when all prerequisites are met", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);

      // 6 core + 9 utility + 3 conditional = 18
      expect(result.enabledTools).toHaveLength(18);
    });

    it("should return exactly 16 tools when no optional tools are available (webSearch always on)", () => {
      const settings = buildSettings({
        vectorDBEnabled: false,
        tavilyApiKey: undefined,
        firecrawlApiKey: undefined,
        webScraperProvider: "firecrawl",
      });
      const result = resolveSelineTemplateTools(settings);

      // 6 core + 9 utility + 1 always-on webSearch = 16
      expect(result.enabledTools).toHaveLength(16);
    });
  });

  // =========================================================================
  // No duplicate tools
  // =========================================================================
  describe("no duplicates", () => {
    it("should not contain duplicate tool IDs", () => {
      const settings = buildSettings({
        vectorDBEnabled: true,
        tavilyApiKey: "tvly-test-key",
        firecrawlApiKey: "fc-test-key",
      });
      const result = resolveSelineTemplateTools(settings);
      const unique = new Set(result.enabledTools);
      expect(unique.size).toBe(result.enabledTools.length);
    });
  });
});

// ===========================================================================
// getExcludedSelineTools
// ===========================================================================
describe("getExcludedSelineTools", () => {
  it("should return describeImage and patchFile", () => {
    const excluded = getExcludedSelineTools();
    expect(excluded).toContain("describeImage");
    expect(excluded).toContain("patchFile");
  });

  it("should return exactly 2 excluded tools", () => {
    const excluded = getExcludedSelineTools();
    expect(excluded).toHaveLength(2);
  });
});

describe("DEFAULT_ENABLED_TOOLS", () => {
  it("should include core and utility tools plus webSearch", () => {
    expect(DEFAULT_ENABLED_TOOLS).toEqual([
      ...ALWAYS_ENABLED_TOOLS,
      ...UTILITY_TOOLS,
      "webSearch",
    ]);
  });

  it("should include delegateToSubagent and exclude webBrowse", () => {
    expect(DEFAULT_ENABLED_TOOLS).toContain("delegateToSubagent");
    expect(DEFAULT_ENABLED_TOOLS).not.toContain("webBrowse");
  });
});

// ===========================================================================
// isToolAvailableForSeline
// ===========================================================================
describe("isToolAvailableForSeline", () => {
  it("should return true for always-enabled tools", () => {
    const settings = buildSettings();
    expect(isToolAvailableForSeline("readFile", settings)).toBe(true);
    expect(isToolAvailableForSeline("editFile", settings)).toBe(true);
    expect(isToolAvailableForSeline("calculator", settings)).toBe(true);
  });

  it("should return false for vectorSearch when vectorDB is disabled", () => {
    const settings = buildSettings({ vectorDBEnabled: false });
    expect(isToolAvailableForSeline("vectorSearch", settings)).toBe(false);
  });

  it("should return true for vectorSearch when vectorDB is enabled", () => {
    const settings = buildSettings({ vectorDBEnabled: true });
    expect(isToolAvailableForSeline("vectorSearch", settings)).toBe(true);
  });

  it("should return false for excluded tools", () => {
    const settings = buildSettings({
      vectorDBEnabled: true,
      tavilyApiKey: "tvly-test",
      firecrawlApiKey: "fc-test",
    });
    expect(isToolAvailableForSeline("describeImage", settings)).toBe(false);
    expect(isToolAvailableForSeline("patchFile", settings)).toBe(false);
  });
});
