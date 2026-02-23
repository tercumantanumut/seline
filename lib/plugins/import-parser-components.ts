/**
 * Plugin Import Parser – Component Discovery
 *
 * Functions for discovering and building plugin components (skills, agents,
 * hooks, MCP servers, LSP servers) from extracted plugin file entries,
 * along with the agent metadata seed helper used during workflow hydration.
 */

import matter from "gray-matter";
import path from "path";
import { pluginHooksConfigSchema } from "./validation";
import type {
  PluginManifest,
  PluginComponents,
  PluginSkillEntry,
  PluginAgentEntry,
  PluginHooksConfig,
  PluginMCPConfig,
  PluginLSPConfig,
  PluginFileEntry,
} from "./types";

// =============================================================================
// Safe frontmatter parser
// =============================================================================

/**
 * Safe frontmatter parser. Real-world Claude Code plugins often have
 * unquoted YAML values containing colons, angle brackets, and literal `\n`
 * which break js-yaml's strict parser. When gray-matter fails, we fall back
 * to a simple regex extractor for common fields.
 */
export function safeMatter(content: string): { data: Record<string, unknown>; content: string } {
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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve component paths from manifest overrides or defaults.
 */
export function resolveComponentPaths(
  manifestValue: string | string[] | undefined,
  defaults: string[]
): string[] {
  if (!manifestValue) return defaults;
  if (typeof manifestValue === "string") return [manifestValue];
  return manifestValue;
}

// =============================================================================
// Component Discovery
// =============================================================================

export async function discoverComponents(
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

export function discoverSkills(files: PluginFileEntry[], manifest: PluginManifest): PluginSkillEntry[] {
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

export function discoverAgents(files: PluginFileEntry[], manifest: PluginManifest): PluginAgentEntry[] {
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

export function isAgentMarkdown(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mds");
}

/**
 * Supports both flat files (agents/reviewer.md) and folder-style layouts
 * (agents/reviewer/AGENT.md, agents/reviewer/Agent.mds).
 */
export function inferAgentName(relativePath: string): string {
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

export function discoverHooks(
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

export function discoverMCPServers(
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

export function discoverLSPServers(
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
