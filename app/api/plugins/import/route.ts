import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  parsePluginFromFiles,
  parsePluginFromMarkdown,
  parsePluginPackage,
} from "@/lib/plugins/import-parser";
import { createCharacter, getCharacter, getUserCharacters } from "@/lib/characters/queries";
import { enablePluginForAgent, installPlugin } from "@/lib/plugins/registry";
import { buildAgentMetadataSeed } from "@/lib/plugins/import-parser";
import {
  createWorkflowFromPluginImport,
  syncSharedFoldersToSubAgents,
} from "@/lib/agents/workflows";
import type { InstalledPlugin, PluginAgentEntry, PluginParseResult, PluginScope } from "@/lib/plugins/types";
import { mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getUserWorkspacePath } from "@/lib/workspace/setup";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUTO_AGENT_COUNT = 25;
const MAX_AUTO_AGENT_NAME_LENGTH = 100;
const MAX_AUTO_AGENT_TAGLINE_LENGTH = 200;

interface InheritedAgentConfig {
  enabledTools?: string[];
  enabledPlugins?: string[];
  enabledMcpServers?: string[];
  enabledMcpTools?: string[];
  mcpToolPreferences?: Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>;
  workflowSandboxPolicy?: {
    allowSharedFolders?: boolean;
    allowSharedMcp?: boolean;
    allowSharedHooks?: boolean;
  };
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === "string");
  return result.length > 0 ? result : undefined;
}

function buildInheritedConfig(raw: unknown): InheritedAgentConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const metadata = raw as Record<string, unknown>;

  const config: InheritedAgentConfig = {
    enabledTools: toStringArray(metadata.enabledTools),
    enabledPlugins: toStringArray(metadata.enabledPlugins),
    enabledMcpServers: toStringArray(metadata.enabledMcpServers),
    enabledMcpTools: toStringArray(metadata.enabledMcpTools),
  };

  if (
    metadata.mcpToolPreferences &&
    typeof metadata.mcpToolPreferences === "object" &&
    !Array.isArray(metadata.mcpToolPreferences)
  ) {
    config.mcpToolPreferences = metadata.mcpToolPreferences as InheritedAgentConfig["mcpToolPreferences"];
  }

  if (
    metadata.workflowSandboxPolicy &&
    typeof metadata.workflowSandboxPolicy === "object" &&
    !Array.isArray(metadata.workflowSandboxPolicy)
  ) {
    config.workflowSandboxPolicy =
      metadata.workflowSandboxPolicy as InheritedAgentConfig["workflowSandboxPolicy"];
  }

  return config;
}

function normalizeAgentName(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (!collapsed) return "Plugin Agent";
  return collapsed.length > MAX_AUTO_AGENT_NAME_LENGTH
    ? collapsed.slice(0, MAX_AUTO_AGENT_NAME_LENGTH)
    : collapsed;
}

function normalizeTagline(input: string): string | undefined {
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (!collapsed) return undefined;
  return collapsed.length > MAX_AUTO_AGENT_TAGLINE_LENGTH
    ? collapsed.slice(0, MAX_AUTO_AGENT_TAGLINE_LENGTH)
    : collapsed;
}

