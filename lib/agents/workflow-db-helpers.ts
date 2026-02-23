/**
 * Low-level DB helpers used internally by workflows.ts.
 * Extracted to keep the main CRUD file focused on business logic.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  agentWorkflows,
  agentWorkflowMembers,
} from "@/lib/db/sqlite-workflows-schema";
import { agentSyncFolders, characters } from "@/lib/db/sqlite-character-schema";
import { agentPlugins, plugins } from "@/lib/db/sqlite-plugins-schema";
import { toObject } from "./workflow-types";
import type { WorkflowSharedResources, AgentWorkflow } from "./workflow-types";

/**
 * Build a WorkflowSharedResources snapshot from the database.
 * When workflowId is provided, collects folders from ALL members; otherwise
 * only collects from the initiator (used on initial creation).
 */
export async function buildSharedResourcesSnapshot(input: {
  initiatorId: string;
  seedPluginIds?: string[];
  workflowId?: string;
}): Promise<WorkflowSharedResources> {
  let syncFolderIds: string[];
  if (input.workflowId) {
    const memberRows = await db
      .select({ agentId: agentWorkflowMembers.agentId })
      .from(agentWorkflowMembers)
      .where(eq(agentWorkflowMembers.workflowId, input.workflowId));
    const memberIds = memberRows.map((m) => m.agentId);

    const folderRows = memberIds.length
      ? await db
          .select({ id: agentSyncFolders.id })
          .from(agentSyncFolders)
          .where(
            and(
              inArray(agentSyncFolders.characterId, memberIds),
              isNull(agentSyncFolders.inheritedFromWorkflowId)
            )
          )
      : [];
    syncFolderIds = folderRows.map((f) => f.id);
  } else {
    const folderRows = await db
      .select({ id: agentSyncFolders.id })
      .from(agentSyncFolders)
      .where(
        and(
          eq(agentSyncFolders.characterId, input.initiatorId),
          isNull(agentSyncFolders.inheritedFromWorkflowId)
        )
      );
    syncFolderIds = folderRows.map((f) => f.id);
  }

  const pluginAssignments = await db
    .select({ pluginId: agentPlugins.pluginId })
    .from(agentPlugins)
    .where(
      and(eq(agentPlugins.agentId, input.initiatorId), eq(agentPlugins.enabled, true))
    );

  const pluginIds = Array.from(
    new Set([...(input.seedPluginIds || []), ...pluginAssignments.map((item) => item.pluginId)])
  );

  const pluginRows = pluginIds.length
    ? await db
        .select({ components: plugins.components })
        .from(plugins)
        .where(inArray(plugins.id, pluginIds))
    : [];

  const mcpServerNames = new Set<string>();
  const hookEvents = new Set<string>();

  for (const pluginRow of pluginRows) {
    const components = toObject(pluginRow.components);
    const mcpServers = toObject(components.mcpServers);
    const hooks = toObject(components.hooks);
    const hooksMap = toObject(hooks.hooks);
    for (const key of Object.keys(mcpServers)) mcpServerNames.add(key);
    for (const key of Object.keys(hooksMap)) hookEvents.add(key);
  }

  return {
    syncFolderIds,
    pluginIds,
    mcpServerNames: Array.from(mcpServerNames),
    hookEvents: Array.from(hookEvents),
  };
}

export async function assertCharacterOwnedByUser(userId: string, agentId: string): Promise<void> {
  const row = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, agentId), eq(characters.userId, userId)))
    .limit(1);

  if (row.length === 0) {
    throw new Error("Agent not found");
  }
}

export async function assertAgentNotInActiveWorkflow(
  agentId: string,
  options?: { excludeWorkflowId?: string }
): Promise<void> {
  const conditions = [eq(agentWorkflowMembers.agentId, agentId), ne(agentWorkflows.status, "archived")];
  if (options?.excludeWorkflowId) {
    conditions.push(ne(agentWorkflowMembers.workflowId, options.excludeWorkflowId));
  }

  const membership = await db
    .select({ workflowId: agentWorkflowMembers.workflowId })
    .from(agentWorkflowMembers)
    .innerJoin(agentWorkflows, eq(agentWorkflows.id, agentWorkflowMembers.workflowId))
    .where(and(...conditions))
    .limit(1);

  if (membership.length > 0) {
    throw new Error("Agent already belongs to an active workflow");
  }
}

export async function touchWorkflow(workflowId: string): Promise<void> {
  await db
    .update(agentWorkflows)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(agentWorkflows.id, workflowId));
}

/**
 * Re-compute sharedResources from all current members and persist to the workflow row.
 * Requires a `getWorkflowById` callback to avoid a circular dependency.
 */
export async function refreshWorkflowSharedResources(
  workflowId: string,
  initiatorId: string,
  getWorkflow: (id: string) => Promise<AgentWorkflow | null>
): Promise<void> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return;

  const seedPluginIds = workflow.metadata.pluginId ? [workflow.metadata.pluginId] : [];
  const sharedResources = await buildSharedResourcesSnapshot({
    initiatorId,
    seedPluginIds,
    workflowId,
  });

  await db
    .update(agentWorkflows)
    .set({
      metadata: {
        ...workflow.metadata,
        sharedResources,
      },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agentWorkflows.id, workflowId));
}
