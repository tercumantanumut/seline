/**
 * Plugin Import Parser
 *
 * Parses plugin zip files and directories into a PluginParseResult.
 * Supports the full Anthropic Claude Code plugin directory structure:
 *
 *   plugin-root/
 *   ├── .claude-plugin/
 *   │   └── plugin.json          ← Manifest
 *   ├── commands/                 ← Skill markdown files
 *   ├── skills/                   ← Agent Skills (SKILL.md)
 *   │   └── code-review/
 *   │       └── SKILL.md
 *   ├── agents/                   ← Subagent definitions
 *   ├── hooks/
 *   │   └── hooks.json
 *   ├── .mcp.json
 *   └── .lsp.json
 *
 * Also supports the legacy SKILL.md-only format for backward compatibility.
 */

import JSZip from "jszip";
import matter from "gray-matter";
import path from "path";
import mime from "mime-types";
import { pluginManifestSchema, pluginHooksConfigSchema } from "./validation";
import type {
  PluginManifest,
  PluginParseResult,
  PluginComponents,
  PluginSkillEntry,
  PluginAgentEntry,
  PluginHooksConfig,
  PluginMCPConfig,
  PluginLSPConfig,
  PluginFileEntry,
} from "./types";

const EXECUTABLE_EXTENSIONS = [".py", ".js", ".sh", ".bash", ".zsh", ".ts"];
const BLOCKED_EXTENSIONS = [".exe", ".dll", ".so", ".dylib", ".app", ".bat", ".cmd"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

export interface ParsePluginPackageOptions {
  /**
   * When true (default), fills missing required manifest fields with safe defaults
   * and emits warnings instead of hard-failing imports.
   */
  normalizeManifest?: boolean;
  /** Optional source label for diagnostics and fallback name generation. */
  sourceLabel?: string;
}

export interface UploadedPluginFile {
  relativePath: string;
  content: Buffer;
}

const DEFAULT_PARSE_OPTIONS: Required<ParsePluginPackageOptions> = {
  normalizeManifest: true,
  sourceLabel: "uploaded-plugin",
};

function sanitizePluginName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "imported-plugin";
}

function normalizeRelativePath(inputPath: string): string {
  return inputPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "");
}

function isPathSafe(relativePath: string): boolean {
  return !relativePath.includes("../") && !relativePath.startsWith("/");
}

function createSyntheticManifest(nameHint: string, descriptionHint?: string): PluginManifest {
  const safeName = sanitizePluginName(nameHint);
  return {
    name: safeName,
    description: descriptionHint || `${safeName} plugin package`,
    version: "1.0.0",
  };
}

function pickFirstZipEntry(zip: JSZip, predicate: (name: string) => boolean): JSZip.JSZipObject | undefined {
  const candidates = (Object.values(zip.files) as JSZip.JSZipObject[])
    .filter((f) => !f.dir && predicate(f.name))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length);
  return candidates[0];
}

function normalizeManifest(
  manifestJson: unknown,
  warnings: string[],
  options: Required<ParsePluginPackageOptions>
): unknown {
  if (!options.normalizeManifest || typeof manifestJson !== "object" || manifestJson === null) {
    return manifestJson;
  }

  const manifest = { ...(manifestJson as Record<string, unknown>) };

  const currentName = typeof manifest.name === "string" ? manifest.name : undefined;
  if (!currentName || !currentName.trim()) {
    manifest.name = sanitizePluginName(options.sourceLabel);
    warnings.push("Manifest missing 'name'; defaulted from package source.");
  } else {
    const safeName = sanitizePluginName(currentName);
    if (safeName !== currentName) {
      manifest.name = safeName;
      warnings.push(`Manifest name normalized to kebab-case: ${safeName}`);
    }
  }

  if (typeof manifest.description !== "string" || !manifest.description.trim()) {
    manifest.description = `${String(manifest.name)} plugin package`;
    warnings.push("Manifest missing 'description'; generated a default description.");
  }

  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    manifest.version = "1.0.0";
    warnings.push("Manifest missing 'version'; defaulted to 1.0.0.");
  }

  return manifest;
}

