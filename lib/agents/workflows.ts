import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  agentWorkflows,
  agentWorkflowMembers,
} from "@/lib/db/sqlite-workflows-schema";
import { agentSyncFolders } from "@/lib/db/sqlite-character-schema";
import { notifyFolderChange } from "@/lib/vectordb/folder-events";
import {
  cleanupInheritedFoldersOnRemoval,
  shareFolderToWorkflowSubagents,
  syncOwnFoldersToWorkflowMembers,
  syncSharedFoldersToSubAgents,
} from "./workflow-folder-sharing";
import {
  mapWorkflowRow,
  mapWorkflowMemberRow,
  type AgentWorkflow,
  type AgentWorkflowMember,
  type WorkflowMembershipContext,
  type WorkflowStatus,
} from "./workflow-types";
import {
  assertAgentNotInActiveWorkflow,
  assertCharacterOwnedByUser,
  buildSharedResourcesSnapshot,
  refreshWorkflowSharedResources as _refreshWorkflowSharedResources,
  touchWorkflow,
} from "./workflow-db-helpers";

// ── Re-exports (keep all public names accessible from this path) ───────────────
export {
  shareFolderToWorkflowSubagents,
  syncSharedFoldersToSubAgents,
} from "./workflow-folder-sharing";

export type {
  WorkflowStatus,
  WorkflowSharedResources,
  AgentWorkflow,
  AgentWorkflowMember,
  WorkflowMembershipContext,
  WorkflowResourceContext,
  WorkflowPromptContextDelegation,
  WorkflowPromptContextInput,
} from "./workflow-types";

export { buildWorkflowPromptContext } from "./workflow-types";
export { registerWorkflowSubagentLifecycle } from "./workflow-lifecycle";

// ── Private input interfaces ───────────────────────────────────────────────────

interface CreateWorkflowFromPluginImportInput {
  userId: string;
  initiatorId: string;
  subAgentIds: string[];
  pluginId: string;
  pluginName: string;
  pluginVersion?: string;
  idempotencyKey?: string;
  memberSeeds?: Array<{ agentId: string; sourcePath?: string; metadataSeed?: AgentWorkflowMember["metadataSeed"] }>;
}

interface AddWorkflowMembersInput {
  workflowId: string;
  members: AgentWorkflowMember[];
}

interface CreateManualWorkflowInput {
  userId: string;
  initiatorId: string;
  subAgentIds: string[];
  name?: string;
}

interface UpdateWorkflowConfigInput {
  workflowId: string;
  userId: string;
  name?: string;
  status?: WorkflowStatus;
}

interface AddSubagentToWorkflowInput {
  workflowId: string;
  userId: string;
  agentId: string;
  syncFolders?: boolean;
}

interface SetWorkflowInitiatorInput {
  workflowId: string;
  userId: string;
  initiatorId: string;
}

interface RemoveWorkflowMemberInput {
  workflowId: string;
  userId: string;
  agentId: string;
  promoteToAgentId?: string;
}

// ── Thin wrapper: binds refreshWorkflowSharedResources to local getWorkflowById ─
function refreshWorkflowSharedResources(workflowId: string, initiatorId: string): Promise<void> {
  return _refreshWorkflowSharedResources(workflowId, initiatorId, getWorkflowById);
}

// ── Public CRUD ────────────────────────────────────────────────────────────────

