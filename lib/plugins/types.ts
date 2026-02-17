/**
 * Plugin System Type Definitions
 *
 * Implements the Anthropic Claude Code Plugin Standard.
 * Plugins are the top-level container that bundle Skills (commands),
 * Agents, Hooks, MCP servers, and LSP servers.
 *
 * @see https://code.claude.com/docs/en/plugins-reference
 */

// =============================================================================
// Plugin Manifest (plugin.json)
// =============================================================================

export interface PluginManifest {
  /** Unique identifier (kebab-case). Becomes the namespace prefix for skills. */
  name: string;

  /** Brief plugin description shown in the plugin manager. */
  description: string;

  /** Semantic version string (e.g., "1.0.0"). */
  version: string;

  /** Plugin author information. */
  author?: PluginAuthor;

  /** Plugin homepage or documentation URL. */
  homepage?: string;

  /** Source code repository URL. */
  repository?: string;

  /** SPDX license identifier (e.g., "MIT", "Apache-2.0"). */
  license?: string;

  /** Tags for plugin discovery and categorization. */
  keywords?: string[];

  /** Plugin category for organization. */
  category?: string;

  // ---- Component path overrides (optional, default to convention dirs) ----

  /** Custom paths to command/skill files or directories. */
  commands?: string | string[];

  /** Custom paths to skill directories (alternative to commands). */
  skills?: string | string[];

  /** Custom paths to agent definition files. */
  agents?: string | string[];

  /** Hooks configuration or path to hooks.json. */
  hooks?: string | PluginHooksConfig;

  /** MCP server configurations or path to .mcp.json. */
  mcpServers?: string | PluginMCPConfig;

  /** LSP server configurations or path to .lsp.json. */
  lspServers?: string | PluginLSPConfig;
}

export interface PluginAuthor {
  name: string;
  email?: string;
}

// =============================================================================
// Hook System Types
// =============================================================================

/** All supported hook event types from the Anthropic spec. */
export type HookEventType =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Notification"
  | "SubagentStart"
  | "SubagentStop"
  | "Stop"
  | "TeammateIdle"
  | "TaskCompleted"
  | "PreCompact"
  | "SessionEnd";

/** Hook handler type. */
export type HookHandlerType = "command" | "prompt" | "agent";

/** A single hook handler definition. */
export interface HookHandler {
  /** Handler type: shell command, LLM prompt, or subagent. */
  type: HookHandlerType;

  /** Shell command to execute (for "command" type). Receives JSON on stdin. */
  command?: string;

  /** Timeout in seconds (default: 600). */
  timeout?: number;

  /** Custom status message shown while hook is running. */
  statusMessage?: string;
}

/** A hook entry with matcher and handlers. */
export interface HookEntry {
  /** Regex pattern to match tool names (e.g., "Write|Edit"). */
  matcher?: string;

  /** List of handlers to execute when this entry matches. */
  hooks: HookHandler[];
}

/** Full hooks configuration object. */
export interface PluginHooksConfig {
  hooks: Partial<Record<HookEventType, HookEntry[]>>;
}

/** JSON input provided to PreToolUse hooks via stdin. */
export interface PreToolUseHookInput {
  hook_type: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  session_id?: string;
}

/** JSON input provided to PostToolUse hooks via stdin. */
export interface PostToolUseHookInput {
  hook_type: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: unknown;
  session_id?: string;
}

/** JSON input provided to PostToolUseFailure hooks via stdin. */
export interface PostToolUseFailureHookInput {
  hook_type: "PostToolUseFailure";
  tool_name: string;
  tool_input: Record<string, unknown>;
  error: string;
  session_id?: string;
}

/** JSON input provided to SessionStart hooks via stdin. */
export interface SessionStartHookInput {
  hook_type: "SessionStart";
  session_id: string;
}

