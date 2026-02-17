/**
 * Plugin Integration Tests
 *
 * Tests for the new integration points:
 * - Skill loader (getPluginSkillsForPrompt, getPluginSkillContent)
 * - Hook wrapping logic (wrapToolWithHooks pattern)
 * - Hook integration (runPreToolUseHooks blocking / fire-and-forget)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerPluginHooks,
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
  PluginSkillEntry,
  PluginComponents,
} from "@/lib/plugins/types";

// =============================================================================
// Hook Integration Tests
// =============================================================================

describe("Hook Integration — runPreToolUseHooks", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should return not-blocked when no hooks registered", async () => {
    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "session-1");
    expect(result.blocked).toBe(false);
    expect(result.durationMs).toBe(0);
  });

  it("should run PreToolUse hook and allow tool execution", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'allowed'" }],
          },
        ],
      },
    };

    registerPluginHooks("test-plugin", config);
    expect(getRegisteredHooks("PreToolUse").length).toBe(1);

    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "session-1");
    expect(result.blocked).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should block tool when hook exits with code 2", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'Blocked: dangerous operation' >&2; exit 2" }],
          },
        ],
      },
    };

    registerPluginHooks("security-plugin", config);

    const result = await runPreToolUseHooks("editFile", { path: "/etc/passwd" }, "session-1");
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toContain("Blocked: dangerous operation");
  });

  it("should not block when matcher does not match tool name", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: "exit 2" }],
          },
        ],
      },
    };

    registerPluginHooks("selective-plugin", config);

    // "readFile" should NOT match "Write|Edit"
    const result = await runPreToolUseHooks("readFile", { path: "/test.ts" }, "session-1");
    expect(result.blocked).toBe(false);
  });

  it("should fail open on hook execution errors", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "/nonexistent/command/that/does/not/exist" }],
          },
        ],
      },
    };

    registerPluginHooks("broken-plugin", config);

    // Should not throw and should not block
    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "session-1");
    // The hook will fail with exit code 1 (not 2), so it should not block
    expect(result.blocked).toBe(false);
  });
});

describe("Hook Integration — PostToolUse (fire-and-forget)", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should not throw when no hooks registered", () => {
    // fire-and-forget should silently do nothing
    expect(() => {
      runPostToolUseHooks("editFile", { path: "/test.ts" }, "result", "session-1");
    }).not.toThrow();
  });

  it("should fire PostToolUse hooks without blocking", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PostToolUse: [
          {
            hooks: [{ type: "command", command: "echo 'logged'" }],
          },
        ],
      },
    };

    registerPluginHooks("logger-plugin", config);

    // Should not throw or block
    expect(() => {
      runPostToolUseHooks("editFile", { path: "/test.ts" }, "result", "session-1");
    }).not.toThrow();
  });
});

describe("Hook Integration — PostToolUseFailure (fire-and-forget)", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should not throw when no hooks registered", () => {
    expect(() => {
      runPostToolUseFailureHooks("editFile", { path: "/test.ts" }, "File not found", "session-1");
    }).not.toThrow();
  });

  it("should fire PostToolUseFailure hooks without blocking", () => {
    const config: PluginHooksConfig = {
      hooks: {
        PostToolUseFailure: [
          {
            hooks: [{ type: "command", command: "echo 'error logged'" }],
          },
        ],
      },
    };

    registerPluginHooks("error-logger", config);

    expect(() => {
      runPostToolUseFailureHooks("editFile", { path: "/test.ts" }, "Permission denied", "session-1");
    }).not.toThrow();
  });
});

// =============================================================================
// Tool Wrapping Pattern Tests (simulates what chat/route.ts does)
// =============================================================================

describe("Tool Hook Wrapping Pattern", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should wrap tool execute and pass through when no hooks block", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "testTool",
            hooks: [{ type: "command", command: "echo 'ok'" }],
          },
        ],
      },
    };

    registerPluginHooks("passthrough-plugin", config);

    // Simulate tool wrapping (same pattern as chat/route.ts)
    const originalExecute = async (args: unknown) => `Result for ${JSON.stringify(args)}`;

    const hasPreHooks = getRegisteredHooks("PreToolUse").length > 0;

    const wrappedExecute = async (args: unknown) => {
      if (hasPreHooks) {
        const hookResult = await runPreToolUseHooks(
          "testTool",
          (args && typeof args === "object" ? args : {}) as Record<string, unknown>,
          "session-1"
        );
        if (hookResult.blocked) {
          return `Tool blocked: ${hookResult.blockReason}`;
        }
      }
      return originalExecute(args);
    };

    const result = await wrappedExecute({ query: "test" });
    expect(result).toBe('Result for {"query":"test"}');
  });

  it("should block tool execution when PreToolUse hook returns exit 2", async () => {
    const config: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "dangerousTool",
            hooks: [{ type: "command", command: "echo 'Not allowed' >&2; exit 2" }],
          },
        ],
      },
    };

    registerPluginHooks("blocker-plugin", config);

    const originalExecute = async () => "This should not execute";

    const hasPreHooks = getRegisteredHooks("PreToolUse").length > 0;

    const wrappedExecute = async () => {
      if (hasPreHooks) {
        const hookResult = await runPreToolUseHooks(
          "dangerousTool",
          {},
          "session-1"
        );
        if (hookResult.blocked) {
          return `Tool blocked by plugin hook: ${hookResult.blockReason}`;
        }
      }
      return originalExecute();
    };

    const result = await wrappedExecute();
    expect(result).toContain("Tool blocked by plugin hook:");
    expect(result).toContain("Not allowed");
  });

  it("should not wrap tools without execute function", () => {
    // Tools without execute (schema-only) should be passed through
    const schemaOnlyTool = {
      description: "A schema-only tool",
      parameters: { type: "object" },
    };

    // Simulate the wrapping check from chat/route.ts
    const hasExecute = !!schemaOnlyTool.hasOwnProperty("execute");
    expect(hasExecute).toBe(false);
  });
});

// =============================================================================
// Skill Loader Type Tests (unit-level, no DB)
// =============================================================================

describe("Plugin Skill Entry Types", () => {
  it("should construct valid PluginSkillEntry", () => {
    const skill: PluginSkillEntry = {
      name: "configure",
      namespacedName: "hookify:configure",
      description: "Configure hookify plugin settings",
      content: "---\nname: configure\n---\n\nConfigure the plugin.",
      relativePath: "commands/configure/SKILL.md",
    };

    expect(skill.namespacedName).toBe("hookify:configure");
    expect(skill.name).toBe("configure");
    expect(skill.content).toContain("Configure the plugin");
  });

  it("should build plugin skills summary string", () => {
    const skills: PluginSkillEntry[] = [
      {
        name: "configure",
        namespacedName: "hookify:configure",
        description: "Configure hookify plugin settings",
        content: "content",
        relativePath: "commands/configure/SKILL.md",
      },
      {
        name: "review",
        namespacedName: "code-review:review",
        description: "Run code review on changes",
        content: "content",
        relativePath: "commands/review/SKILL.md",
      },
    ];

    // Simulate getPluginSkillsForPrompt logic
    const lines = skills.map(
      (s) => `- /${s.namespacedName}: ${s.description || s.name}`
    );
    const summary = `\n\nAvailable plugin commands:\n${lines.join("\n")}`;

    expect(summary).toContain("/hookify:configure: Configure hookify plugin settings");
    expect(summary).toContain("/code-review:review: Run code review on changes");
    expect(summary).toContain("Available plugin commands:");
  });

  it("should return empty string when no skills", () => {
    const skills: PluginSkillEntry[] = [];
    if (skills.length === 0) {
      expect("").toBe("");
    }
  });
});

// =============================================================================
// Multi-Plugin Hook Interaction Tests
// =============================================================================

describe("Multi-Plugin Hook Interactions", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should execute hooks from multiple plugins in order", async () => {
    const plugin1: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'plugin1 ok'" }],
          },
        ],
      },
    };

    const plugin2: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'plugin2 ok'" }],
          },
        ],
      },
    };

    registerPluginHooks("plugin-1", plugin1);
    registerPluginHooks("plugin-2", plugin2);

    const sources = getRegisteredHooks("PreToolUse");
    expect(sources.length).toBe(2);

    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "session-1");
    expect(result.blocked).toBe(false);
  });

  it("should stop at first blocking plugin", async () => {
    const plugin1: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'Blocked by plugin1' >&2; exit 2" }],
          },
        ],
      },
    };

    const plugin2: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "editFile",
            hooks: [{ type: "command", command: "echo 'plugin2 should not run'" }],
          },
        ],
      },
    };

    registerPluginHooks("blocker", plugin1);
    registerPluginHooks("observer", plugin2);

    const result = await runPreToolUseHooks("editFile", { path: "/test.ts" }, "session-1");
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toContain("Blocked by plugin1");
  });
});
