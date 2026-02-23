/**
 * Plugin System Tests — Advanced (Phase 2)
 *
 * Tests cover: hooks engine registration/dispatch, type system integrity,
 * and end-to-end integration flows.
 *
 * Uses shared fixtures from plugin-system-core.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";
import {
  parsePluginFromFiles,
  parsePluginFromMarkdown,
  parsePluginPackage,
} from "@/lib/plugins/import-parser";
import {
  pluginManifestSchema,
} from "@/lib/plugins/validation";
import {
  registerPluginHooks,
  unregisterPluginHooks,
  clearAllHooks,
  getRegisteredHooks,
  dispatchHook,
} from "@/lib/plugins/hooks-engine";
import type {
  PluginManifest,
  PluginHooksConfig,
  HookEventType,
  PluginComponents,
  PluginScope,
  PluginStatus,
  InstalledPlugin,
} from "@/lib/plugins/types";

// =============================================================================
// Test Plugin Fixtures (duplicated from core for self-contained advanced suite)
// =============================================================================

const COMMIT_COMMANDS_MANIFEST: PluginManifest = {
  name: "commit-commands",
  description: "Git commit workflows including commit, push, and PR creation",
  version: "2.1.0",
  author: { name: "DevTools Team", email: "devtools@example.com" },
  homepage: "https://github.com/example/commit-commands",
  repository: "https://github.com/example/commit-commands",
  license: "MIT",
  keywords: ["git", "commit", "workflow", "automation"],
  category: "development",
};

const COMMIT_COMMANDS_HOOKS: PluginHooksConfig = {
  hooks: {
    PostToolUse: [
      {
        matcher: "Write|Edit",
        hooks: [
          {
            type: "command",
            command: "echo 'File changed'",
            timeout: 30,
            statusMessage: "Checking file changes...",
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: "echo 'Pre-bash hook'",
            timeout: 10,
          },
        ],
      },
    ],
  },
};

const CODE_REVIEW_MANIFEST: PluginManifest = {
  name: "code-review",
  description: "Specialized agents for reviewing pull requests with code intelligence",
  version: "1.0.0",
  author: { name: "Code Quality Team" },
  license: "Apache-2.0",
  keywords: ["review", "code-quality", "linting"],
  category: "code-intelligence",
};

// =============================================================================
// Helper: Build a plugin zip in memory
// =============================================================================

async function buildPluginZip(options: {
  manifest: PluginManifest;
  commands?: Record<string, string>;
  skills?: Record<string, string>;
  agents?: Record<string, string>;
  hooksJson?: PluginHooksConfig;
  mcpJson?: Record<string, unknown>;
  lspJson?: Record<string, unknown>;
  extraFiles?: Record<string, string>;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(".claude-plugin/plugin.json", JSON.stringify(options.manifest, null, 2));
  if (options.commands) {
    for (const [name, content] of Object.entries(options.commands)) {
      zip.file(`commands/${name}.md`, content);
    }
  }
  if (options.skills) {
    for (const [name, content] of Object.entries(options.skills)) {
      zip.file(`skills/${name}/SKILL.md`, content);
    }
  }
  if (options.agents) {
    for (const [name, content] of Object.entries(options.agents)) {
      const agentFileName = /\.mds?$/i.test(name) ? name : `${name}.md`;
      zip.file(`agents/${agentFileName}`, content);
    }
  }
  if (options.hooksJson) {
    zip.file("hooks/hooks.json", JSON.stringify(options.hooksJson, null, 2));
  }
  if (options.mcpJson) {
    zip.file(".mcp.json", JSON.stringify(options.mcpJson, null, 2));
  }
  if (options.lspJson) {
    zip.file(".lsp.json", JSON.stringify(options.lspJson, null, 2));
  }
  if (options.extraFiles) {
    for (const [path, content] of Object.entries(options.extraFiles)) {
      zip.file(path, content);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildLegacySkillZip(skillMd: string, extraFiles?: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("SKILL.md", skillMd);
  if (extraFiles) {
    for (const [path, content] of Object.entries(extraFiles)) {
      zip.file(path, content);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

// =============================================================================
// Test Suite: Hooks Engine — Registration & Dispatch
// =============================================================================

describe("Hooks Engine — Registration", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should register hooks from commit-commands plugin", () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);

    const postToolUse = getRegisteredHooks("PostToolUse");
    expect(postToolUse).toHaveLength(1);
    expect(postToolUse[0].pluginName).toBe("commit-commands");
    expect(postToolUse[0].entries).toHaveLength(1);

    const preToolUse = getRegisteredHooks("PreToolUse");
    expect(preToolUse).toHaveLength(1);
  });

  it("should register hooks from multiple plugins", () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);

    const codeReviewHooks: PluginHooksConfig = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: "echo 'lint check'" }],
          },
        ],
      },
    };
    registerPluginHooks("code-review", codeReviewHooks);

    const postToolUse = getRegisteredHooks("PostToolUse");
    expect(postToolUse).toHaveLength(2);
    expect(postToolUse.map((s) => s.pluginName)).toEqual(["commit-commands", "code-review"]);
  });

  it("should unregister hooks from a specific plugin", () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);
    registerPluginHooks("code-review", {
      hooks: {
        PostToolUse: [{ hooks: [{ type: "command", command: "echo review" }] }],
      },
    });

    expect(getRegisteredHooks("PostToolUse")).toHaveLength(2);

    unregisterPluginHooks("commit-commands");

    expect(getRegisteredHooks("PostToolUse")).toHaveLength(1);
    expect(getRegisteredHooks("PostToolUse")[0].pluginName).toBe("code-review");
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(0);
  });

  it("should clear all hooks", () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);
    clearAllHooks();
    expect(getRegisteredHooks("PostToolUse")).toHaveLength(0);
    expect(getRegisteredHooks("PreToolUse")).toHaveLength(0);
  });

  it("should return empty array for unregistered events", () => {
    expect(getRegisteredHooks("SessionStart")).toHaveLength(0);
    expect(getRegisteredHooks("Stop")).toHaveLength(0);
  });
});

describe("Hooks Engine — Dispatch", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should dispatch PostToolUse hook and execute echo command", async () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);

    const result = await dispatchHook(
      "PostToolUse",
      {
        hook_type: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/test.ts" },
      },
      { toolName: "Write" }
    );

    expect(result.blocked).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].pluginName).toBe("commit-commands");
    expect(result.results[0].result.success).toBe(true);
    expect(result.results[0].result.exitCode).toBe(0);
    expect(result.results[0].result.stdout.trim()).toBe("File changed");
  });

  it("should not dispatch when matcher does not match", async () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);

    const result = await dispatchHook(
      "PostToolUse",
      {
        hook_type: "PostToolUse",
        tool_name: "readFile",
        tool_input: {},
      },
      { toolName: "readFile" }
    );

    expect(result.results).toHaveLength(0);
  });

  it("should dispatch PreToolUse hook with Bash matcher", async () => {
    registerPluginHooks("commit-commands", COMMIT_COMMANDS_HOOKS);

    const result = await dispatchHook(
      "PreToolUse",
      {
        hook_type: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      },
      { toolName: "Bash" }
    );

    expect(result.blocked).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].result.stdout.trim()).toBe("Pre-bash hook");
  });

  it("should handle blocking PreToolUse hook (exit code 2)", async () => {
    const blockingHooks: PluginHooksConfig = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "echo 'Dangerous command blocked' >&2; exit 2",
              },
            ],
          },
        ],
      },
    };

    registerPluginHooks("security-guard", blockingHooks);

    const result = await dispatchHook(
      "PreToolUse",
      {
        hook_type: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      },
      { toolName: "Bash" }
    );

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toContain("Dangerous command blocked");
    expect(result.results[0].result.exitCode).toBe(2);
    expect(result.results[0].result.blocked).toBe(true);
  });

  it("should return empty results when no hooks registered", async () => {
    const result = await dispatchHook("PostToolUse", {
      hook_type: "PostToolUse",
      tool_name: "Write",
      tool_input: {},
    });

    expect(result.blocked).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.totalDurationMs).toBeLessThan(50);
  });

  it("should handle hook command failure gracefully", async () => {
    registerPluginHooks("broken-plugin", {
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "nonexistent-command-that-does-not-exist-xyz",
              },
            ],
          },
        ],
      },
    });

    const result = await dispatchHook("PostToolUse", {
      hook_type: "PostToolUse",
      tool_name: "Write",
      tool_input: {},
    });

    expect(result.blocked).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].result.success).toBe(false);
  });
});

// =============================================================================
// Test Suite: Type System Integrity
// =============================================================================

describe("Type System Integrity", () => {
  it("should enforce PluginScope type", () => {
    const validScopes: PluginScope[] = ["user", "project", "local", "managed"];
    expect(validScopes).toHaveLength(4);
  });

  it("should enforce PluginStatus type", () => {
    const validStatuses: PluginStatus[] = ["active", "disabled", "error"];
    expect(validStatuses).toHaveLength(3);
  });

  it("should enforce HookEventType covers all Anthropic events", () => {
    const allEvents: HookEventType[] = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PostToolUseFailure",
      "Notification",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "TeammateIdle",
      "TaskCompleted",
      "PreCompact",
      "SessionEnd",
    ];
    expect(allEvents).toHaveLength(14);
  });

  it("should construct a valid InstalledPlugin record", () => {
    const plugin: InstalledPlugin = {
      id: crypto.randomUUID(),
      name: "commit-commands",
      description: COMMIT_COMMANDS_MANIFEST.description,
      version: "2.1.0",
      scope: "user",
      status: "active",
      marketplaceName: "company-tools",
      manifest: COMMIT_COMMANDS_MANIFEST,
      components: {
        skills: [
          {
            name: "commit",
            namespacedName: "commit-commands:commit",
            description: "Stage and commit",
            content: "Stage all changes",
            relativePath: "commands/commit.md",
          },
        ],
        agents: [],
        hooks: COMMIT_COMMANDS_HOOKS,
        mcpServers: null,
        lspServers: null,
      },
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(plugin.name).toBe("commit-commands");
    expect(plugin.scope).toBe("user");
    expect(plugin.components.skills).toHaveLength(1);
    expect(plugin.components.hooks).not.toBeNull();
  });

  it("should construct valid PluginComponents with all fields", () => {
    const components: PluginComponents = {
      skills: [],
      agents: [],
      hooks: { hooks: {} },
      mcpServers: {
        "test-server": {
          command: "npx",
          args: ["-y", "test-server"],
          type: "stdio",
        },
      },
      lspServers: {
        go: {
          command: "gopls",
          args: ["serve"],
          extensionToLanguage: { ".go": "go" },
        },
      },
    };

    expect(components.mcpServers).not.toBeNull();
    expect(components.lspServers).not.toBeNull();
    expect(components.mcpServers!["test-server"].command).toBe("npx");
    expect(components.lspServers!["go"].extensionToLanguage[".go"]).toBe("go");
  });
});

// =============================================================================
// Test Suite: Integration — End-to-End Plugin Flow
// =============================================================================

describe("Integration — End-to-End Plugin Flow", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  afterEach(() => {
    clearAllHooks();
  });

  it("should parse commit-commands zip → register hooks → dispatch → verify", async () => {
    // Step 1: Build and parse
    const zipBuf = await buildPluginZip({
      manifest: COMMIT_COMMANDS_MANIFEST,
      commands: {
        commit: "---\ndescription: Commit changes\n---\n\nCommit all staged changes.",
      },
      hooksJson: COMMIT_COMMANDS_HOOKS,
    });

    const parsed = await parsePluginPackage(zipBuf);
    expect(parsed.manifest.name).toBe("commit-commands");
    expect(parsed.components.hooks).not.toBeNull();

    // Step 2: Register hooks
    registerPluginHooks(parsed.manifest.name, parsed.components.hooks!);

    // Step 3: Dispatch PostToolUse hook
    const hookResult = await dispatchHook(
      "PostToolUse",
      {
        hook_type: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "/src/index.ts" },
      },
      { toolName: "Edit" }
    );

    // Step 4: Verify
    expect(hookResult.blocked).toBe(false);
    expect(hookResult.results).toHaveLength(1);
    expect(hookResult.results[0].result.success).toBe(true);
  });

  it("should parse code-review zip → validate all components → verify types", async () => {
    const zipBuf = await buildPluginZip({
      manifest: CODE_REVIEW_MANIFEST,
      skills: {
        "review": "---\nname: review\ndescription: Review code for bugs, security, and performance\ndisable-model-invocation: true\n---\n\nReview the code for potential issues.",
      },
      agents: {
        "compliance-checker": "---\ndescription: Checks code against compliance rules\n---\n\nYou are a compliance checker.",
      },
      lspJson: {
        python: {
          command: "pyright-langserver",
          args: ["--stdio"],
          extensionToLanguage: { ".py": "python" },
        },
      },
    });

    const parsed = await parsePluginPackage(zipBuf);

    // Validate manifest
    const manifestResult = pluginManifestSchema.safeParse(parsed.manifest);
    expect(manifestResult.success).toBe(true);

    // Validate components
    expect(parsed.components.skills).toHaveLength(1);
    expect(parsed.components.skills[0].disableModelInvocation).toBe(true);
    expect(parsed.components.agents).toHaveLength(1);
    // Accept both .md and .mds agent files in folder-style layout.
    const mdsPathZip = await buildPluginZip({
      manifest: CODE_REVIEW_MANIFEST,
      agents: {
        "ops/AGENT.md": "---\ndescription: Ops specialist\n---\n\nOperate systems.",
      },
    });
    const mdsPathParsed = await parsePluginPackage(mdsPathZip);
    expect(mdsPathParsed.components.agents).toHaveLength(1);
    expect(mdsPathParsed.components.agents[0].name).toBe("ops");
    expect(parsed.components.lspServers).not.toBeNull();
    expect(parsed.components.lspServers!["python"].command).toBe("pyright-langserver");

    // No hooks or MCP
    expect(parsed.components.hooks).toBeNull();
    expect(parsed.components.mcpServers).toBeNull();
  });

  it("should handle legacy SKILL.md → full plugin upgrade path", async () => {
    // Step 1: Parse legacy format
    const legacyZip = await buildLegacySkillZip(
      "---\nname: old-skill\ndescription: Legacy skill\n---\n\nDo something."
    );
    const legacy = await parsePluginPackage(legacyZip);
    expect(legacy.isLegacySkillFormat).toBe(true);

    // Step 2: Parse full plugin format with same skill
    const fullZip = await buildPluginZip({
      manifest: {
        name: "old-skill",
        description: "Upgraded to full plugin",
        version: "2.0.0",
      },
      skills: {
        "old-skill": "---\nname: old-skill\ndescription: Legacy skill (upgraded)\n---\n\nDo something better.",
      },
    });
    const full = await parsePluginPackage(fullZip);
    expect(full.isLegacySkillFormat).toBe(false);
    expect(full.manifest.version).toBe("2.0.0");
    expect(full.components.skills[0].namespacedName).toBe("old-skill:old-skill");
  });

  it("should parse a single markdown upload into a legacy plugin shape", async () => {
    const parsed = await parsePluginFromMarkdown(
      Buffer.from("---\nname: md-skill\ndescription: Imported from markdown\n---\n\nDo md things."),
      "md-skill.md"
    );

    expect(parsed.isLegacySkillFormat).toBe(true);
    expect(parsed.manifest.name).toBe("md-skill");
    expect(parsed.components.skills).toHaveLength(1);
  });

  it("should parse folder-uploaded files using relative paths", async () => {
    const parsed = await parsePluginFromFiles([
      {
        relativePath: ".claude-plugin/plugin.json",
        content: Buffer.from(
          JSON.stringify(
            {
              name: "folder-plugin",
              description: "Imported from folder",
              version: "1.2.3",
            },
            null,
            2
          )
        ),
      },
      {
        relativePath: "skills/folder-skill/SKILL.md",
        content: Buffer.from("---\nname: folder-skill\ndescription: Folder skill\n---\n\nFrom folder upload."),
      },
    ]);

    expect(parsed.isLegacySkillFormat).toBe(false);
    expect(parsed.manifest.name).toBe("folder-plugin");
    expect(parsed.components.skills.map((s) => s.name)).toContain("folder-skill");
  });

  it("should infer nested manifestless plugin roots from folder drops", async () => {
    const parsed = await parsePluginFromFiles([
      {
        relativePath: "plugin-dev/skills/plugin-structure/SKILL.md",
        content: Buffer.from("---\nname: plugin-structure\ndescription: Structure patterns\n---\n\nBuild plugins."),
      },
      {
        relativePath: "plugin-dev/agents/plugin-validator.mds",
        content: Buffer.from("---\ndescription: Validates plugin packages\n---\n\nValidate plugin folders."),
      },
      {
        relativePath: "plugin-dev/hooks/hooks.json",
        content: Buffer.from(
          JSON.stringify(
            {
              hooks: {
                SessionStart: [
                  {
                    hooks: [
                      {
                        type: "command",
                        command: "echo plugin-dev",
                      },
                    ],
                  },
                ],
              },
            },
            null,
            2
          )
        ),
      },
      {
        relativePath: "plugin-dev/.mcp.json",
        content: Buffer.from(
          JSON.stringify(
            {
              local: {
                command: "node",
                args: ["server.js"],
                type: "stdio",
              },
            },
            null,
            2
          )
        ),
      },
    ]);

    expect(parsed.isLegacySkillFormat).toBe(false);
    expect(parsed.manifest.name).toBe("uploaded-plugin");
    expect(parsed.components.skills.map((s) => s.name)).toContain("plugin-structure");
    expect(parsed.components.agents.map((a) => a.name)).toContain("plugin-validator");
    expect(parsed.components.hooks).not.toBeNull();
    expect(parsed.components.mcpServers).not.toBeNull();
    expect(parsed.warnings.some((w) => w.includes("nested plugin root prefix"))).toBe(true);
    expect(parsed.files.some((f) => f.relativePath.startsWith("plugin-dev/"))).toBe(false);
  });
});
