import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getCharacter, getCharacterStats } from "@/lib/characters/queries";
import { getAvailablePluginsForAgent } from "@/lib/plugins/registry";
import { getWorkflowByAgentId, getWorkflowResources } from "@/lib/agents/workflows";

type RouteParams = { params: Promise<{ id: string }> };

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function countHookHandlers(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const hooksRecord = (value as { hooks?: Record<string, Array<{ hooks?: unknown[] }>> }).hooks;
  if (!hooksRecord || typeof hooksRecord !== "object") return 0;

  let total = 0;
  for (const entries of Object.values(hooksRecord)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (Array.isArray(entry?.hooks)) {
        total += entry.hooks.length;
      }
    }
  }

  return total;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);
    const { id } = await params;

    const character = await getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metadata = (character.metadata as Record<string, unknown> | null) ?? {};
    const enabledTools = toStringArray(metadata.enabledTools);
    const enabledMcpTools = toStringArray(metadata.enabledMcpTools);
    const customComfyUIWorkflowIds = toStringArray(metadata.customComfyUIWorkflowIds);

    const [stats, pluginAssignments, workflowContext] = await Promise.all([
      getCharacterStats(dbUser.id, id),
      getAvailablePluginsForAgent(dbUser.id, id, id),
      getWorkflowByAgentId(id),
    ]);

    const pluginRows = pluginAssignments.map((entry) => {
      const hookHandlerCount = countHookHandlers(entry.plugin.components.hooks);
      const skillCount = entry.plugin.components.skills?.length || 0;
      const hasMcp =
        !!entry.plugin.components.mcpServers &&
        Object.keys(entry.plugin.components.mcpServers).length > 0;

      return {
        id: entry.plugin.id,
        name: entry.plugin.name,
        description: entry.plugin.description,
        version: entry.plugin.version,
        status: entry.plugin.status,
        enabledForAgent: entry.enabledForAgent,
        skillCount,
        hookHandlerCount,
        hasMcp,
      };
    });

    const enabledPluginRows = pluginRows.filter((plugin) => plugin.enabledForAgent);

    const pluginSkillCount = enabledPluginRows.reduce((sum, plugin) => sum + plugin.skillCount, 0);
    const hookHandlerCount = enabledPluginRows.reduce(
      (sum, plugin) => sum + plugin.hookHandlerCount,
      0
    );
    const pluginMcpServerCount = enabledPluginRows.filter((plugin) => plugin.hasMcp).length;

    let workflow: {
      id: string;
      name: string;
      role: "initiator" | "subagent";
      sharedPluginCount: number;
      sharedFolderCount: number;
      sharedHookCount: number;
      sharedMcpServerCount: number;
    } | null = null;

    if (workflowContext) {
      const resources = await getWorkflowResources(workflowContext.workflow.id, id);
      if (resources) {
        workflow = {
          id: workflowContext.workflow.id,
          name: workflowContext.workflow.name,
          role: resources.role,
          sharedPluginCount: resources.sharedResources.pluginIds.length,
          sharedFolderCount: resources.sharedResources.syncFolderIds.length,
          sharedHookCount: resources.sharedResources.hookEvents.length,
          sharedMcpServerCount: resources.sharedResources.mcpServerNames.length,
        };
      }
    }

    return NextResponse.json({
      resources: {
        skills: {
          count: stats?.skillCount ?? 0,
        },
        tools: {
          enabledCount: enabledTools.length,
        },
        mcp: {
          enabledToolCount: enabledMcpTools.length,
          pluginServerCount: pluginMcpServerCount,
        },
        plugins: {
          totalCount: pluginRows.length,
          enabledCount: enabledPluginRows.length,
          skillCount: pluginSkillCount,
          hookHandlerCount,
        },
        workflows: {
          customComfyUIWorkflowCount: customComfyUIWorkflowIds.length,
          active: workflow,
        },
      },
      plugins: pluginRows,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get character resources" },
      { status: 500 }
    );
  }
}
