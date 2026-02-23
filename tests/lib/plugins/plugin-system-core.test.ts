/**
 * Plugin System Tests — Core (Phase 1)
 *
 * Comprehensive tests using 2 real plugin fixtures:
 * 1. "commit-commands" — A dev workflow plugin with skills, hooks, and MCP
 * 2. "code-review"     — A code intelligence plugin with agent skills and LSP
 *
 * Tests cover: types, validation, and import parsing.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  parsePluginFromFiles,
  parsePluginFromMarkdown,
  parsePluginPackage,
} from "@/lib/plugins/import-parser";
import {
  pluginManifestSchema,
  pluginHooksConfigSchema,
  marketplaceManifestSchema,
  RESERVED_MARKETPLACE_NAMES,
  preToolUseHookInputSchema,
  postToolUseHookInputSchema,
  postToolUseFailureHookInputSchema,
} from "@/lib/plugins/validation";
import type {
  PluginManifest,
  PluginHooksConfig,
  MarketplaceManifest,
  PreToolUseHookInput,
  PostToolUseHookInput,
} from "@/lib/plugins/types";

// =============================================================================
// Test Plugin Fixtures — Real Plugin Data
// =============================================================================

/** Plugin 1: commit-commands — Git workflow automation plugin */
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

/** Plugin 2: code-review — Code intelligence & review plugin */
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

  // .claude-plugin/plugin.json
  zip.file(".claude-plugin/plugin.json", JSON.stringify(options.manifest, null, 2));

  // commands/*.md
  if (options.commands) {
    for (const [name, content] of Object.entries(options.commands)) {
      zip.file(`commands/${name}.md`, content);
    }
  }

  // skills/*/SKILL.md
  if (options.skills) {
    for (const [name, content] of Object.entries(options.skills)) {
      zip.file(`skills/${name}/SKILL.md`, content);
    }
  }

  // agents/*.md or agents/*.mds
  if (options.agents) {
    for (const [name, content] of Object.entries(options.agents)) {
      const agentFileName = /\.mds?$/i.test(name) ? name : `${name}.md`;
      zip.file(`agents/${agentFileName}`, content);
    }
  }

  // hooks/hooks.json
  if (options.hooksJson) {
    zip.file("hooks/hooks.json", JSON.stringify(options.hooksJson, null, 2));
  }

  // .mcp.json
  if (options.mcpJson) {
    zip.file(".mcp.json", JSON.stringify(options.mcpJson, null, 2));
  }

  // .lsp.json
  if (options.lspJson) {
    zip.file(".lsp.json", JSON.stringify(options.lspJson, null, 2));
  }

  // Extra files
  if (options.extraFiles) {
    for (const [path, content] of Object.entries(options.extraFiles)) {
      zip.file(path, content);
    }
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return buf;
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
// Test Suite: Plugin Manifest Validation
// =============================================================================

describe("Plugin Manifest Validation", () => {
  it("should validate a complete manifest (commit-commands)", () => {
    const result = pluginManifestSchema.safeParse(COMMIT_COMMANDS_MANIFEST);
    expect(result.success).toBe(true);
  });

  it("should validate a minimal manifest (code-review)", () => {
    const result = pluginManifestSchema.safeParse(CODE_REVIEW_MANIFEST);
    expect(result.success).toBe(true);
  });

  it("should reject manifest without name", () => {
    const result = pluginManifestSchema.safeParse({
      description: "No name",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("should reject manifest with invalid name (spaces)", () => {
    const result = pluginManifestSchema.safeParse({
      name: "invalid name",
      description: "Has spaces",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("should reject manifest with invalid name (uppercase)", () => {
    const result = pluginManifestSchema.safeParse({
      name: "InvalidName",
      description: "Has uppercase",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("should accept single-character names", () => {
    const result = pluginManifestSchema.safeParse({
      name: "x",
      description: "Single char",
      version: "1.0.0",
    });
    expect(result.success).toBe(true);
  });

  it("should accept manifest with inline hooks config", () => {
    const manifest = {
      ...COMMIT_COMMANDS_MANIFEST,
      hooks: COMMIT_COMMANDS_HOOKS,
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it("should accept manifest with string hooks path", () => {
    const manifest = {
      ...COMMIT_COMMANDS_MANIFEST,
      hooks: "hooks/my-hooks.json",
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it("should accept manifest with MCP server configs", () => {
    const manifest = {
      ...COMMIT_COMMANDS_MANIFEST,
      mcpServers: {
        "github-api": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          type: "stdio" as const,
        },
      },
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it("should accept manifest with LSP server configs", () => {
    const manifest = {
      ...CODE_REVIEW_MANIFEST,
      lspServers: {
        typescript: {
          command: "typescript-language-server",
          args: ["--stdio"],
          extensionToLanguage: {
            ".ts": "typescript",
            ".tsx": "typescriptreact",
          },
        },
      },
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Test Suite: Hooks Config Validation
// =============================================================================

describe("Hooks Config Validation", () => {
  it("should validate commit-commands hooks config", () => {
    const result = pluginHooksConfigSchema.safeParse(COMMIT_COMMANDS_HOOKS);
    expect(result.success).toBe(true);
  });

  it("should validate empty hooks config", () => {
    const result = pluginHooksConfigSchema.safeParse({ hooks: {} });
    expect(result.success).toBe(true);
  });

  it("should validate hooks with all event types", () => {
    const allEvents: PluginHooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }],
        PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "echo pre" }] }],
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo post" }] }],
        PostToolUseFailure: [{ hooks: [{ type: "command", command: "echo fail" }] }],
        Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
        SessionEnd: [{ hooks: [{ type: "command", command: "echo end" }] }],
      },
    };
    const result = pluginHooksConfigSchema.safeParse(allEvents);
    expect(result.success).toBe(true);
  });

  it("should reject hook handler without type", () => {
    const invalid = {
      hooks: {
        PreToolUse: [
          {
            hooks: [{ command: "echo test" }], // missing type
          },
        ],
      },
    };
    const result = pluginHooksConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Test Suite: Hook Input Validation
// =============================================================================

describe("Hook Input Validation", () => {
  it("should validate PreToolUse input", () => {
    const input: PreToolUseHookInput = {
      hook_type: "PreToolUse",
      tool_name: "editFile",
      tool_input: { file_path: "/test.ts", content: "hello" },
      session_id: "sess-123",
    };
    const result = preToolUseHookInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should validate PostToolUse input", () => {
    const input: PostToolUseHookInput = {
      hook_type: "PostToolUse",
      tool_name: "writeFile",
      tool_input: { file_path: "/test.ts" },
      tool_output: { success: true },
    };
    const result = postToolUseHookInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should validate PostToolUseFailure input", () => {
    const input = {
      hook_type: "PostToolUseFailure",
      tool_name: "executeCommand",
      tool_input: { command: "npm test" },
      error: "Process exited with code 1",
    };
    const result = postToolUseFailureHookInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should reject PreToolUse input without tool_name", () => {
    const input = {
      hook_type: "PreToolUse",
      tool_input: {},
    };
    const result = preToolUseHookInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Test Suite: Marketplace Validation
// =============================================================================

describe("Marketplace Manifest Validation", () => {
  it("should validate a complete marketplace manifest", () => {
    const marketplace: MarketplaceManifest = {
      name: "company-tools",
      owner: { name: "DevTools Team", email: "devtools@example.com" },
      metadata: {
        description: "Internal development tools",
        version: "1.0.0",
      },
      plugins: [
        {
          name: "commit-commands",
          source: "./plugins/commit-commands",
          description: "Git commit workflows",
          version: "2.1.0",
        },
        {
          name: "code-review",
          source: {
            source: "github",
            repo: "company/code-review-plugin",
            ref: "v1.0.0",
          },
          description: "Code review tools",
        },
      ],
    };
    const result = marketplaceManifestSchema.safeParse(marketplace);
    expect(result.success).toBe(true);
  });

  it("should reject marketplace without owner", () => {
    const result = marketplaceManifestSchema.safeParse({
      name: "invalid",
      plugins: [],
    });
    expect(result.success).toBe(false);
  });

  it("should identify reserved marketplace names", () => {
    expect(RESERVED_MARKETPLACE_NAMES.has("claude-plugins-official")).toBe(true);
    expect(RESERVED_MARKETPLACE_NAMES.has("anthropic-marketplace")).toBe(true);
    expect(RESERVED_MARKETPLACE_NAMES.has("my-custom-marketplace")).toBe(false);
  });
});

// =============================================================================
// Test Suite: Plugin Import Parser — Full Plugin Format
// =============================================================================

describe("Plugin Import Parser — Full Plugin", () => {
  it("should parse commit-commands plugin zip with all components", async () => {
    const zipBuf = await buildPluginZip({
      manifest: COMMIT_COMMANDS_MANIFEST,
      commands: {
        commit: "---\ndescription: Stage and commit changes\n---\n\nStage all changes and create a commit with a descriptive message.",
        push: "---\ndescription: Push commits to remote\n---\n\nPush local commits to the remote repository.",
      },
      hooksJson: COMMIT_COMMANDS_HOOKS,
      mcpJson: {
        "github-api": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          type: "stdio",
        },
      },
    });

    const result = await parsePluginPackage(zipBuf);

    expect(result.isLegacySkillFormat).toBe(false);
    expect(result.manifest.name).toBe("commit-commands");
    expect(result.manifest.version).toBe("2.1.0");

    // Skills from commands/
    expect(result.components.skills).toHaveLength(2);
    expect(result.components.skills[0].namespacedName).toBe("commit-commands:commit");
    expect(result.components.skills[1].namespacedName).toBe("commit-commands:push");

    // Hooks
    expect(result.components.hooks).not.toBeNull();
    expect(result.components.hooks!.hooks.PostToolUse).toHaveLength(1);
    expect(result.components.hooks!.hooks.PreToolUse).toHaveLength(1);

    // MCP
    expect(result.components.mcpServers).not.toBeNull();
    expect(result.components.mcpServers!["github-api"]).toBeDefined();

    expect(result.warnings).toHaveLength(0);
  });

  it("should parse code-review plugin with skills, agents, and LSP", async () => {
    const zipBuf = await buildPluginZip({
      manifest: CODE_REVIEW_MANIFEST,
      skills: {
        "security-scan": "---\nname: security-scan\ndescription: Scan code for security vulnerabilities\n---\n\nAnalyze the code for OWASP Top 10 vulnerabilities.",
      },
      agents: {
        "security-reviewer": "---\ndescription: Security-focused code reviewer\n---\n\nYou are a security expert. Review code for vulnerabilities.",
      },
      lspJson: {
        typescript: {
          command: "typescript-language-server",
          args: ["--stdio"],
          extensionToLanguage: { ".ts": "typescript", ".tsx": "typescriptreact" },
        },
      },
    });

    const result = await parsePluginPackage(zipBuf);

    expect(result.isLegacySkillFormat).toBe(false);
    expect(result.manifest.name).toBe("code-review");

    // Skills from skills/
    expect(result.components.skills).toHaveLength(1);
    expect(result.components.skills[0].namespacedName).toBe("code-review:security-scan");
    expect(result.components.skills[0].description).toBe("Scan code for security vulnerabilities");

    // Agents
    expect(result.components.agents).toHaveLength(1);
    expect(result.components.agents[0].name).toBe("security-reviewer");
    expect(result.components.agents[0].description).toBe("Security-focused code reviewer");

    // MDS extension and folder-style AGENT.* naming should also work.
    const mdsZip = await buildPluginZip({
      manifest: CODE_REVIEW_MANIFEST,
      agents: {
        "platform-architect.mds": "---\ndescription: Platform architecture specialist\n---\n\nDesign systems.",
        "security/Agent.mds": "---\ndescription: Security specialist\n---\n\nReview security.",
      },
    });
    const mdsResult = await parsePluginPackage(mdsZip);
    expect(mdsResult.components.agents).toHaveLength(2);
    expect(mdsResult.components.agents.map((a) => a.name)).toEqual(
      expect.arrayContaining(["platform-architect", "security"])
    );

    // LSP
    expect(result.components.lspServers).not.toBeNull();
    expect(result.components.lspServers!["typescript"]).toBeDefined();
    expect(result.components.lspServers!["typescript"].command).toBe("typescript-language-server");
  });

  it("should handle mixed commands/ and skills/ directories", async () => {
    const zipBuf = await buildPluginZip({
      manifest: COMMIT_COMMANDS_MANIFEST,
      commands: {
        quick: "---\ndescription: Quick commit\ndisable-model-invocation: true\n---\n\nQuick commit.",
      },
      skills: {
        "auto-review": "---\nname: auto-review\ndescription: Auto review\n---\n\nReview automatically.",
      },
    });

    const result = await parsePluginPackage(zipBuf);
    expect(result.components.skills).toHaveLength(2);

    const names = result.components.skills.map((s) => s.name);
    expect(names).toContain("quick");
    expect(names).toContain("auto-review");

    const quickSkill = result.components.skills.find((s) => s.name === "quick");
    expect(quickSkill?.disableModelInvocation).toBe(true);
  });

  it("should skip blocked file extensions", async () => {
    const zipBuf = await buildPluginZip({
      manifest: COMMIT_COMMANDS_MANIFEST,
      extraFiles: {
        "scripts/malware.exe": "bad content",
        "scripts/helper.sh": "#!/bin/bash\necho hello",
      },
    });

    const result = await parsePluginPackage(zipBuf);
    const filePaths = result.files.map((f) => f.relativePath);
    expect(filePaths).not.toContain("scripts/malware.exe");
    expect(filePaths).toContain("scripts/helper.sh");
    expect(result.warnings.some((w) => w.includes("blocked"))).toBe(true);
  });

  it("should reject zip without manifest or SKILL.md", async () => {
    const zip = new JSZip();
    zip.file("random.txt", "hello");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parsePluginPackage(buf)).rejects.toThrow(
      "Invalid plugin package"
    );
  });

  it("should normalize missing manifest version instead of failing import", async () => {
    const zipBuf = await buildPluginZip({
      manifest: {
        name: "versionless-plugin",
        description: "Plugin without explicit version",
        // Intentionally omitted to simulate marketplace packages that are slightly malformed.
        version: "",
      },
      commands: {
        run: "---\ndescription: Run\n---\n\nRun task.",
      },
    });

    const result = await parsePluginPackage(zipBuf);
    expect(result.manifest.version).toBe("1.0.0");
    expect(result.warnings.some((w) => w.includes("missing 'version'"))).toBe(true);
  });

  it("should parse nested SKILL.md packages from folder-like uploads", async () => {
    const zip = new JSZip();
    zip.file("skills/research/SKILL.md", "---\nname: research\ndescription: Research helper\n---\n\nResearch deeply.");
    zip.file("agents/security/Agent.mds", "---\ndescription: Security specialist\n---\n\nReview security.");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await parsePluginPackage(buf, { sourceLabel: "folder-drop" });
    expect(result.manifest.name).toBe("folder-drop");
    expect(result.components.skills).toHaveLength(1);
    expect(result.components.agents).toHaveLength(1);
    expect(result.components.agents[0].name).toBe("security");
    expect(result.isLegacySkillFormat).toBe(false);
    expect(result.warnings.some((w) => w.includes("synthetic manifest"))).toBe(true);
  });
});

// =============================================================================
// Test Suite: Plugin Import Parser — Legacy SKILL.md Format
// =============================================================================

describe("Plugin Import Parser — Legacy SKILL.md", () => {
  it("should parse a legacy SKILL.md zip as a plugin", async () => {
    const skillMd = `---
name: daily-report
description: Generate a daily standup report
license: MIT
---

Generate a concise daily standup report covering:
- What was completed yesterday
- What is planned for today
- Any blockers`;

    const zipBuf = await buildLegacySkillZip(skillMd, {
      "scripts/format.py": "print('formatted')",
    });

    const result = await parsePluginPackage(zipBuf);

    expect(result.isLegacySkillFormat).toBe(true);
    expect(result.manifest.name).toBe("daily-report");
    expect(result.manifest.description).toBe("Generate a daily standup report");
    expect(result.manifest.version).toBe("1.0.0");

    expect(result.components.skills).toHaveLength(1);
    expect(result.components.skills[0].name).toBe("daily-report");
    expect(result.components.skills[0].content).toContain("daily standup report");

    expect(result.components.hooks).toBeNull();
    expect(result.components.mcpServers).toBeNull();
    expect(result.components.lspServers).toBeNull();

    expect(result.files).toHaveLength(1); // format.py
    expect(result.warnings.some((w) => w.includes("legacy"))).toBe(true);
  });
});

// =============================================================================
// Re-exported helpers for use by plugin-system-advanced.test.ts
// =============================================================================

export { buildPluginZip, buildLegacySkillZip, COMMIT_COMMANDS_MANIFEST, COMMIT_COMMANDS_HOOKS, CODE_REVIEW_MANIFEST };
