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
import path from "path";
import mime from "mime-types";
import { pluginManifestSchema } from "./validation";
import type {
  PluginManifest,
  PluginParseResult,
  PluginComponents,
  PluginSkillEntry,
  PluginFileEntry,
} from "./types";

// Re-export everything from the components module for backward compatibility
export type { AgentMetadataSeed } from "./import-parser-components";
export {
  buildAgentMetadataSeed,
  safeMatter,
  resolveComponentPaths,
  discoverComponents,
  discoverSkills,
  discoverAgents,
  discoverHooks,
  discoverMCPServers,
  discoverLSPServers,
  isAgentMarkdown,
  inferAgentName,
} from "./import-parser-components";

import {
  safeMatter,
  discoverComponents,
  discoverSkills,
  discoverAgents,
  discoverHooks,
  discoverMCPServers,
  discoverLSPServers,
} from "./import-parser-components";

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

/**
 * Create a JSZip instance from pre-loaded file entries.
 * Attaches the entries as `__preloadedEntries` so extractAllFiles can
 * return them directly without re-decompressing.
 */
function createVirtualZip(entries: PluginFileEntry[]): JSZip {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.relativePath, entry.content);
  }
  (zip as any).__preloadedEntries = entries;
  return zip;
}

export async function parsePluginFromFiles(
  files: UploadedPluginFile[],
  options: ParsePluginPackageOptions = {}
): Promise<PluginParseResult> {
  if (files.length === 0) {
    throw new Error("No files provided for plugin import");
  }

  // Detect nested zip — common pattern: vercel/vercel.zip alongside vercel/vercel/SKILL.md
  const zipFile = files.find((f) => f.relativePath.toLowerCase().endsWith(".zip"));
  if (zipFile) {
    const zipName = path.basename(zipFile.relativePath, path.extname(zipFile.relativePath));
    return parsePluginPackage(zipFile.content, {
      ...options,
      sourceLabel: options.sourceLabel || zipName,
    });
  }

  // Build file entries directly — skip zip encode/decode round-trip
  const entries: PluginFileEntry[] = [];
  for (const file of files) {
    const normalized = normalizeRelativePath(file.relativePath);
    if (!normalized || !isPathSafe(normalized)) continue;
    const ext = path.extname(normalized).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) continue;
    if (file.content.length > MAX_FILE_SIZE) continue;
    entries.push({
      relativePath: normalized,
      content: file.content,
      mimeType: mime.lookup(normalized) || "application/octet-stream",
      size: file.content.length,
      isExecutable: EXECUTABLE_EXTENSIONS.includes(ext),
    });
  }

  const zip = createVirtualZip(entries);
  const resolvedOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const warnings: string[] = [];
  return parsePluginFromZip(zip, warnings, resolvedOptions);
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
  // Fast path: if this zip was created from pre-loaded entries, return them directly
  const preloaded = (zip as any).__preloadedEntries as PluginFileEntry[] | undefined;
  if (preloaded) {
    return preloaded.filter((f) => {
      if (skipPath && f.relativePath === skipPath) return false;
      if (rootPrefix && !f.relativePath.startsWith(rootPrefix)) return false;
      return true;
    }).map((f) => rootPrefix ? { ...f, relativePath: f.relativePath.slice(rootPrefix.length) } : f);
  }

  // Real zip: extract in parallel batches
  const eligibleEntries = (Object.entries(zip.files) as Array<[string, JSZip.JSZipObject]>).filter(
    ([filePath, entry]) => {
      if (entry.dir) return false;
      if (skipPath && filePath === skipPath) return false;
      if (rootPrefix && !filePath.startsWith(rootPrefix)) return false;
      const relativePath = rootPrefix ? filePath.slice(rootPrefix.length) : filePath;
      if (!relativePath || !isPathSafe(relativePath)) return false;
      if (BLOCKED_EXTENSIONS.includes(path.extname(relativePath).toLowerCase())) {
        warnings?.push(`Skipped blocked file type: ${relativePath}`);
        return false;
      }
      return true;
    }
  );

  const BATCH_SIZE = 20;
  const files: PluginFileEntry[] = [];

  for (let i = 0; i < eligibleEntries.length; i += BATCH_SIZE) {
    const batch = eligibleEntries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ([filePath, entry]) => {
        const relativePath = rootPrefix ? filePath.slice(rootPrefix.length) : filePath;
        const content = await entry.async("nodebuffer");
        if (content.length > MAX_FILE_SIZE) {
          warnings?.push(`Skipped oversized file: ${relativePath} (${(content.length / 1024 / 1024).toFixed(1)}MB)`);
          return null;
        }
        const ext = path.extname(relativePath).toLowerCase();
        return {
          relativePath,
          content,
          mimeType: mime.lookup(relativePath) || "application/octet-stream",
          size: content.length,
          isExecutable: EXECUTABLE_EXTENSIONS.includes(ext),
        } as PluginFileEntry;
      })
    );
    files.push(...results.filter((f): f is PluginFileEntry => f !== null));
  }

  return files;
}

/**
 * Core plugin parsing logic operating on a pre-loaded JSZip instance.
 *
 * Detection logic:
 * 1. Look for .claude-plugin/plugin.json → full plugin format
 * 2. Fall back to SKILL.md → legacy skill-only format (wrapped as plugin)
 * 3. Infer manifest-less plugin from directory structure
 */
async function parsePluginFromZip(
  zip: JSZip,
  warnings: string[],
  options: Required<ParsePluginPackageOptions>,
): Promise<PluginParseResult> {
  const pluginJsonEntry = pickFirstZipEntry(
    zip,
    (name) => name === ".claude-plugin/plugin.json" || name.endsWith("/.claude-plugin/plugin.json")
  );

  if (pluginJsonEntry) {
    return parseFullPlugin(zip, pluginJsonEntry, warnings, options);
  }

  // Legacy format is only the root-level SKILL.md package.
  // Nested skills/*/SKILL.md should be treated as manifestless plugin-like content.
  const skillMdEntry = pickFirstZipEntry(zip, (name) => name === "SKILL.md");

  if (skillMdEntry) {
    return parseLegacySkillPlugin(zip, skillMdEntry, warnings);
  }

  const files = await extractAllFiles(zip, "", undefined, warnings);
  const inferred = maybeParseManifestlessPlugin(files, options.sourceLabel, warnings);
  if (inferred) {
    warnings.push("Imported package without .claude-plugin/plugin.json by inferring plugin structure.");
    return inferred;
  }

  throw new Error(
    "Invalid plugin package: no .claude-plugin/plugin.json or SKILL.md found. " +
      "See https://code.claude.com/docs/en/plugins for the expected structure."
  );
}

/**
 * Parse a plugin zip buffer into a PluginParseResult.
 */
export async function parsePluginPackage(
  zipBuffer: Buffer,
  options: ParsePluginPackageOptions = {}
): Promise<PluginParseResult> {
  const resolvedOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const zip = await JSZip.loadAsync(zipBuffer);
  const warnings: string[] = [];
  return parsePluginFromZip(zip, warnings, resolvedOptions);
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