async function buildZipFromUploadedFiles(files: UploadedPluginFile[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of files) {
    const normalized = normalizeRelativePath(file.relativePath);
    if (!normalized || !isPathSafe(normalized)) {
      continue;
    }
    zip.file(normalized, file.content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function parsePluginFromFiles(
  files: UploadedPluginFile[],
  options: ParsePluginPackageOptions = {}
): Promise<PluginParseResult> {
  if (files.length === 0) {
    throw new Error("No files provided for plugin import");
  }

  const zipBuffer = await buildZipFromUploadedFiles(files);
  return parsePluginPackage(zipBuffer, options);
}

export async function parsePluginFromMarkdown(
  markdownBuffer: Buffer,
  filename: string,
  options: ParsePluginPackageOptions = {}
): Promise<PluginParseResult> {
  const zip = new JSZip();
  zip.file("SKILL.md", markdownBuffer);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return parsePluginPackage(zipBuffer, {
    ...options,
    sourceLabel: filename.replace(/\.(md|mds)$/i, ""),
  });
}

function inferManifestlessRootPrefix(files: PluginFileEntry[]): string {
  const candidates = new Map<string, number>();

  for (const file of files) {
    const normalized = file.relativePath.replace(/\\/g, "/");
    const lower = normalized.toLowerCase();

    const componentMatch = lower.match(/^(.*?)(commands|skills|agents|hooks)\//);
    if (componentMatch) {
      const prefix = normalized.slice(0, componentMatch[1].length);
      candidates.set(prefix, (candidates.get(prefix) || 0) + 1);
    }

    const rootConfigMatch = lower.match(/^(.*?)(\.mcp\.json|\.lsp\.json)$/);
    if (rootConfigMatch) {
      const prefix = normalized.slice(0, rootConfigMatch[1].length);
      candidates.set(prefix, (candidates.get(prefix) || 0) + 1);
    }
  }

  if (candidates.size === 0) {
    return "";
  }

  const sorted = Array.from(candidates.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].length - b[0].length;
  });

  return sorted[0][0];
}

function maybeParseManifestlessPlugin(
  files: PluginFileEntry[],
  sourceLabel: string,
  warnings: string[]
): PluginParseResult | null {
  const inferredRootPrefix = inferManifestlessRootPrefix(files);
  const normalizedFiles = files.map((file) => {
    if (!inferredRootPrefix || !file.relativePath.startsWith(inferredRootPrefix)) {
      return file;
    }

    return {
      ...file,
      relativePath: file.relativePath.slice(inferredRootPrefix.length),
    };
  });

  const hasPluginLikeContent = normalizedFiles.some((file) => {
    const lower = file.relativePath.toLowerCase();

    if (lower === ".mcp.json" || lower === ".lsp.json" || lower === "hooks/hooks.json") {
      return true;
    }

    if (!lower.endsWith(".md") && !lower.endsWith(".mds")) return false;
    return lower.startsWith("commands/") || lower.startsWith("skills/") || lower.startsWith("agents/");
  });

  if (!hasPluginLikeContent) {
    return null;
  }

  const manifest = createSyntheticManifest(sourceLabel);
  const components = {
    skills: discoverSkills(normalizedFiles, manifest),
    agents: discoverAgents(normalizedFiles, manifest),
    hooks: discoverHooks(normalizedFiles, manifest, warnings),
    mcpServers: discoverMCPServers(normalizedFiles, manifest, warnings),
    lspServers: discoverLSPServers(normalizedFiles, manifest, warnings),
  };

  if (inferredRootPrefix) {
    warnings.push(`Detected nested plugin root prefix: ${inferredRootPrefix.replace(/\/$/, "")}`);
  }
  warnings.push("No manifest found; created a synthetic manifest for compatibility.");

  return {
    manifest,
    components,
    files: normalizedFiles,
    warnings,
    isLegacySkillFormat: false,
  };
}

async function extractAllFiles(
  zip: JSZip,
  rootPrefix: string,
  skipPath?: string,
  warnings?: string[]
): Promise<PluginFileEntry[]> {
  const files: PluginFileEntry[] = [];
  for (const [filePath, entry] of Object.entries(zip.files) as Array<[string, JSZip.JSZipObject]>) {
    if (entry.dir) continue;
    if (skipPath && filePath === skipPath) continue;
    if (rootPrefix && !filePath.startsWith(rootPrefix)) continue;

    const relativePath = rootPrefix ? filePath.slice(rootPrefix.length) : filePath;
    if (!relativePath || !isPathSafe(relativePath)) continue;

    const ext = path.extname(relativePath).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      warnings?.push(`Skipped blocked file type: ${relativePath}`);
      continue;
    }

    const content = await entry.async("nodebuffer");
    if (content.length > MAX_FILE_SIZE) {
      warnings?.push(`Skipped oversized file: ${relativePath} (${(content.length / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }

    files.push({
      relativePath,
      content,
      mimeType: mime.lookup(relativePath) || "application/octet-stream",
      size: content.length,
      isExecutable: EXECUTABLE_EXTENSIONS.includes(ext),
    });
  }

  return files;
}

function isLikelyValidationError(message: string): boolean {
  return message.startsWith("Invalid plugin") || message.includes("SKILL.md");
}

/**
 * Safe frontmatter parser. Real-world Claude Code plugins often have
 * unquoted YAML values containing colons, angle brackets, and literal `\n`
 * which break js-yaml's strict parser. When gray-matter fails, we fall back
 * to a simple regex extractor for common fields.
 */
function safeMatter(content: string): { data: Record<string, unknown>; content: string } {
  try {
    const result = matter(content);
    return { data: result.data, content: result.content };
  } catch {
    // Manual extraction when YAML parsing fails
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      return { data: {}, content };
    }

    const fmBlock = fmMatch[1];
    const body = content.slice(fmMatch[0].length).trim();
    const data: Record<string, unknown> = {};

    // Extract simple key: value pairs (first value on the line)
    for (const line of fmBlock.split("\n")) {
      const match = line.match(/^(\w[\w-]*)\s*:\s*"?(.*?)"?\s*$/);
      if (match) {
        const [, key, value] = match;
        // Handle arrays like ["foo", "bar"]
        if (value.startsWith("[") && value.endsWith("]")) {
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value;
          }
        } else if (value === "true") {
          data[key] = true;
        } else if (value === "false") {
          data[key] = false;
        } else {
          data[key] = value;
        }
      }
    }

    return { data, content: body };
  }
}

/**
 * Parse a plugin zip buffer into a PluginParseResult.
 *
 * Detection logic:
 * 1. Look for .claude-plugin/plugin.json → full plugin format
 * 2. Fall back to SKILL.md → legacy skill-only format (wrapped as plugin)
 */
export async function parsePluginPackage(
  zipBuffer: Buffer,
  options: ParsePluginPackageOptions = {}
): Promise<PluginParseResult> {
  const resolvedOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const zip = await JSZip.loadAsync(zipBuffer);
  const warnings: string[] = [];

  const pluginJsonEntry = pickFirstZipEntry(
    zip,
    (name) => name === ".claude-plugin/plugin.json" || name.endsWith("/.claude-plugin/plugin.json")
  );

  if (pluginJsonEntry) {
    return parseFullPlugin(zip, pluginJsonEntry, warnings, resolvedOptions);
  }

  // Legacy format is only the root-level SKILL.md package.
  // Nested skills/*/SKILL.md should be treated as full plugin-like content.
  const skillMdEntry = pickFirstZipEntry(zip, (name) => name === "SKILL.md" || name.endsWith("/SKILL.md"));

  if (skillMdEntry) {
    return parseLegacySkillPlugin(zip, skillMdEntry, warnings);
  }

  const files = await extractAllFiles(zip, "", undefined, warnings);
  const inferred = maybeParseManifestlessPlugin(files, resolvedOptions.sourceLabel, warnings);
  if (inferred) {
    warnings.push("Imported package without .claude-plugin/plugin.json by inferring plugin structure.");
    return inferred;
  }

  throw new Error(
    "Invalid plugin package: no .claude-plugin/plugin.json or SKILL.md found. " +
      "See https://code.claude.com/docs/en/plugins for the expected structure."
  );
}

// =============================================================================
// Full Plugin Parser
// =============================================================================

async function parseFullPlugin(
  zip: JSZip,
  pluginJsonEntry: JSZip.JSZipObject,
  warnings: string[],
  options: Required<ParsePluginPackageOptions>
): Promise<PluginParseResult> {
  // Determine plugin root directory
  const pluginJsonPath = pluginJsonEntry.name;
  const claudePluginDir = pluginJsonPath.replace("/plugin.json", "");
  // Handle root-level .claude-plugin (no parent dir) vs nested
  const pluginRoot = claudePluginDir === ".claude-plugin"
    ? ""
    : claudePluginDir.replace("/.claude-plugin", "");
  const rootPrefix = pluginRoot ? pluginRoot + "/" : "";

  // Parse and validate plugin.json
  const manifestRaw = await pluginJsonEntry.async("string");
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestRaw);
  } catch {
    throw new Error("Invalid JSON in .claude-plugin/plugin.json");
  }

  const normalizedManifest = normalizeManifest(manifestJson, warnings, options);
  const manifestResult = pluginManifestSchema.safeParse(normalizedManifest);
  if (!manifestResult.success) {
    const issues = manifestResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid plugin.json manifest: ${issues}`);
  }
  const manifest = manifestResult.data as PluginManifest;

  // Extract all files
  const files = (await extractAllFiles(zip, rootPrefix, pluginJsonPath, warnings)).filter(
    (file) => !file.relativePath.startsWith(".claude-plugin/")
  );

  // Discover components
  const components = await discoverComponents(files, manifest, warnings);

  return {
    manifest,
    components,
    files,
    warnings,
    isLegacySkillFormat: false,
  };
}

// =============================================================================
// Legacy SKILL.md Parser (backward compatible)
// =============================================================================

async function parseLegacySkillPlugin(
  zip: JSZip,
  skillMdEntry: JSZip.JSZipObject,
  warnings: string[]
): Promise<PluginParseResult> {
  const skillMdContent = await skillMdEntry.async("string");
  const { data: frontmatter, content: body } = safeMatter(skillMdContent);

  const name = (frontmatter.name as string) || "imported-skill";
  const description = (frontmatter.description as string) || "Imported skill";

  // Determine skill root
  const skillRoot =
    skillMdEntry.name === "SKILL.md"
      ? ""
      : skillMdEntry.name.slice(0, skillMdEntry.name.lastIndexOf("/"));
  const rootPrefix = skillRoot ? skillRoot + "/" : "";

  // Build a synthetic manifest
  const manifest: PluginManifest = {
    name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"),
    description,
    version: "1.0.0",
    license: frontmatter.license as string | undefined,
  };

  // Extract all files
  const files = await extractAllFiles(zip, rootPrefix, skillMdEntry.name);

  // Build skill entry from SKILL.md
  const skillEntry: PluginSkillEntry = {
    name,
    namespacedName: `${manifest.name}:${name}`,
    description,
    content: body.trim(),
    relativePath: "SKILL.md",
    disableModelInvocation: frontmatter["disable-model-invocation"] === true,
  };

  const components: PluginComponents = {
    skills: [skillEntry],
    agents: [],
    hooks: null,
    mcpServers: null,
    lspServers: null,
  };

  warnings.push("Parsed as legacy SKILL.md format. Consider migrating to full plugin structure.");

  return {
    manifest,
    components,
    files,
    warnings,
    isLegacySkillFormat: true,
  };
}

// =============================================================================
// Component Discovery
// =============================================================================

async function discoverComponents(
  files: PluginFileEntry[],
  manifest: PluginManifest,
  warnings: string[]
): Promise<PluginComponents> {
  const skills = discoverSkills(files, manifest);
  const agents = discoverAgents(files, manifest);
  const hooks = discoverHooks(files, manifest, warnings);
  const mcpServers = discoverMCPServers(files, manifest, warnings);
  const lspServers = discoverLSPServers(files, manifest, warnings);

  return { skills, agents, hooks, mcpServers, lspServers };
}

function discoverSkills(files: PluginFileEntry[], manifest: PluginManifest): PluginSkillEntry[] {
  const skills: PluginSkillEntry[] = [];

  // Collect skill files from commands/ and skills/ directories
  // manifest.skills can override skill directory paths (e.g., everything-claude-code uses skills: ["./skills/", "./commands/"])
  const commandPaths = resolveComponentPaths(manifest.commands, ["commands/"])
    .map((p) => p.replace(/^\.\//, ""));
  const skillDirPaths = resolveComponentPaths(manifest.skills, ["skills/"])
    .map((p) => p.replace(/^\.\//, ""));

  // commands/*.md → namespaced slash commands
  for (const file of files) {
    const matchesCommand = commandPaths.some((p) => file.relativePath.startsWith(p));
    if (matchesCommand && file.relativePath.endsWith(".md")) {
      const content = file.content.toString("utf-8");
      const { data: fm, content: body } = safeMatter(content);
      const name = path.basename(file.relativePath, ".md");

      skills.push({
        name,
        namespacedName: `${manifest.name}:${name}`,
        description: (fm.description as string) || "",
        content: body.trim(),
        relativePath: file.relativePath,
        disableModelInvocation: fm["disable-model-invocation"] === true,
      });
    }
  }

  // skills/ directory: both skills/*/SKILL.md and skills/*.md patterns
  for (const file of files) {
    const matchesSkillDir = skillDirPaths.some(
      (p) => file.relativePath.startsWith(p) || file.relativePath === p
    );
    if (!matchesSkillDir || !file.relativePath.endsWith(".md")) continue;

    const content = file.content.toString("utf-8");
    const { data: fm, content: body } = safeMatter(content);

    if (file.relativePath.endsWith("/SKILL.md")) {
      // skills/foo/SKILL.md → name is the parent directory
      const parts = file.relativePath.split("/");
      const name = parts[parts.length - 2] || "unnamed";

      skills.push({
        name,
        namespacedName: `${manifest.name}:${name}`,
        description: (fm.description as string) || (fm.name as string) || "",
        content: body.trim(),
        relativePath: file.relativePath,
        disableModelInvocation: fm["disable-model-invocation"] === true,
      });
    } else {
      // skills/foo.md → name is filename without extension
      const name = path.basename(file.relativePath, ".md");

      skills.push({
        name,
        namespacedName: `${manifest.name}:${name}`,
        description: (fm.description as string) || "",
        content: body.trim(),
        relativePath: file.relativePath,
        disableModelInvocation: fm["disable-model-invocation"] === true,
      });
    }
  }

  // Deduplicate by relativePath (skills and commands dirs may overlap)
  const seen = new Set<string>();
  return skills.filter((s) => {
    if (seen.has(s.relativePath)) return false;
    seen.add(s.relativePath);
    return true;
  });
}

function discoverAgents(files: PluginFileEntry[], manifest: PluginManifest): PluginAgentEntry[] {
  const agents: PluginAgentEntry[] = [];
  const agentPaths = resolveComponentPaths(manifest.agents, ["agents/"])
    .map((p) => p.replace(/^\.\//, ""));

  for (const file of files) {
    // Match both directory prefixes (e.g., "agents/") and exact file paths.
    const matchesAgent = agentPaths.some(
      (p) => file.relativePath.startsWith(p) || file.relativePath === p
    );
    if (!matchesAgent || !isAgentMarkdown(file.relativePath)) continue;

    const content = file.content.toString("utf-8");
    const { data: fm, content: body } = safeMatter(content);
    const name = inferAgentName(file.relativePath);

    agents.push({
      name,
      description: (fm.description as string) || "",
      content: body.trim(),
      relativePath: file.relativePath,
    });
  }

  return agents;
}

function isAgentMarkdown(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mds");
}

/**
 * Supports both flat files (agents/reviewer.md) and folder-style layouts
 * (agents/reviewer/AGENT.md, agents/reviewer/Agent.mds).
 */
function inferAgentName(relativePath: string): string {
  const base = path.basename(relativePath);
  const lowerBase = base.toLowerCase();

  if (lowerBase === "agent.md" || lowerBase === "agent.mds") {
    const parts = relativePath.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : "agent";
  }

  if (lowerBase.endsWith(".mds")) {
    return base.slice(0, -4);
  }

  return path.basename(relativePath, ".md");
}

function discoverHooks(
  files: PluginFileEntry[],
  manifest: PluginManifest,
  warnings: string[]
): PluginHooksConfig | null {
  // Check manifest inline hooks first
  if (manifest.hooks && typeof manifest.hooks !== "string") {
    return manifest.hooks;
  }

  // Check for hooks.json file
  const hooksPath = typeof manifest.hooks === "string" ? manifest.hooks : "hooks/hooks.json";
  const hooksFile = files.find((f) => f.relativePath === hooksPath);

  if (!hooksFile) return null;

  try {
    const raw = JSON.parse(hooksFile.content.toString("utf-8"));
    const result = pluginHooksConfigSchema.safeParse(raw);
    if (!result.success) {
      warnings.push(`Invalid hooks.json: ${result.error.issues.map((i) => i.message).join("; ")}`);
      return null;
    }
    return result.data as PluginHooksConfig;
  } catch (e) {
    warnings.push(`Failed to parse hooks.json: ${e instanceof Error ? e.message : "unknown error"}`);
    return null;
  }
}

function discoverMCPServers(
  files: PluginFileEntry[],
  manifest: PluginManifest,
  warnings: string[]
): PluginMCPConfig | null {
  // Check manifest inline MCP config
  if (manifest.mcpServers && typeof manifest.mcpServers !== "string") {
    return manifest.mcpServers;
  }

  // Check for .mcp.json file
  const mcpPath = typeof manifest.mcpServers === "string" ? manifest.mcpServers : ".mcp.json";
  const mcpFile = files.find((f) => f.relativePath === mcpPath);

  if (!mcpFile) return null;

  try {
    const raw = JSON.parse(mcpFile.content.toString("utf-8"));
    // MCP config is a Record<string, MCPServerEntry>
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      warnings.push("Invalid .mcp.json: expected an object of server configurations");
      return null;
    }
    return raw as PluginMCPConfig;
  } catch (e) {
    warnings.push(`Failed to parse .mcp.json: ${e instanceof Error ? e.message : "unknown error"}`);
    return null;
  }
}

function discoverLSPServers(
  files: PluginFileEntry[],
  manifest: PluginManifest,
  warnings: string[]
): PluginLSPConfig | null {
  // Check manifest inline LSP config
  if (manifest.lspServers && typeof manifest.lspServers !== "string") {
    return manifest.lspServers;
  }

  // Check for .lsp.json file
  const lspPath = typeof manifest.lspServers === "string" ? manifest.lspServers : ".lsp.json";
  const lspFile = files.find((f) => f.relativePath === lspPath);

  if (!lspFile) return null;

  try {
    const raw = JSON.parse(lspFile.content.toString("utf-8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      warnings.push("Invalid .lsp.json: expected an object of server configurations");
      return null;
    }
    return raw as PluginLSPConfig;
  } catch (e) {
    warnings.push(`Failed to parse .lsp.json: ${e instanceof Error ? e.message : "unknown error"}`);
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve component paths from manifest overrides or defaults.
 */
function resolveComponentPaths(
  manifestValue: string | string[] | undefined,
  defaults: string[]
): string[] {
  if (!manifestValue) return defaults;
  if (typeof manifestValue === "string") return [manifestValue];
  return manifestValue;
}

// =============================================================================
// Agent Metadata Seed Hydration
// =============================================================================

const MAX_PROMPT_SEED_LENGTH = 8000;
const MAX_PURPOSE_LENGTH = 400;

export interface AgentMetadataSeed {
  sourcePath: string;
  description?: string;
  purpose?: string;
  systemPromptSeed?: string;
  tags?: string[];
}

/**
 * Extracts structured metadata seed from a plugin agent entry for workflow hydration.
 * The seed is stored on the workflow member and used to enrich agent metadata at creation.
 */
export function buildAgentMetadataSeed(agent: PluginAgentEntry): AgentMetadataSeed {
  const promptSeed = agent.content.trim().slice(0, MAX_PROMPT_SEED_LENGTH) || undefined;
  const purpose =
    agent.description ||
    agent.content.split("\n\n")[0]?.replace(/^#+\s*/, "").trim().slice(0, MAX_PURPOSE_LENGTH) ||
    undefined;

  return {
    sourcePath: agent.relativePath,
    description: agent.description || undefined,
    purpose,
    systemPromptSeed: promptSeed,
  };
}
