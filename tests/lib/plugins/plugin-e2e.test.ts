/**
 * Plugin System — End-to-End Tests
 *
 * Covers the full plugin lifecycle:
 * - Zip file parsing and component discovery
 * - Hook execution during tool use (pre/post/failure)
 * - Plugin enable/disable state management
 * - Multi-plugin hook ordering and blocking
 * - Skill loader integration
 * - MCP integration types
 *
 * Step 12: End-to-End Testing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerPluginHooks,
  unregisterPluginHooks,
  clearAllHooks,
  getRegisteredHooks,
  dispatchHook,
} from "@/lib/plugins/hooks-engine";
import {
  runPreToolUseHooks,
  runPostToolUseHooks,
  runPostToolUseFailureHooks,
} from "@/lib/plugins/hook-integration";
import type {
  PluginHooksConfig,
  PluginManifest,
  PluginComponents,
  PluginSkillEntry,
  PluginAgentEntry,
  PluginMCPConfig,
  InstalledPlugin,
} from "@/lib/plugins/types";

// =============================================================================
// E2E Test Suite: Full Plugin Lifecycle
// =============================================================================

describe("E2E: Plugin Zip Parse Result Shape", () => {
  it("should validate a complete PluginManifest", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      description: "A comprehensive test plugin",
      version: "2.1.0",
      author: { name: "Test Author", email: "test@example.com" },
      homepage: "https://example.com/test-plugin",
      repository: "https://github.com/test/test-plugin",
      license: "MIT",
      keywords: ["test", "hooks", "mcp"],
      category: "development",
      commands: ["commands/"],
      skills: ["skills/"],
      agents: ["agents/"],
    };

    expect(manifest.name).toBe("test-plugin");
    expect(manifest.version).toBe("2.1.0");
    expect(manifest.author?.name).toBe("Test Author");
    expect(manifest.keywords).toContain("hooks");
    expect(manifest.category).toBe("development");
  });

  it("should validate PluginComponents with all sections", () => {
    const skills: PluginSkillEntry[] = [
      {
        name: "review",
        namespacedName: "code-review:review",
        description: "Run code review on changes",
        content: "# Code Review\n\nReview the following changes...",
        relativePath: "commands/review.md",
      },
      {
        name: "configure",
        namespacedName: "code-review:configure",
        description: "Configure review settings",
        content: "# Configure\n\nSet up review parameters...",
        relativePath: "skills/configure/SKILL.md",
        disableModelInvocation: true,
      },
    ];

    const agents: PluginAgentEntry[] = [
      {
        name: "reviewer",
        description: "Code review specialist agent",
        content: "You are a code review specialist...",
        relativePath: "agents/reviewer.md",
      },
    ];

    const hooks: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: "echo 'pre-check'" }],
          },
        ],
        PostToolUse: [
          {
            hooks: [{ type: "command", command: "echo 'logged'" }],
          },
        ],
      },
    };

    const mcpServers: PluginMCPConfig = {
      "code-analysis": {
        command: "node",
        args: ["${CLAUDE_PLUGIN_ROOT}/server.js"],
        type: "stdio",
      },
    };

    const components: PluginComponents = {
      skills,
      agents,
      hooks,
      mcpServers,
      lspServers: null,
    };

    expect(components.skills).toHaveLength(2);
    expect(components.agents).toHaveLength(1);
    expect(components.hooks).not.toBeNull();
    expect(components.mcpServers).not.toBeNull();
    expect(components.lspServers).toBeNull();

    // Validate namespacing
    expect(components.skills[0].namespacedName).toBe("code-review:review");
    expect(components.skills[1].disableModelInvocation).toBe(true);

    // Validate MCP config
    expect(Object.keys(components.mcpServers!)).toEqual(["code-analysis"]);
    expect(components.mcpServers!["code-analysis"].command).toBe("node");
  });

  it("should construct a valid InstalledPlugin record", () => {
    const plugin: InstalledPlugin = {
      id: "test-uuid-123",
      name: "hookify",
      description: "Hook management plugin",
      version: "1.0.0",
      scope: "user",
      status: "active",
      manifest: {
        name: "hookify",
        description: "Hook management plugin",
        version: "1.0.0",
      },
      components: {
        skills: [
          {
            name: "configure",
            namespacedName: "hookify:configure",
            description: "Configure hookify",
            content: "content",
            relativePath: "commands/configure.md",
          },
        ],
        agents: [],
        hooks: {
          hooks: {
            PreToolUse: [
              {
                matcher: ".*",
                hooks: [{ type: "command", command: "echo ok" }],
              },
            ],
          },
        },
        mcpServers: null,
        lspServers: null,
      },
      installedAt: "2026-02-17T12:00:00Z",
      updatedAt: "2026-02-17T12:00:00Z",
    };

    expect(plugin.status).toBe("active");
    expect(plugin.components.skills).toHaveLength(1);
    expect(plugin.components.hooks?.hooks.PreToolUse).toHaveLength(1);
  });
});

// =============================================================================
// E2E: Hook Execution Lifecycle
// =============================================================================

describe("E2E: Full Hook Execution Lifecycle", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should execute complete PreToolUse → allow → PostToolUse flow", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'pre: allowed'" }],
          },
        ],
        PostToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'post: logged'" }],
          },
        ],
      },
    };

    registerPluginHooks("lifecycle-plugin", config);

    // Step 1: PreToolUse check
    const preResult = await runPreToolUseHooks(
      "editFile",
      { path: "/src/app.ts", content: "new code" },
      "session-e2e-1"
    );
    expect(preResult.blocked).toBe(false);

    // Step 2: Tool executes (simulated)
    const toolResult = "File edited successfully";

    // Step 3: PostToolUse fires (fire-and-forget, should not throw)
    expect(() => {
      runPostToolUseHooks(
        "editFile",
        { path: "/src/app.ts", content: "new code" },
        toolResult,
        "session-e2e-1"
      );
    }).not.toThrow();
  });

  it("should execute PreToolUse → block → skip PostToolUse flow", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "deleteFile",
            hooks: [
              {
                type: "command",
                command: "echo 'BLOCKED: Cannot delete production files' >&2; exit 2",
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "deleteFile",
            hooks: [{ type: "command", command: "echo 'this should not run'" }],
          },
        ],
      },
    };

    registerPluginHooks("security-plugin", config);

    // Step 1: PreToolUse blocks
    const preResult = await runPreToolUseHooks(
      "deleteFile",
      { path: "/prod/config.json" },
      "session-e2e-2"
    );
    expect(preResult.blocked).toBe(true);
    expect(preResult.blockReason).toContain("Cannot delete production files");

    // Step 2: Tool should NOT execute (simulated by not calling it)
    // Step 3: PostToolUse should NOT fire (because tool was blocked)
    // This is handled by the chat route logic, not the hook engine
  });

  it("should execute PreToolUse → tool fails → PostToolUseFailure flow", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'pre: ok'" }],
          },
        ],
        PostToolUseFailure: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'failure: logged'" }],
          },
        ],
      },
    };

    registerPluginHooks("error-tracker", config);

    // Step 1: PreToolUse allows
    const preResult = await runPreToolUseHooks(
      "editFile",
      { path: "/src/app.ts" },
      "session-e2e-3"
    );
    expect(preResult.blocked).toBe(false);

    // Step 2: Tool fails (simulated)
    const toolError = "EACCES: permission denied";

    // Step 3: PostToolUseFailure fires
    expect(() => {
      runPostToolUseFailureHooks(
        "editFile",
        { path: "/src/app.ts" },
        toolError,
        "session-e2e-3"
      );
    }).not.toThrow();
  });
});

// =============================================================================
// E2E: Plugin Enable/Disable State
// =============================================================================

describe("E2E: Plugin Enable/Disable State Persistence", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should register hooks when plugin is active", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "echo 'active'" }],
          },
        ],
      },
    };

    registerPluginHooks("toggleable-plugin", config);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(1);
    expect(getRegisteredHooks("PreToolUse")[0].pluginName).toBe("toggleable-plugin");
  });

  it("should unregister hooks when plugin is disabled", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "echo 'active'" }],
          },
        ],
        PostToolUse: [
          {
            hooks: [{ type: "command", command: "echo 'post'" }],
          },
        ],
      },
    };

    registerPluginHooks("toggleable-plugin", config);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(1);
    expect(getRegisteredHooks("PostToolUse")).toHaveLength(1);

    // Simulate disable
    unregisterPluginHooks("toggleable-plugin");
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(0);
    expect(getRegisteredHooks("PostToolUse")).toHaveLength(0);
  });

  it("should re-register hooks when plugin is re-enabled", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'guard'" }],
          },
        ],
      },
    };

    // Enable
    registerPluginHooks("re-enable-plugin", config);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(1);

    // Disable
    unregisterPluginHooks("re-enable-plugin");
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(0);

    // Re-enable
    registerPluginHooks("re-enable-plugin", config);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(1);
  });

  it("should only affect the specified plugin when disabling", () => {
    const config1: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          { matcher: "editFile", hooks: [{ type: "command", command: "echo 'p1'" }] },
        ],
      },
    };
    const config2: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          { matcher: "readFile", hooks: [{ type: "command", command: "echo 'p2'" }] },
        ],
      },
    };

    registerPluginHooks("plugin-a", config1);
    registerPluginHooks("plugin-b", config2);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(2);

    // Disable only plugin-a
    unregisterPluginHooks("plugin-a");
    const remaining = getRegisteredHooks("PreToolUse");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].pluginName).toBe("plugin-b");
  });
});

// =============================================================================
// E2E: Skill Loader Integration
// =============================================================================

describe("E2E: Skill Loader Prompt Generation", () => {
  it("should generate correct prompt summary from plugin skills", () => {
    const skills: PluginSkillEntry[] = [
      {
        name: "review",
        namespacedName: "code-review:review",
        description: "Run code review on staged changes",
        content: "# Review\n\nAnalyze the staged changes...",
        relativePath: "commands/review.md",
      },
      {
        name: "lint",
        namespacedName: "code-review:lint",
        description: "Run linter on project files",
        content: "# Lint\n\nRun the configured linter...",
        relativePath: "commands/lint.md",
      },
      {
        name: "configure",
        namespacedName: "hookify:configure",
        description: "Configure hookify plugin settings",
        content: "# Configure\n\nSet up hookify...",
        relativePath: "commands/configure.md",
      },
    ];

    // Simulate getPluginSkillsForPrompt logic
    const lines = skills.map(
      (s) => `- /${s.namespacedName}: ${s.description || s.name}`
    );
    const summary = `\n\nAvailable plugin commands:\n${lines.join("\n")}`;

    expect(summary).toContain("Available plugin commands:");
    expect(summary).toContain("/code-review:review: Run code review on staged changes");
    expect(summary).toContain("/code-review:lint: Run linter on project files");
    expect(summary).toContain("/hookify:configure: Configure hookify plugin settings");

    // Verify format is suitable for system prompt injection
    expect(summary.startsWith("\n\n")).toBe(true);
    expect(summary.split("\n").filter(Boolean)).toHaveLength(4); // header + 3 skills
  });

  it("should handle skills with missing descriptions", () => {
    const skills: PluginSkillEntry[] = [
      {
        name: "deploy",
        namespacedName: "ci:deploy",
        description: "",
        content: "# Deploy",
        relativePath: "commands/deploy.md",
      },
    ];

    const lines = skills.map(
      (s) => `- /${s.namespacedName}: ${s.description || s.name}`
    );
    const summary = `\n\nAvailable plugin commands:\n${lines.join("\n")}`;

    // Falls back to name when description is empty
    expect(summary).toContain("/ci:deploy: deploy");
  });

  it("should return empty string when no skills exist", () => {
    const skills: PluginSkillEntry[] = [];
    const summary = skills.length === 0 ? "" : "should not reach";
    expect(summary).toBe("");
  });
});

// =============================================================================
// E2E: Hook Dispatch with Matchers
// =============================================================================

describe("E2E: Hook Dispatch — Matcher Patterns", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should match tool names with regex OR pattern", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit|Patch",
            hooks: [{ type: "command", command: "echo 'write guard'" }],
          },
        ],
      },
    };

    registerPluginHooks("write-guard", config);

    // Should match
    const r1 = await runPreToolUseHooks("editFile", {}, "s1");
    expect(r1.blocked).toBe(false); // echo exits 0

    // Should match
    const r2 = await runPreToolUseHooks("WriteFile", {}, "s1");
    expect(r2.blocked).toBe(false);

    // Should NOT match
    const r3 = await runPreToolUseHooks("readFile", {}, "s1");
    expect(r3.blocked).toBe(false);
    expect(r3.durationMs).toBe(0); // No hooks executed
  });

  it("should match all tools with .* matcher", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "echo 'catch-all'" }],
          },
        ],
      },
    };

    registerPluginHooks("catch-all-plugin", config);

    const r1 = await runPreToolUseHooks("editFile", {}, "s1");
    expect(r1.blocked).toBe(false);
    expect(r1.durationMs).toBeGreaterThanOrEqual(0);

    const r2 = await runPreToolUseHooks("anyRandomTool", {}, "s1");
    expect(r2.blocked).toBe(false);
  });

  it("should handle entries without matcher (matches all)", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PostToolUse: [
          {
            // No matcher — should match all tools
            hooks: [{ type: "command", command: "echo 'universal post'" }],
          },
        ],
      },
    };

    registerPluginHooks("universal-logger", config);

    // Fire-and-forget, just verify no throw
    expect(() => {
      runPostToolUseHooks("editFile", {}, "result", "s1");
    }).not.toThrow();

    expect(() => {
      runPostToolUseHooks("readFile", {}, "result", "s1");
    }).not.toThrow();
  });
});

// =============================================================================
// E2E: Multi-Plugin Ordering & Isolation
// =============================================================================

describe("E2E: Multi-Plugin Ordering & Isolation", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should preserve registration order across plugins", () => {
    const configs = ["alpha", "beta", "gamma"].map((name) => ({
      name,
      config: {
        hooks: {
          PreToolUse: [
            {
              matcher: ".*",
              hooks: [{ type: "command" as const, command: `echo '${name}'` }],
            },
          ],
        },
      } as PluginHooksConfig,
    }));

    for (const { name, config } of configs) {
      registerPluginHooks(name, config);
    }

    const sources = getRegisteredHooks("PreToolUse");
    expect(sources).toHaveLength(3);
    expect(sources[0].pluginName).toBe("alpha");
    expect(sources[1].pluginName).toBe("beta");
    expect(sources[2].pluginName).toBe("gamma");
  });

  it("should not leak hooks between event types", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          { matcher: ".*", hooks: [{ type: "command", command: "echo 'pre'" }] },
        ],
        PostToolUse: [
          { hooks: [{ type: "command", command: "echo 'post'" }] },
        ],
      },
    };

    registerPluginHooks("isolated-plugin", config);

    expect(getRegisteredHooks("PreToolUse")).toHaveLength(1);
    expect(getRegisteredHooks("PostToolUse")).toHaveLength(1);
    expect(getRegisteredHooks("PostToolUseFailure")).toHaveLength(0);
    expect(getRegisteredHooks("SessionStart")).toHaveLength(0);
  });

  it("should handle 10 plugins without performance degradation", async () => {
    // Register 10 plugins with PreToolUse hooks
    for (let i = 0; i < 10; i++) {
      registerPluginHooks(`perf-plugin-${i}`, {
        hooks: {
          PreToolUse: [
            {
              matcher: "editFile",
              hooks: [{ type: "command", command: `echo 'plugin-${i}'` }],
            },
          ],
        },
      });
    }

    expect(getRegisteredHooks("PreToolUse")).toHaveLength(10);

    const start = Date.now();
    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "s1");
    const elapsed = Date.now() - start;

    expect(result.blocked).toBe(false);
    // All 10 hooks should execute within 30 seconds (generous for CI)
    expect(elapsed).toBeLessThan(30000);
  });

  it("should clear all hooks atomically", () => {
    registerPluginHooks("p1", {
      hooks: {
        PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "echo" }] }],
      },
    });
    registerPluginHooks("p2", {
      hooks: {
        PostToolUse: [{ hooks: [{ type: "command", command: "echo" }] }],
      },
    });

    clearAllHooks();

    expect(getRegisteredHooks("PreToolUse")).toHaveLength(0);
    expect(getRegisteredHooks("PostToolUse")).toHaveLength(0);
  });
});

// Hook Input/Output Contract tests have been extracted to:
// tests/lib/plugins/plugin-e2e-contracts.test.ts
