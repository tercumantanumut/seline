import { resolve } from "path";
import type { AgentTemplate } from "./types";
import { SELINE_DEFAULT_TEMPLATE } from "./seline-default";
import {
  createCharacter,
  getUserCharacters,
  getUserDefaultCharacter,
  setDefaultCharacter,
} from "../queries";
import { AgentMemoryManager } from "@/lib/agent-memory";
import { addSyncFolder, getSyncFolders, setPrimaryFolder } from "@/lib/vectordb/sync-service";

const TEMPLATES: Map<string, AgentTemplate> = new Map([
  [SELINE_DEFAULT_TEMPLATE.id, SELINE_DEFAULT_TEMPLATE],
]);

export function getAllTemplates(): AgentTemplate[] {
  return Array.from(TEMPLATES.values());
}

export function getTemplate(id: string): AgentTemplate | undefined {
  return TEMPLATES.get(id);
}

export function getDefaultTemplate(): AgentTemplate | undefined {
  return Array.from(TEMPLATES.values()).find((template) => template.isDefault);
}

function resolvePathVariable(pathVar: string): string {
  if (pathVar === "${SETUP_FOLDER}") {
    // In production, use the bundled source code
    const resourcesPath = process.env.ELECTRON_RESOURCES_PATH ||
                         (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

    if (resourcesPath) {
      const { join } = require("path");
      // Source code is bundled inside standalone folder
      return join(resourcesPath, "standalone", "seline-source");
    }

    // Development: use current working directory
    return process.cwd();
  }
  return pathVar;
}

export async function ensureDefaultAgentExists(userId: string): Promise<string | null> {
  try {
    const existingDefault = await getUserDefaultCharacter(userId);
    if (existingDefault) {
      return existingDefault.id;
    }

    const existingCharacters = await getUserCharacters(userId);
    if (existingCharacters.length > 0) {
      const existingSeline = existingCharacters.find(
        (character) => character.name.toLowerCase() === SELINE_DEFAULT_TEMPLATE.name.toLowerCase()
      );
      if (existingSeline) {
        await setDefaultCharacter(userId, existingSeline.id);
        return existingSeline.id;
      }
    }

    return await createAgentFromTemplate(userId, SELINE_DEFAULT_TEMPLATE);
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
    const character = await createCharacter({
      userId,
      name: template.name,
      tagline: template.tagline,
      isDefault: template.isDefault ?? false,
      status: "active",
      metadata: {
        purpose: template.purpose,
        enabledTools: template.enabledTools,
        enabledMcpServers: [],
        enabledMcpTools: [],
        mcpToolPreferences: {},
      },
    });

    if (!character) {
      throw new Error("Failed to create character record");
    }

    const characterId = character.id;

    await seedTemplateMemories(characterId, template.memories);

    if (template.syncFolders && template.syncFolders.length > 0) {
      await configureSyncFolders(userId, characterId, template.syncFolders);
    }

    return characterId;
  } catch (error) {
    console.error("[Templates] Error creating agent from template:", error);
    return null;
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

export type { AgentTemplate, AgentTemplateMemory } from "./types";