function ensureUniqueAgentName(base: string, usedNames: Set<string>): string {
  const normalizedBase = normalizeAgentName(base);
  if (!usedNames.has(normalizedBase.toLowerCase())) {
    usedNames.add(normalizedBase.toLowerCase());
    return normalizedBase;
  }

  for (let index = 2; index <= 9999; index += 1) {
    const suffix = ` ${index}`;
    const maxBaseLength = MAX_AUTO_AGENT_NAME_LENGTH - suffix.length;
    const candidateBase = normalizedBase.slice(0, Math.max(1, maxBaseLength));
    const candidate = `${candidateBase}${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
  }

  const fallback = `${normalizedBase.slice(0, MAX_AUTO_AGENT_NAME_LENGTH - 5)} 9999`;
  usedNames.add(fallback.toLowerCase());
  return fallback;
}

async function createAgentsFromPlugin(input: {
  userId: string;
  pluginId: string;
  pluginName: string;
  pluginAgents: PluginAgentEntry[];
  warnings: string[];
  inheritedConfig?: InheritedAgentConfig;
}): Promise<Array<{ id: string; name: string; sourcePath: string }>> {
  const { userId, pluginId, pluginName, pluginAgents, warnings, inheritedConfig } = input;

  const existingCharacters = await getUserCharacters(userId);
  const usedNames = new Set<string>(
    existingCharacters.map((character: { name: string }) => character.name.toLowerCase())
  );

  const created: Array<{ id: string; name: string; sourcePath: string }> = [];
  const maxCount = Math.min(pluginAgents.length, MAX_AUTO_AGENT_COUNT);

  if (pluginAgents.length > MAX_AUTO_AGENT_COUNT) {
    warnings.push(
      `Plugin defines ${pluginAgents.length} agents; auto-created first ${MAX_AUTO_AGENT_COUNT} to avoid accidental mass provisioning.`
    );
  }

  for (const agent of pluginAgents.slice(0, maxCount)) {
    const seed = buildAgentMetadataSeed(agent);
    const resolvedName = ensureUniqueAgentName(agent.name || `${pluginName} agent`, usedNames);
    const resolvedTagline = normalizeTagline(agent.description || "");

    const character = await createCharacter({
      userId,
      name: resolvedName,
      displayName: resolvedName,
      tagline: resolvedTagline,
      status: "active",
      metadata: {
        purpose: seed.purpose || `Imported from plugin ${pluginName}`,
        enabledPlugins: Array.from(
          new Set([...(inheritedConfig?.enabledPlugins || []), pluginId])
        ),
        ...(inheritedConfig?.enabledTools ? { enabledTools: inheritedConfig.enabledTools } : {}),
        ...(inheritedConfig?.enabledMcpServers
          ? { enabledMcpServers: inheritedConfig.enabledMcpServers }
          : {}),
        ...(inheritedConfig?.enabledMcpTools
          ? { enabledMcpTools: inheritedConfig.enabledMcpTools }
          : {}),
        ...(inheritedConfig?.mcpToolPreferences
          ? { mcpToolPreferences: inheritedConfig.mcpToolPreferences }
          : {}),
        ...(inheritedConfig?.workflowSandboxPolicy
          ? { workflowSandboxPolicy: inheritedConfig.workflowSandboxPolicy }
          : {}),
        pluginAgentSeed: {
          sourcePath: seed.sourcePath,
          description: seed.description,
          purpose: seed.purpose,
          systemPromptSeed: seed.systemPromptSeed,
        },
      },
    });

    await enablePluginForAgent(character.id, pluginId);

    created.push({
      id: character.id,
      name: resolvedName,
      sourcePath: agent.relativePath,
    });
  }

  return created;
}

// =============================================================================
// Plugin Auxiliary File Workspace Materialization
// =============================================================================

interface WorkspaceLinkResult {
  linkedPath: string | null;
  auxiliaryFileCount: number;
  workspaceRegistered: boolean;
}

/**
 * Copy plugin auxiliary files (references, scripts, etc.) to the local workspace.
 *
 * Note: We intentionally do NOT register plugin workspace directories as sync folders.
 * Auxiliary files remain available on disk, but plugin import does not mutate the
 * agent's sync-folder configuration.
 */
async function linkPluginAuxiliaryFilesToWorkspace(
  plugin: InstalledPlugin,
  parsed: PluginParseResult,
): Promise<WorkspaceLinkResult> {
  if (!plugin.cachePath) {
    return { linkedPath: null, auxiliaryFileCount: 0, workspaceRegistered: false };
  }

  // Build set of relative paths that are already handled as skills/agents in the DB
  const handledPaths = new Set<string>([
    ...parsed.components.skills.map((s) => s.relativePath),
    ...parsed.components.agents.map((a) => a.relativePath),
  ]);

  // Auxiliary = files not captured as skills/agents and not backup artifacts
  const auxFiles = parsed.files.filter(
    (f) => !handledPaths.has(f.relativePath) && !f.relativePath.endsWith(".backup"),
  );

  if (auxFiles.length === 0) {
    return { linkedPath: null, auxiliaryFileCount: 0, workspaceRegistered: false };
  }

  // Destination: ~/.seline/workspace/plugins/{plugin-name}/
  // plugin.name is already kebab-case from the manifest (enforced by sanitizePluginName)
  const workspaceBase = getUserWorkspacePath();
  const pluginWorkspaceDir = path.join(workspaceBase, "plugins", plugin.name);

  // Copy auxiliary files in parallel, preserving subdirectory structure
  const dirsNeeded = new Set<string>();
  dirsNeeded.add(pluginWorkspaceDir);
  const validAuxFiles = auxFiles.filter((auxFile) => {
    const dest = path.join(pluginWorkspaceDir, auxFile.relativePath);
    if (!path.resolve(dest).startsWith(path.resolve(pluginWorkspaceDir))) return false;
    const src = path.join(plugin.cachePath!, auxFile.relativePath);
    if (!existsSync(src)) return false;
    dirsNeeded.add(path.dirname(dest));
    return true;
  });

  await Promise.all([...dirsNeeded].map((dir) => mkdir(dir, { recursive: true })));
  await Promise.all(
    validAuxFiles.map((auxFile) => {
      const src = path.join(plugin.cachePath!, auxFile.relativePath);
      const dest = path.join(pluginWorkspaceDir, auxFile.relativePath);
      return copyFile(src, dest);
    })
  );

  // Do not auto-register plugin workspace directories as sync folders.
  // This prevents plugin imports from polluting agent sync-folder lists and
  // avoids unintentionally sharing those folders to workflow subagents.

  return {
    linkedPath: pluginWorkspaceDir,
    auxiliaryFileCount: auxFiles.length,
    workspaceRegistered: false,
  };
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const formData = await request.formData();
    const singleFile = formData.get("file") as File | null;
    const multipleFiles = formData.getAll("files").filter((f): f is File => f instanceof File);
    const characterId = formData.get("characterId") as string | null;
    const scope = (formData.get("scope") as PluginScope | null) || "user";
    const marketplaceName = formData.get("marketplaceName") as string | null;

    const uploadFiles = multipleFiles.length > 0 ? multipleFiles : singleFile ? [singleFile] : [];

    if (uploadFiles.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSizePerFile = 50 * 1024 * 1024;
    const totalSize = uploadFiles.reduce((sum, file) => sum + file.size, 0);
    if (uploadFiles.some((file) => file.size > maxSizePerFile)) {
      return NextResponse.json(
        { error: "One or more files exceed the 50MB per-file limit" },
        { status: 400 }
      );
    }
    if (totalSize > 150 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Total upload size exceeds 150MB limit" },
        { status: 400 }
      );
    }

    let parsed: PluginParseResult;

    if (uploadFiles.length === 1) {
      const file = uploadFiles[0];
      const lowerName = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (lowerName.endsWith(".zip")) {
        parsed = await parsePluginPackage(buffer, { sourceLabel: file.name.replace(/\.zip$/i, "") });
      } else if (lowerName.endsWith(".md") || lowerName.endsWith(".mds")) {
        parsed = await parsePluginFromMarkdown(buffer, file.name);
      } else {
        return NextResponse.json(
          { error: "Single-file imports must be .zip or .md. For folder imports, upload multiple files." },
          { status: 400 }
        );
      }
    } else {
      const uploaded = await Promise.all(
        uploadFiles.map(async (file) => ({
          relativePath: file.name,
          content: Buffer.from(await file.arrayBuffer()),
        }))
      );

      const topLevel = uploaded
        .map((f) => f.relativePath.split("/")[0])
        .filter(Boolean);
      const sourceLabel = topLevel.length > 0 ? topLevel[0] : "folder-import";

      parsed = await parsePluginFromFiles(uploaded, { sourceLabel });
    }

    console.log(
      `[PluginImport:${requestId}] Parsed plugin: ${parsed.manifest.name} v${parsed.manifest.version} ` +
      `(${parsed.components.skills.length} skills, ${parsed.components.agents.length} agents, ` +
      `hooks: ${parsed.components.hooks !== null}, mcp: ${parsed.components.mcpServers !== null})`
    );

    let initiatorMetadata: Record<string, unknown> | null = null;
    if (characterId) {
      const initiator = await getCharacter(characterId);
      if (!initiator || initiator.userId !== dbUser.id) {
        return NextResponse.json({ error: "Selected initiator agent was not found" }, { status: 400 });
      }
      initiatorMetadata = (initiator.metadata as Record<string, unknown> | null) ?? null;
    }

    if (parsed.components.agents.length > 0 && !characterId) {
      return NextResponse.json(
        {
          error:
            "This plugin defines agents. Select an existing main agent before installing so sub-agents can be assigned to a workflow.",
        },
        { status: 400 }
      );
    }

    const plugin = await installPlugin({
      userId: dbUser.id,
      characterId: characterId || undefined,
      parsed,
      scope,
      marketplaceName: marketplaceName || undefined,
    });

    // Link auxiliary files (references, scripts, etc.) to the agent's workspace
    const workspaceLink: WorkspaceLinkResult = characterId
      ? await linkPluginAuxiliaryFilesToWorkspace(plugin, parsed).catch(
          (err) => {
            console.warn(
              `[PluginImport:${requestId}] Failed to link auxiliary files (non-fatal):`,
              err,
            );
            return { linkedPath: null, auxiliaryFileCount: 0, workspaceRegistered: false };
          },
        )
      : { linkedPath: null, auxiliaryFileCount: 0, workspaceRegistered: false };

    const inheritedConfig = buildInheritedConfig(initiatorMetadata);

    const createdAgents =
      parsed.components.agents.length > 0
        ? await createAgentsFromPlugin({
            userId: dbUser.id,
            pluginId: plugin.id,
            pluginName: parsed.manifest.name,
            pluginAgents: parsed.components.agents,
            warnings: parsed.warnings,
            inheritedConfig,
          })
        : [];

    // Create workflow when we have created agents (with or without characterId)
    let workflow: { id: string; initiatorId: string; subAgentIds: string[] } | null = null;

    if (createdAgents.length > 0) {
      try {
        // Determine initiator and sub-agents
        const initiatorId = characterId || createdAgents[0].id;
        const subAgentIds = characterId
          ? createdAgents.map((a) => a.id)
          : createdAgents.slice(1).map((a) => a.id);

        const memberSeeds = parsed.components.agents.slice(0, createdAgents.length).map((agent, idx) => {
          const seed = buildAgentMetadataSeed(agent);
          return {
            agentId: createdAgents[idx].id,
            sourcePath: seed.sourcePath,
            metadataSeed: {
              description: seed.description,
              purpose: seed.purpose,
              systemPromptSeed: seed.systemPromptSeed,
            },
          };
        });

        const wf = await createWorkflowFromPluginImport({
          userId: dbUser.id,
          initiatorId,
          subAgentIds,
          pluginId: plugin.id,
          pluginName: parsed.manifest.name,
          pluginVersion: parsed.manifest.version,
          idempotencyKey: requestId,
          memberSeeds,
        });

        // Sync shared folders from initiator to sub-agents (only when characterId provides an existing agent with folders)
        if (characterId && subAgentIds.length > 0) {
          await syncSharedFoldersToSubAgents({
            userId: dbUser.id,
            initiatorId,
            subAgentIds,
            workflowId: wf.id,
          });
        }

        // Auto-enable delegateToSubagent on the initiator if it has enabledTools configured
        if (subAgentIds.length > 0) {
          try {
            const initiatorChar = characterId
              ? await getCharacter(characterId)
              : await getCharacter(createdAgents[0].id);
            const meta = initiatorChar?.metadata as Record<string, unknown> | null;
            const existingTools = Array.isArray(meta?.enabledTools) ? (meta.enabledTools as string[]) : [];
            if (existingTools.length > 0 && !existingTools.includes("delegateToSubagent")) {
              const { db } = await import("@/lib/db/sqlite-client");
              const { characters } = await import("@/lib/db/sqlite-character-schema");
              const { eq } = await import("drizzle-orm");
              await db.update(characters).set({
                metadata: { ...meta, enabledTools: [...existingTools, "delegateToSubagent"] },
              }).where(eq(characters.id, initiatorChar!.id));
            }
          } catch {
            // Non-fatal — user can manually enable the tool
          }
        }

        workflow = {
          id: wf.id,
          initiatorId,
          subAgentIds,
        };

        console.log(
          `[PluginImport:${requestId}] Created workflow ${wf.id} with initiator ${initiatorId} and ${subAgentIds.length} sub-agents`
        );
      } catch (workflowError) {
        console.warn(`[PluginImport:${requestId}] Workflow creation failed (non-fatal):`, workflowError);
        parsed.warnings.push("Workflow creation failed; agents were created without workflow linkage.");
      }
    }

    return NextResponse.json({
      success: true,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        scope: plugin.scope,
        status: plugin.status,
      },
      components: {
        skills: parsed.components.skills.map((s) => ({
          name: s.name,
          namespacedName: s.namespacedName,
          description: s.description,
        })),
        agents: parsed.components.agents.map((a) => ({
          name: a.name,
          description: a.description,
        })),
        hasHooks: parsed.components.hooks !== null,
        mcpServers: parsed.components.mcpServers
          ? Object.keys(parsed.components.mcpServers)
          : [],
        lspServers: parsed.components.lspServers
          ? Object.keys(parsed.components.lspServers)
          : [],
      },
      createdAgents,
      workflow,
      isLegacySkillFormat: parsed.isLegacySkillFormat,
      warnings: parsed.warnings,
      auxiliaryFiles: {
        count: workspaceLink.auxiliaryFileCount,
        path: workspaceLink.linkedPath,
        workspaceRegistered: workspaceLink.workspaceRegistered,
      },
    });
  } catch (error) {
    console.error(`[PluginImport:${requestId}] Error:`, error);

    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plugin import failed" },
      { status: 500 }
    );
  }
}