/** JSON input provided to Stop hooks via stdin. */
export interface StopHookInput {
  hook_type: "Stop";
  session_id?: string;
  stop_reason?: string;
}

/** Union of all hook input types. */
export type HookInput =
  | PreToolUseHookInput
  | PostToolUseHookInput
  | PostToolUseFailureHookInput
  | SessionStartHookInput
  | StopHookInput;

/** Hook execution result from a command handler. */
export interface HookExecutionResult {
  /** Whether the hook executed successfully. */
  success: boolean;

  /** Exit code from the command (0 = success). */
  exitCode: number;

  /** stdout output from the hook command. */
  stdout: string;

  /** stderr output from the hook command. */
  stderr: string;

  /** Execution duration in milliseconds. */
  durationMs: number;

  /**
   * For PreToolUse: if exit code is 2, the hook is blocking the tool.
   * The stderr should contain the reason.
   */
  blocked?: boolean;

  /** Reason for blocking (from stderr when exitCode === 2). */
  blockReason?: string;
}

// =============================================================================
// MCP Server Configuration (per-plugin)
// =============================================================================

export interface PluginMCPServerEntry {
  /** Command to run (for stdio transport). Supports ${CLAUDE_PLUGIN_ROOT}. */
  command?: string;

  /** Command arguments. Supports ${CLAUDE_PLUGIN_ROOT}. */
  args?: string[];

  /** Environment variables for subprocess. */
  env?: Record<string, string>;

  /** Server URL (for http/sse transport). */
  url?: string;

  /** Optional headers. */
  headers?: Record<string, string>;

  /** Transport type. */
  type?: "http" | "sse" | "stdio";
}

export type PluginMCPConfig = Record<string, PluginMCPServerEntry>;

// =============================================================================
// LSP Server Configuration (per-plugin)
// =============================================================================

export interface PluginLSPServerEntry {
  /** Command to run the language server. */
  command: string;

  /** Command arguments. */
  args?: string[];

  /** Map of file extensions to language identifiers. */
  extensionToLanguage: Record<string, string>;
}

export type PluginLSPConfig = Record<string, PluginLSPServerEntry>;

// =============================================================================
// Plugin Scope & Installation
// =============================================================================

/** Installation scope for a plugin. */
export type PluginScope = "user" | "project" | "local" | "managed";

/** Plugin installation status. */
export type PluginStatus = "active" | "disabled" | "error";

/** A fully resolved installed plugin record. */
export interface InstalledPlugin {
  /** Unique ID in the database. */
  id: string;

  /** Plugin name from manifest. */
  name: string;

  /** Plugin description. */
  description: string;

  /** Semantic version. */
  version: string;

  /** Installation scope. */
  scope: PluginScope;

  /** Current status. */
  status: PluginStatus;

  /** Source marketplace name (if installed from marketplace). */
  marketplaceName?: string;

  /** The full manifest JSON. */
  manifest: PluginManifest;

  /** Resolved components discovered during import. */
  components: PluginComponents;

  /** When the plugin was installed. */
  installedAt: string;

  /** When the plugin was last updated. */
  updatedAt: string;

  /** Last error message (if status is "error"). */
  lastError?: string;

  /** Optional plugin cache path on disk (if persisted). */
  cachePath?: string;
}

/** Components discovered from a plugin directory/zip. */
export interface PluginComponents {
  /** Skill markdown files (relative paths). */
  skills: PluginSkillEntry[];

  /** Agent definition files (relative paths). */
  agents: PluginAgentEntry[];

  /** Hook configurations. */
  hooks: PluginHooksConfig | null;

  /** MCP server configurations. */
  mcpServers: PluginMCPConfig | null;

  /** LSP server configurations. */
  lspServers: PluginLSPConfig | null;
}

/** A skill discovered from a plugin. */
export interface PluginSkillEntry {
  /** Skill name (folder name or filename without extension). */
  name: string;

  /** Namespaced skill name (plugin-name:skill-name). */
  namespacedName: string;

