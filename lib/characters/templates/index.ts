import { resolve } from "path";
import type { AgentTemplate } from "./types";
import { SELINE_DEFAULT_TEMPLATE } from "./seline-default";
import { SOCIAL_MEDIA_MANAGER_TEMPLATE } from "./social-media-manager";
import { MEETING_NOTES_ASSISTANT_TEMPLATE } from "./meeting-notes-assistant";
import { DATA_ANALYST_TEMPLATE } from "./data-analyst";
import { CUSTOMER_SUPPORT_AGENT_TEMPLATE } from "./customer-support-agent";
import { PERSONAL_FINANCE_TRACKER_TEMPLATE } from "./personal-finance-tracker";
import { LEARNING_COACH_TEMPLATE } from "./learning-coach";
import { PROJECT_MANAGER_TEMPLATE } from "./project-manager";
import { SYSTEM_AGENT_TEMPLATES } from "./system-agents";
import { resolveSelineTemplateTools, type ToolResolutionResult } from "./resolve-tools";
import {
  createCharacter,
  getUserCharacters,
  getUserDefaultCharacter,
  updateCharacter,
  setDefaultCharacter,
} from "../queries";
import { createSkill } from "@/lib/skills/queries";
import { AgentMemoryManager } from "@/lib/agent-memory";
import { addSyncFolder, getSyncFolders, setPrimaryFolder } from "@/lib/vectordb/sync-service";
import { getUserWorkspacePath } from "@/lib/workspace/setup";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getWorkflowsForInitiator,
  createSystemAgentWorkflow,
  addWorkflowMembers,
} from "@/lib/agents/workflows";

const TEMPLATES: Map<string, AgentTemplate> = new Map([
  [SELINE_DEFAULT_TEMPLATE.id, SELINE_DEFAULT_TEMPLATE],
  [SOCIAL_MEDIA_MANAGER_TEMPLATE.id, SOCIAL_MEDIA_MANAGER_TEMPLATE],
  [MEETING_NOTES_ASSISTANT_TEMPLATE.id, MEETING_NOTES_ASSISTANT_TEMPLATE],
  [DATA_ANALYST_TEMPLATE.id, DATA_ANALYST_TEMPLATE],
  [CUSTOMER_SUPPORT_AGENT_TEMPLATE.id, CUSTOMER_SUPPORT_AGENT_TEMPLATE],
  [PERSONAL_FINANCE_TRACKER_TEMPLATE.id, PERSONAL_FINANCE_TRACKER_TEMPLATE],
  [LEARNING_COACH_TEMPLATE.id, LEARNING_COACH_TEMPLATE],
  [PROJECT_MANAGER_TEMPLATE.id, PROJECT_MANAGER_TEMPLATE],
]);

export function getAllTemplates(): AgentTemplate[] {
  return Array.from(TEMPLATES.values());
}

export function getTemplate(id: string): AgentTemplate | undefined {
  return TEMPLATES.get(id);
}