export async function addWorkflowMembers(input: AddWorkflowMembersInput): Promise<AgentWorkflowMember[]> {
  const created: AgentWorkflowMember[] = [];

  for (const member of input.members) {
    const existing = await db
      .select({ id: agentWorkflowMembers.id })
      .from(agentWorkflowMembers)
      .where(
        and(
          eq(agentWorkflowMembers.workflowId, input.workflowId),
          eq(agentWorkflowMembers.agentId, member.agentId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const [row] = await db
      .insert(agentWorkflowMembers)
      .values({
        workflowId: input.workflowId,
        agentId: member.agentId,
        role: member.role,
        sourcePath: member.sourcePath ?? null,
        metadataSeed: member.metadataSeed ?? null,
      })
      .returning();

    created.push(mapWorkflowMemberRow(row));
  }

  return created;
}

export async function createWorkflowFromPluginImport(
  input: CreateWorkflowFromPluginImportInput
): Promise<AgentWorkflow> {
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(agentWorkflows)
      .where(
        and(
          eq(agentWorkflows.userId, input.userId),
          eq(agentWorkflows.initiatorId, input.initiatorId),
          sql`json_extract(${agentWorkflows.metadata}, '$.idempotencyKey') = ${input.idempotencyKey}`
        )
      )
      .orderBy(desc(agentWorkflows.createdAt))
      .limit(1);

    if (existing.length > 0) {
      return mapWorkflowRow(existing[0]);
    }
  }

  const sharedResources = await buildSharedResourcesSnapshot({
    initiatorId: input.initiatorId,
    seedPluginIds: [input.pluginId],
  });

  const [workflowRow] = await db
    .insert(agentWorkflows)
    .values({
      userId: input.userId,
      name: `${input.pluginName} workflow`,
      initiatorId: input.initiatorId,
      status: "active",
      metadata: {
        source: "plugin-import",
        pluginId: input.pluginId,
        pluginName: input.pluginName,
        pluginVersion: input.pluginVersion,
        idempotencyKey: input.idempotencyKey,
        sharedResources,
      },
    })
    .returning();

  const memberSeedByAgent = new Map(
    (input.memberSeeds || []).map((entry) => [entry.agentId, entry])
  );

  await addWorkflowMembers({
    workflowId: workflowRow.id,
    members: [
      {
        workflowId: workflowRow.id,
        agentId: input.initiatorId,
        role: "initiator",
      },
      ...input.subAgentIds.map((agentId) => {
        const seed = memberSeedByAgent.get(agentId);
        return {
          workflowId: workflowRow.id,
          agentId,
          role: "subagent" as const,
          sourcePath: seed?.sourcePath,
          metadataSeed: seed?.metadataSeed,
        };
      }),
    ],
  });

  return mapWorkflowRow(workflowRow);
}

export async function createManualWorkflow(
  input: CreateManualWorkflowInput
): Promise<AgentWorkflow> {
  const uniqueSubAgentIds = Array.from(
    new Set(input.subAgentIds.filter((agentId) => agentId !== input.initiatorId))
  );

  await assertCharacterOwnedByUser(input.userId, input.initiatorId);
  await assertAgentNotInActiveWorkflow(input.initiatorId);

  for (const subAgentId of uniqueSubAgentIds) {
    await assertCharacterOwnedByUser(input.userId, subAgentId);
    await assertAgentNotInActiveWorkflow(subAgentId);
  }

  const sharedResources = await buildSharedResourcesSnapshot({
    initiatorId: input.initiatorId,
  });

  const [workflowRow] = await db
    .insert(agentWorkflows)
    .values({
      userId: input.userId,
      name: input.name?.trim() || "Agent workflow",
      initiatorId: input.initiatorId,
      status: "active",
      metadata: {
        source: "manual",
        sharedResources,
      },
    })
    .returning();

  await addWorkflowMembers({
    workflowId: workflowRow.id,
    members: [
      {
        workflowId: workflowRow.id,
        agentId: input.initiatorId,
        role: "initiator",
      },
      ...uniqueSubAgentIds.map((agentId) => ({
        workflowId: workflowRow.id,
        agentId,
        role: "subagent" as const,
      })),
    ],
  });

  if (uniqueSubAgentIds.length > 0) {
    // Sync initiator's folders → all subagents
    await syncSharedFoldersToSubAgents({
      userId: input.userId,
      initiatorId: input.initiatorId,
      subAgentIds: uniqueSubAgentIds,
      workflowId: workflowRow.id,
    });

    // Sync each subagent's own folders → initiator + other subagents
    for (const subAgentId of uniqueSubAgentIds) {
      const otherMembers = [input.initiatorId, ...uniqueSubAgentIds.filter((id) => id !== subAgentId)];
      await syncOwnFoldersToWorkflowMembers({
        userId: input.userId,
        sourceAgentId: subAgentId,
        targetAgentIds: otherMembers,
        workflowId: workflowRow.id,
      });
    }

    // Refresh shared resources to reflect all members' folders
    await refreshWorkflowSharedResources(workflowRow.id, input.initiatorId);
  }

  return mapWorkflowRow(workflowRow);
}

export async function updateWorkflowConfig(
  input: UpdateWorkflowConfigInput
): Promise<AgentWorkflow> {
  const workflow = await getWorkflowById(input.workflowId, input.userId);
  if (!workflow) throw new Error("Workflow not found");

  const nextName = input.name?.trim();
  const nextValues: Partial<typeof agentWorkflows.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (nextName) nextValues.name = nextName;
  if (input.status) nextValues.status = input.status;

  await db.update(agentWorkflows).set(nextValues).where(eq(agentWorkflows.id, input.workflowId));

  const updated = await getWorkflowById(input.workflowId, input.userId);
  if (!updated) throw new Error("Workflow not found");
  return updated;
}

export async function addSubagentToWorkflow(
  input: AddSubagentToWorkflowInput
): Promise<AgentWorkflowMember> {
  const workflow = await getWorkflowById(input.workflowId, input.userId);
  if (!workflow) throw new Error("Workflow not found");
  if (workflow.status === "archived") throw new Error("Cannot modify archived workflow");

  await assertCharacterOwnedByUser(input.userId, input.agentId);
  await assertAgentNotInActiveWorkflow(input.agentId, { excludeWorkflowId: input.workflowId });

  const [member] = await addWorkflowMembers({
    workflowId: input.workflowId,
    members: [
      {
        workflowId: input.workflowId,
        agentId: input.agentId,
        role: "subagent",
      },
    ],
  });

  if (!member) {
    throw new Error("Agent is already in this workflow");
  }

  if (input.syncFolders !== false) {
    // Sync all existing members' folders → new subagent
    await syncSharedFoldersToSubAgents({
      userId: input.userId,
      initiatorId: workflow.initiatorId,
      subAgentIds: [input.agentId],
      workflowId: input.workflowId,
    });

    // Sync the new subagent's own folders → all other existing members
    const existingMembers = await getWorkflowMembers(input.workflowId);
    const otherMemberIds = existingMembers
      .map((m) => m.agentId)
      .filter((id) => id !== input.agentId);

    if (otherMemberIds.length > 0) {
      await syncOwnFoldersToWorkflowMembers({
        userId: input.userId,
        sourceAgentId: input.agentId,
        targetAgentIds: otherMemberIds,
        workflowId: input.workflowId,
      });
    }

    // Refresh shared resources to reflect the new member's folders
    await refreshWorkflowSharedResources(input.workflowId, workflow.initiatorId);
  } else {
    await touchWorkflow(input.workflowId);
  }

  return member;
}

export async function setWorkflowInitiator(
  input: SetWorkflowInitiatorInput
): Promise<AgentWorkflow> {
  const workflow = await getWorkflowById(input.workflowId, input.userId);
  if (!workflow) throw new Error("Workflow not found");

  const member = await db
    .select({ role: agentWorkflowMembers.role })
    .from(agentWorkflowMembers)
    .where(
      and(
        eq(agentWorkflowMembers.workflowId, input.workflowId),
        eq(agentWorkflowMembers.agentId, input.initiatorId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    throw new Error("Selected agent is not a workflow member");
  }

  if (workflow.initiatorId === input.initiatorId) {
    return workflow;
  }

  await db
    .update(agentWorkflowMembers)
    .set({ role: "subagent", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(agentWorkflowMembers.workflowId, input.workflowId),
        eq(agentWorkflowMembers.role, "initiator")
      )
    );

  await db
    .update(agentWorkflowMembers)
    .set({ role: "initiator", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(agentWorkflowMembers.workflowId, input.workflowId),
        eq(agentWorkflowMembers.agentId, input.initiatorId)
      )
    );

  await db
    .update(agentWorkflows)
    .set({
      initiatorId: input.initiatorId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agentWorkflows.id, input.workflowId));

  await refreshWorkflowSharedResources(input.workflowId, input.initiatorId);

  const updated = await getWorkflowById(input.workflowId, input.userId);
  if (!updated) throw new Error("Workflow not found");
  return updated;
}

export async function removeWorkflowMember(
  input: RemoveWorkflowMemberInput
): Promise<{ workflowDeleted: boolean; newInitiatorId?: string }> {
  const workflow = await getWorkflowById(input.workflowId, input.userId);
  if (!workflow) throw new Error("Workflow not found");

  const members = await getWorkflowMembers(input.workflowId);
  const target = members.find((member) => member.agentId === input.agentId);
  if (!target) throw new Error("Agent is not a workflow member");

  if (members.length <= 1) {
    await db.delete(agentWorkflows).where(eq(agentWorkflows.id, input.workflowId));
    return { workflowDeleted: true };
  }

  let nextInitiatorId = workflow.initiatorId;

  if (target.role === "initiator") {
    const candidates = members.filter((member) => member.agentId !== input.agentId);
    const explicitCandidate = input.promoteToAgentId
      ? candidates.find((member) => member.agentId === input.promoteToAgentId)
      : undefined;
    const fallbackCandidate =
      candidates.find((member) => member.role === "subagent") || candidates[0];
    const replacement = explicitCandidate || fallbackCandidate;

    if (!replacement) {
      await db.delete(agentWorkflows).where(eq(agentWorkflows.id, input.workflowId));
      return { workflowDeleted: true };
    }

    await db
      .update(agentWorkflowMembers)
      .set({ role: "subagent", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(agentWorkflowMembers.workflowId, input.workflowId),
          eq(agentWorkflowMembers.role, "initiator")
        )
      );

    await db
      .update(agentWorkflowMembers)
      .set({ role: "initiator", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(agentWorkflowMembers.workflowId, input.workflowId),
          eq(agentWorkflowMembers.agentId, replacement.agentId)
        )
      );

    await db
      .update(agentWorkflows)
      .set({
        initiatorId: replacement.agentId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentWorkflows.id, input.workflowId));

    nextInitiatorId = replacement.agentId;
  }

  // Clean up inherited folders before removing the member
  await cleanupInheritedFoldersOnRemoval({
    workflowId: input.workflowId,
    leavingAgentId: input.agentId,
    remainingMemberIds: members
      .map((m) => m.agentId)
      .filter((id) => id !== input.agentId),
  });

  await db
    .delete(agentWorkflowMembers)
    .where(
      and(
        eq(agentWorkflowMembers.workflowId, input.workflowId),
        eq(agentWorkflowMembers.agentId, input.agentId)
      )
    );

  await touchWorkflow(input.workflowId);
  await refreshWorkflowSharedResources(input.workflowId, nextInitiatorId);
  return target.role === "initiator"
    ? { workflowDeleted: false, newInitiatorId: nextInitiatorId }
    : { workflowDeleted: false };
}

export async function deleteWorkflow(workflowId: string, userId: string): Promise<void> {
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) throw new Error("Workflow not found");

  // Clean up all inherited sync folders for every member before deleting the workflow
  const members = await getWorkflowMembers(workflowId);
  for (const member of members) {
    const inherited = await db
      .select({ id: agentSyncFolders.id })
      .from(agentSyncFolders)
      .where(
        and(
          eq(agentSyncFolders.characterId, member.agentId),
          eq(agentSyncFolders.inheritedFromWorkflowId, workflowId)
        )
      );

    if (inherited.length > 0) {
      await db
        .delete(agentSyncFolders)
        .where(
          and(
            eq(agentSyncFolders.characterId, member.agentId),
            eq(agentSyncFolders.inheritedFromWorkflowId, workflowId)
          )
        );
      for (const { id } of inherited) {
        notifyFolderChange(member.agentId, { type: "removed", folderId: id, wasPrimary: false });
      }
    }
  }

  await db.delete(agentWorkflows).where(eq(agentWorkflows.id, workflowId));
}

export async function detachAgentFromWorkflows(
  userId: string,
  agentId: string
): Promise<void> {
  const rows = await db
    .select({ workflowId: agentWorkflowMembers.workflowId })
    .from(agentWorkflowMembers)
    .innerJoin(agentWorkflows, eq(agentWorkflows.id, agentWorkflowMembers.workflowId))
    .where(
      and(
        eq(agentWorkflows.userId, userId),
        eq(agentWorkflowMembers.agentId, agentId),
        ne(agentWorkflows.status, "archived")
      )
    );

  for (const row of rows) {
    await removeWorkflowMember({
      workflowId: row.workflowId,
      userId,
      agentId,
    });
  }
}

export async function getWorkflowByAgentId(
  agentId: string
): Promise<WorkflowMembershipContext | null> {
  const rows = await db
    .select({
      workflow: agentWorkflows,
      member: agentWorkflowMembers,
    })
    .from(agentWorkflowMembers)
    .innerJoin(agentWorkflows, eq(agentWorkflowMembers.workflowId, agentWorkflows.id))
    .where(
      and(
        eq(agentWorkflowMembers.agentId, agentId),
        ne(agentWorkflows.status, "archived")
      )
    )
    .orderBy(desc(agentWorkflows.updatedAt))
    .limit(1);

  if (rows.length === 0) return null;

  return {
    workflow: mapWorkflowRow(rows[0].workflow),
    member: mapWorkflowMemberRow(rows[0].member),
  };
}

export async function getWorkflowById(
  workflowId: string,
  userId?: string
): Promise<AgentWorkflow | null> {
  const conditions = [eq(agentWorkflows.id, workflowId)];
  if (userId) {
    conditions.push(eq(agentWorkflows.userId, userId));
  }

  const rows = await db
    .select()
    .from(agentWorkflows)
    .where(and(...conditions))
    .limit(1);

  if (rows.length === 0) return null;
  return mapWorkflowRow(rows[0]);
}

export async function getWorkflowMembers(workflowId: string): Promise<AgentWorkflowMember[]> {
  const rows = await db
    .select()
    .from(agentWorkflowMembers)
    .where(eq(agentWorkflowMembers.workflowId, workflowId))
    .orderBy(desc(agentWorkflowMembers.createdAt));
  return rows.map(mapWorkflowMemberRow);
}

export { getWorkflowResources } from "./workflow-resource-context";

/**
 * Returns all active workflows where the given agent is the initiator.
 */
export async function getWorkflowsForInitiator(
  userId: string,
  initiatorId: string
): Promise<AgentWorkflow[]> {
  const rows = await db
    .select()
    .from(agentWorkflows)
    .where(
      and(
        eq(agentWorkflows.userId, userId),
        eq(agentWorkflows.initiatorId, initiatorId),
        ne(agentWorkflows.status, "archived")
      )
    );
  return rows.map(mapWorkflowRow);
}

/**
 * Creates the auto-provisioned "System Specialists" workflow.
 * Skips the "agent not in active workflow" guard used by createManualWorkflow,
 * since system provisioning is automatic and non-destructive.
 */
export async function createSystemAgentWorkflow(input: {
  userId: string;
  initiatorId: string;
  subAgentIds: string[];
  name: string;
}): Promise<AgentWorkflow> {
  const uniqueSubAgentIds = Array.from(
    new Set(input.subAgentIds.filter((id) => id !== input.initiatorId))
  );

  const sharedResources = await buildSharedResourcesSnapshot({
    initiatorId: input.initiatorId,
  });

  const [workflowRow] = await db
    .insert(agentWorkflows)
    .values({
      userId: input.userId,
      name: input.name,
      initiatorId: input.initiatorId,
      status: "active",
      metadata: {
        source: "system-agents",
        sharedResources,
      },
    })
    .returning();

  await addWorkflowMembers({
    workflowId: workflowRow.id,
    members: [
      { workflowId: workflowRow.id, agentId: input.initiatorId, role: "initiator" },
      ...uniqueSubAgentIds.map((agentId) => ({
        workflowId: workflowRow.id,
        agentId,
        role: "subagent" as const,
      })),
    ],
  });

  if (uniqueSubAgentIds.length > 0) {
    await syncSharedFoldersToSubAgents({
      userId: input.userId,
      initiatorId: input.initiatorId,
      subAgentIds: uniqueSubAgentIds,
      workflowId: workflowRow.id,
    });
    await refreshWorkflowSharedResources(workflowRow.id, input.initiatorId);
  }

  return mapWorkflowRow(workflowRow);
}