  /** Description from frontmatter. */
  description: string;

  /** The full markdown content (prompt template). */
  content: string;

  /** Relative path within the plugin. */
  relativePath: string;

  /** Whether model invocation is disabled (from frontmatter). */
  disableModelInvocation?: boolean;
}

/** An agent discovered from a plugin. */
export interface PluginAgentEntry {
  /** Agent name (filename without extension). */
  name: string;

  /** Description from frontmatter. */
  description: string;

  /** The full markdown content. */
  content: string;

  /** Relative path within the plugin. */
  relativePath: string;
}

// =============================================================================
// Marketplace Types
// =============================================================================

/** Marketplace catalog manifest (marketplace.json). */
export interface MarketplaceManifest {
  /** Marketplace identifier (kebab-case). */
  name: string;

  /** Marketplace maintainer. */
  owner: PluginAuthor;

  /** Optional metadata. */
  metadata?: MarketplaceMetadata;

  /** List of available plugins. */
  plugins: MarketplacePluginEntry[];
}

export interface MarketplaceMetadata {
  description?: string;
  version?: string;
  /** Base directory prepended to relative plugin source paths. */
  pluginRoot?: string;
}

/** A plugin entry in a marketplace catalog. */
export interface MarketplacePluginEntry extends Partial<PluginManifest> {
  /** Plugin identifier (required). */
  name: string;

  /** Where to fetch the plugin from. */
  source: string | PluginSource;

  /** Plugin category for organization. */
  category?: string;

  /** Tags for searchability. */
  tags?: string[];

  /**
   * Controls whether plugin.json is the authority for component definitions.
   * - true (default): plugin.json is authority, marketplace supplements.
   * - false: marketplace entry is the entire definition.
   */
  strict?: boolean;
}

/** Plugin source types for fetching from marketplaces. */
export type PluginSource =
  | PluginSourceGitHub
  | PluginSourceURL
  | PluginSourceNPM
  | PluginSourcePIP;

export interface PluginSourceGitHub {
  source: "github";
  repo: string;
  ref?: string;
  sha?: string;
}

export interface PluginSourceURL {
  source: "url";
  url: string;
  ref?: string;
  sha?: string;
}

export interface PluginSourceNPM {
  source: "npm";
  package: string;
  version?: string;
  registry?: string;
}

export interface PluginSourcePIP {
  source: "pip";
  package: string;
  version?: string;
  registry?: string;
}

// =============================================================================
// Marketplace Installation State
// =============================================================================

/** A registered marketplace in the system. */
export interface RegisteredMarketplace {
  /** Unique ID in the database. */
  id: string;

  /** Marketplace name from manifest. */
  name: string;

  /** Source from which the marketplace was added. */
  source: string;

  /** The full catalog manifest. */
  catalog: MarketplaceManifest | null;

  /** Whether auto-update is enabled. */
  autoUpdate: boolean;

  /** Last time the catalog was fetched. */
  lastFetchedAt: string | null;

  /** Last error during fetch. */
  lastError: string | null;

  /** When the marketplace was registered. */
  createdAt: string;
}

// =============================================================================
// Plugin Import Result
// =============================================================================

/** Result of parsing a plugin zip/directory. */
export interface PluginParseResult {
  /** The parsed manifest (from .claude-plugin/plugin.json). */
  manifest: PluginManifest;

  /** All discovered components. */
  components: PluginComponents;

  /** All raw files from the plugin (for storage). */
  files: PluginFileEntry[];

  /** Warnings encountered during parsing. */
  warnings: string[];

  /** Whether the plugin uses the legacy SKILL.md-only format. */
  isLegacySkillFormat: boolean;
}

/** A raw file from a plugin package. */
export interface PluginFileEntry {
  relativePath: string;
  content: Buffer;
  mimeType: string;
  size: number;
  isExecutable: boolean;
}