export function searchTemplates(options: { category?: string; query?: string }): AgentTemplate[] {
  const category = options.category?.trim().toLowerCase();
  const query = options.query?.trim().toLowerCase();
  return getAllTemplates().filter((template) => {
    if (category && (template.category || "").toLowerCase() !== category) return false;
    if (!query) return true;
    const haystack = `${template.name} ${template.tagline} ${template.purpose} ${template.category || ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function getDefaultTemplate(): AgentTemplate | undefined {
  return Array.from(TEMPLATES.values()).find((template) => template.isDefault);
}

function resolvePathVariable(pathVar: string): string {
  if (pathVar === "${USER_WORKSPACE}") {
    return getUserWorkspacePath();
  }
  // ${SETUP_FOLDER} has been removed - it was used for bundling Seline's source code
  // into production builds, which is no longer supported.
  // If a template still references ${SETUP_FOLDER}, fall back to user workspace.
  if (pathVar === "${SETUP_FOLDER}") {
    console.warn(
      "[Templates] ${SETUP_FOLDER} is deprecated and has been removed. " +
      "Falling back to ${USER_WORKSPACE}. Please update your template configuration."
    );
    return getUserWorkspacePath();
  }
  return pathVar;
}

export async function ensureDefaultAgentExists(userId: string): Promise<string | null> {
  try {
    // First check if default already exists (fast path)
    const existingDefault = await getUserDefaultCharacter(userId);
    if (existingDefault) {
      // Fire-and-forget: ensure system agents are provisioned (idempotent)
      ensureSystemAgentsExist(userId, existingDefault.id).catch((err) => {
        console.error("[SystemAgents] Background provisioning failed:", err);
      });
      return existingDefault.id;
    }

    // Check for existing characters
    const existingCharacters = await getUserCharacters(userId);

    // If user has any characters but no default, respect their choice
    // They may have explicitly deleted the default agent
    if (existingCharacters.length > 0) {
      const existingSeline = existingCharacters.find(
        (character) => character.name.toLowerCase() === SELINE_DEFAULT_TEMPLATE.name.toLowerCase()
      );
      if (existingSeline) {
        try {
          await setDefaultCharacter(userId, existingSeline.id);
          return existingSeline.id;
        } catch (error) {
          // If setting default fails due to race condition, check if another default was created
          const nowDefault = await getUserDefaultCharacter(userId);
          if (nowDefault) {
            return nowDefault.id;
          }
          throw error;
        }
      }
      // User has characters but no default - don't force-create one
      return null;
    }

    // Only create default agent for brand new users (zero characters)
    // This ensures first-time users get the default, but it can be deleted permanently
    try {
      const newDefaultId = await createAgentFromTemplate(userId, SELINE_DEFAULT_TEMPLATE);
      if (newDefaultId) {
        ensureSystemAgentsExist(userId, newDefaultId).catch((err) => {
          console.error("[SystemAgents] Background provisioning failed:", err);
        });
      }
      return newDefaultId;
    } catch (error) {
      // If creation fails due to unique constraint violation (race condition),
      // another request may have created the default
      const nowDefault = await getUserDefaultCharacter(userId);
      if (nowDefault) {
        return nowDefault.id;
      }
      // Re-throw if it's not a race condition error
      throw error;
    }
  } catch (error) {
    console.error("[Templates] Error ensuring default agent:", error);
    return null;
  }
}

export async function createAgentFromTemplate(
  userId: string,
  template: AgentTemplate
): Promise<string | null> {
  try {
    // For the Seline default template, resolve tools dynamically based on settings
    let resolvedTools = template.enabledTools;
    let toolWarnings: ToolResolutionResult["warnings"] = [];

    if (template.id === "seline-default") {
      try {
        const settings = loadSettings();
        const resolution = resolveSelineTemplateTools(settings);
        resolvedTools = resolution.enabledTools;
        toolWarnings = resolution.warnings;

        if (toolWarnings.length > 0) {
          console.log(
            `[Templates] Seline template: ${toolWarnings.length} tool(s) disabled due to missing prerequisites:`
          );
          for (const w of toolWarnings) {
            console.log(`  - ${w.toolName}: ${w.reason}`);
          }
        }
        console.log(
          `[Templates] Seline template resolved ${resolvedTools.length} tools (from ${template.enabledTools.length} static)`
        );
      } catch (error) {
        console.warn("[Templates] Failed to resolve Seline tools dynamically, using static list:", error);
        resolvedTools = template.enabledTools;
      }
    }

    let isDefault = template.isDefault ?? false;
    if (isDefault) {
      const existingDefault = await getUserDefaultCharacter(userId);
      if (existingDefault) {
        isDefault = false;
      }
    }

    const character = await createCharacter({
      userId,
      name: template.name,
      tagline: template.tagline,
      isDefault,
      status: "active",
      metadata: {
        purpose: template.purpose,
        enabledTools: resolvedTools,
        enabledMcpServers: [],
        enabledMcpTools: [],
        mcpToolPreferences: {},
        ...(template.isSystemAgent && {
          isSystemAgent: true,
          systemAgentType: template.systemAgentType,
          systemPromptOverride: template.purpose,
        }),
      },
    });

    if (!character) {
      throw new Error("Failed to create character record");
    }

    const characterId = character.id;

    await seedTemplateMemories(characterId, template.memories);
    await seedTemplateSkills(userId, characterId, template);

    if (template.syncFolders && template.syncFolders.length > 0) {
      await configureSyncFolders(userId, characterId, template.syncFolders);
    }

    return characterId;
  } catch (error) {
    if (template.isDefault) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (message.includes("UNIQUE constraint failed: characters.user_id, characters.is_default")) {
        const existingDefault = await getUserDefaultCharacter(userId);
        if (existingDefault) {
          return existingDefault.id;
        }
      }
    }

    console.error("[Templates] Error creating agent from template:", error);
    return null;
  }
}

async function seedTemplateSkills(userId: string, characterId: string, template: AgentTemplate): Promise<void> {
  if (!template.exampleSkills || template.exampleSkills.length === 0) return;

  for (const skill of template.exampleSkills) {
    try {
      await createSkill({
        userId,
        characterId,
        name: skill.name,
        description: skill.description,
        promptTemplate: skill.promptTemplate,
        inputParameters: (skill.inputParameters || []).map((item) => ({
          name: item.name,
          type: item.type,
          defaultValue: item.default ?? null,
        })),
        toolHints: skill.toolHints || [],
        triggerExamples: skill.triggerExamples || [],
        category: skill.category || template.category || "general",
        sourceType: "template",
        status: "active",
      });
    } catch (error) {
      console.warn(`[Templates] Failed to seed skill ${skill.name} for ${template.id}:`, error);
    }
  }
}

async function seedTemplateMemories(
  characterId: string,
  memories: AgentTemplate["memories"]
): Promise<void> {
  const memoryManager = new AgentMemoryManager(characterId);

  for (const memory of memories) {
    await memoryManager.addMemory({
      category: memory.category,
      content: memory.content,
      reasoning: memory.reasoning,
      status: "approved",
      source: "manual",
      confidence: 1.0,
      importance: 1.0,
    });
  }
}

async function configureSyncFolders(
  userId: string,
  characterId: string,
  folders: AgentTemplate["syncFolders"]
): Promise<void> {
  if (!folders) return;

  const existingFolders = await getSyncFolders(characterId);
  const existingPaths = new Set(existingFolders.map((folder) => resolve(folder.folderPath)));

  for (const folderConfig of folders) {
    const resolvedPath = resolve(resolvePathVariable(folderConfig.pathVariable));
    if (existingPaths.has(resolvedPath)) {
      continue;
    }

    try {
      const folderId = await addSyncFolder({
        userId,
        characterId,
        folderPath: resolvedPath,
        displayName: folderConfig.displayName,
        recursive: true,
        includeExtensions: folderConfig.includeExtensions,
        excludePatterns: folderConfig.excludePatterns,
      });

      if (folderConfig.isPrimary) {
        await setPrimaryFolder(folderId, characterId);
      }
    } catch (error) {
      console.warn(`[Templates] Failed to add sync folder ${resolvedPath}:`, error);
    }
  }
}

/**
 * Ensure system specialist agents exist for a user.
 * Called after the default agent is confirmed.
 *
 * Idempotent: once `systemAgentsProvisioned` is set on the default agent's
 * metadata, deleted agents are NOT re-created (respects user intent).
 */
export async function ensureSystemAgentsExist(
  userId: string,
  defaultAgentId: string
): Promise<void> {
  try {
    const existingCharacters = await getUserCharacters(userId);

    const existingSystemTypes = new Set<string>();
    const existingSystemAgentIds: string[] = [];

    for (const char of existingCharacters) {
      const meta = (char.metadata ?? {}) as Record<string, unknown>;
      if (meta.isSystemAgent && meta.systemAgentType) {
        existingSystemTypes.add(meta.systemAgentType as string);
        existingSystemAgentIds.push(char.id);
      }
    }

    const defaultAgent = existingCharacters.find((c) => c.id === defaultAgentId);
    const defaultMeta = (defaultAgent?.metadata ?? {}) as Record<string, unknown>;

    if (defaultMeta.systemAgentsProvisioned) {
      // Already provisioned once — only maintain the workflow
      await ensureSystemWorkflow(userId, defaultAgentId, existingSystemAgentIds);
      return;
    }

    // First-time provisioning: create all system agents
    const newAgentIds: string[] = [];

    for (const template of SYSTEM_AGENT_TEMPLATES) {
      if (existingSystemTypes.has(template.systemAgentType!)) {
        continue;
      }

      const agentId = await createAgentFromTemplate(userId, template);
      if (agentId) {
        newAgentIds.push(agentId);
      }
    }

    // Mark provisioning complete on the default agent
    await updateCharacter(defaultAgentId, {
      metadata: {
        ...defaultMeta,
        systemAgentsProvisioned: true,
      },
    });

    const allSystemAgentIds = [...existingSystemAgentIds, ...newAgentIds];
    if (allSystemAgentIds.length > 0) {
      await ensureSystemWorkflow(userId, defaultAgentId, allSystemAgentIds);
    }

    console.log(
      `[SystemAgents] Provisioned ${newAgentIds.length} system agents for user ${userId}`
    );
  } catch (error) {
    console.error("[SystemAgents] Error provisioning system agents:", error);
    // Non-fatal — default agent still works without specialists
  }
}

async function ensureSystemWorkflow(
  userId: string,
  initiatorId: string,
  subagentIds: string[]
): Promise<void> {
  if (subagentIds.length === 0) return;

  try {
    const existingWorkflows = await getWorkflowsForInitiator(userId, initiatorId);
    const systemWorkflow = existingWorkflows.find(
      (w) => w.metadata.source === "system-agents"
    );

    if (systemWorkflow) {
      // Workflow exists — add any new system agents as members (idempotent)
      await addWorkflowMembers({
        workflowId: systemWorkflow.id,
        members: subagentIds.map((agentId) => ({
          workflowId: systemWorkflow.id,
          agentId,
          role: "subagent" as const,
        })),
      });
      return;
    }

    // Create the system specialists workflow
    await createSystemAgentWorkflow({
      userId,
      initiatorId,
      subAgentIds: subagentIds,
      name: "System Specialists",
    });
  } catch (error) {
    console.error("[SystemAgents] Error ensuring system workflow:", error);
  }
}

export type { AgentTemplate, AgentTemplateMemory } from "./types";
export { resolveSelineTemplateTools, type ToolResolutionResult, type ToolWarning } from "./resolve-tools";
