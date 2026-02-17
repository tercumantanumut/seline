import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  agentWorkflows,
  agentWorkflowMembers,
  type AgentWorkflowMemberRow,
  type AgentWorkflowRow,
} from "@/lib/db/sqlite-workflows-schema";
import { agentSyncFolders, characters } from "@/lib/db/sqlite-character-schema";
import { agentPlugins, plugins } from "@/lib/db/sqlite-plugins-schema";
import { appendRunEvent, completeAgentRun, createAgentRun } from "@/lib/observability";

export type WorkflowStatus = "active" | "paused" | "archived";

export interface WorkflowSharedResources {
  syncFolderIds: string[];
  pluginIds: string[];
  mcpServerNames: string[];
  hookEvents: string[];
}

export interface AgentWorkflow {
  id: string;
  userId: string;
  name: string;
  initiatorId: string;
  status: WorkflowStatus;
  metadata: {
    source: "plugin-import" | "manual";
    pluginId?: string;
    pluginName?: string;
    pluginVersion?: string;
    idempotencyKey?: string;
    sharedResources: WorkflowSharedResources;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkflowMember {
  workflowId: string;
  agentId: string;
  role: "initiator" | "subagent";
  sourcePath?: string;
  metadataSeed?: {
    description?: string;
    purpose?: string;
    systemPromptSeed?: string;
    tags?: string[];
  };
}

export interface WorkflowMembershipContext {
  workflow: AgentWorkflow;
  member: AgentWorkflowMember;
}

export interface WorkflowResourceContext {
  workflowId: string;
  role: "initiator" | "subagent";
  sharedResources: WorkflowSharedResources;
  policy: {
    allowSharedFolders: boolean;
    allowSharedMcp: boolean;
    allowSharedHooks: boolean;
  };
  promptContext: string;
}

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

interface SyncSharedFoldersInput {
  userId: string;
  initiatorId: string;
  subAgentIds: string[];
  workflowId: string;
  dryRun?: boolean;
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

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseSharedResources(raw: unknown): WorkflowSharedResources {
  const parsed = toObject(raw);
  return {
    syncFolderIds: toStringArray(parsed.syncFolderIds),
    pluginIds: toStringArray(parsed.pluginIds),
    mcpServerNames: toStringArray(parsed.mcpServerNames),
    hookEvents: toStringArray(parsed.hookEvents),
  };
}

function parseWorkflowMetadata(raw: unknown): AgentWorkflow["metadata"] {
  const parsed = toObject(raw);
  const source = parsed.source === "manual" ? "manual" : "plugin-import";
  return {
    source,
    pluginId: typeof parsed.pluginId === "string" ? parsed.pluginId : undefined,
    pluginName: typeof parsed.pluginName === "string" ? parsed.pluginName : undefined,
    pluginVersion: typeof parsed.pluginVersion === "string" ? parsed.pluginVersion : undefined,
    idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : undefined,
    sharedResources: parseSharedResources(parsed.sharedResources),
  };
}

function parseMemberMetadataSeed(raw: unknown): AgentWorkflowMember["metadataSeed"] {
  const parsed = toObject(raw);
  const tags = toStringArray(parsed.tags);
  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    purpose: typeof parsed.purpose === "string" ? parsed.purpose : undefined,
    systemPromptSeed:
      typeof parsed.systemPromptSeed === "string" ? parsed.systemPromptSeed : undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function mapWorkflowRow(row: AgentWorkflowRow): AgentWorkflow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    initiatorId: row.initiatorId,
    status: row.status,
    metadata: parseWorkflowMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkflowMemberRow(row: AgentWorkflowMemberRow): AgentWorkflowMember {
  return {
    workflowId: row.workflowId,
    agentId: row.agentId,
    role: row.role,
    sourcePath: row.sourcePath ?? undefined,
    metadataSeed: parseMemberMetadataSeed(row.metadataSeed),
  };
}

async function buildSharedResourcesSnapshot(input: {
  initiatorId: string;
  seedPluginIds?: string[];
}): Promise<WorkflowSharedResources> {
  const [folders, pluginAssignments] = await Promise.all([
    db
      .select({ id: agentSyncFolders.id })
      .from(agentSyncFolders)
      .where(eq(agentSyncFolders.characterId, input.initiatorId)),
    db
      .select({ pluginId: agentPlugins.pluginId })
      .from(agentPlugins)
      .where(
        and(eq(agentPlugins.agentId, input.initiatorId), eq(agentPlugins.enabled, true))
      ),
  ]);

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

    for (const key of Object.keys(mcpServers)) {
      mcpServerNames.add(key);
    }

    for (const key of Object.keys(hooksMap)) {
      hookEvents.add(key);
    }
  }

  return {
    syncFolderIds: folders.map((folder) => folder.id),
    pluginIds,
    mcpServerNames: Array.from(mcpServerNames),
    hookEvents: Array.from(hookEvents),
  };
}

async function assertCharacterOwnedByUser(userId: string, agentId: string): Promise<void> {
  const row = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, agentId), eq(characters.userId, userId)))
    .limit(1);

  if (row.length === 0) {
    throw new Error("Agent not found");
  }
}

async function assertAgentNotInActiveWorkflow(
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

async function touchWorkflow(workflowId: string): Promise<void> {
  await db
    .update(agentWorkflows)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(agentWorkflows.id, workflowId));
}

async function refreshWorkflowSharedResources(
  workflowId: string,
  initiatorId: string
): Promise<void> {
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) return;

  const seedPluginIds = workflow.metadata.pluginId ? [workflow.metadata.pluginId] : [];
  const sharedResources = await buildSharedResourcesSnapshot({
    initiatorId,
    seedPluginIds,
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
    await syncSharedFoldersToSubAgents({
      userId: input.userId,
      initiatorId: input.initiatorId,
      subAgentIds: uniqueSubAgentIds,
      workflowId: workflowRow.id,
    });
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
    await syncSharedFoldersToSubAgents({
      userId: input.userId,
      initiatorId: workflow.initiatorId,
      subAgentIds: [input.agentId],
      workflowId: input.workflowId,
    });
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

export async function getWorkflowResources(
  workflowId: string,
  agentId: string
): Promise<WorkflowResourceContext | null> {
  const [workflowRow, memberRow, agentRow] = await Promise.all([
    db
      .select()
      .from(agentWorkflows)
      .where(eq(agentWorkflows.id, workflowId))
      .limit(1),
    db
      .select()
      .from(agentWorkflowMembers)
      .where(
        and(
          eq(agentWorkflowMembers.workflowId, workflowId),
          eq(agentWorkflowMembers.agentId, agentId)
        )
      )
      .limit(1),
    db
      .select({ metadata: characters.metadata })
      .from(characters)
      .where(eq(characters.id, agentId))
      .limit(1),
  ]);

  if (!workflowRow.length || !memberRow.length) return null;

  const workflow = mapWorkflowRow(workflowRow[0]);
  const member = mapWorkflowMemberRow(memberRow[0]);

  const metadata = toObject(agentRow[0]?.metadata);
  const sandbox = toObject(metadata.workflowSandboxPolicy);
  const policy = {
    allowSharedFolders: sandbox.allowSharedFolders !== false,
    allowSharedMcp: sandbox.allowSharedMcp !== false,
    allowSharedHooks: sandbox.allowSharedHooks !== false,
  };

  const sharedResources = {
    syncFolderIds: policy.allowSharedFolders
      ? workflow.metadata.sharedResources.syncFolderIds
      : [],
    pluginIds: workflow.metadata.sharedResources.pluginIds,
    mcpServerNames: policy.allowSharedMcp
      ? workflow.metadata.sharedResources.mcpServerNames
      : [],
    hookEvents: policy.allowSharedHooks
      ? workflow.metadata.sharedResources.hookEvents
      : [],
  };

  const promptContext = [
    `Workflow: ${workflow.name}`,
    `Role: ${member.role}`,
    `Shared plugins: ${sharedResources.pluginIds.length}`,
    `Shared folders: ${sharedResources.syncFolderIds.length}`,
  ].join(" | ");

  return {
    workflowId,
    role: member.role,
    sharedResources,
    policy,
    promptContext,
  };
}

export async function syncSharedFoldersToSubAgents(
  input: SyncSharedFoldersInput
): Promise<{ syncedCount: number; skippedCount: number; syncedByAgent: Record<string, number> }> {
  const initiatorFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(eq(agentSyncFolders.characterId, input.initiatorId));

  if (initiatorFolders.length === 0 || input.subAgentIds.length === 0) {
    return { syncedCount: 0, skippedCount: 0, syncedByAgent: {} };
  }

  let syncedCount = 0;
  let skippedCount = 0;
  const syncedByAgent: Record<string, number> = {};

  for (const subAgentId of input.subAgentIds) {
    const existingFolders = await db
      .select({ folderPath: agentSyncFolders.folderPath })
      .from(agentSyncFolders)
      .where(eq(agentSyncFolders.characterId, subAgentId));

    const existingPaths = new Set(existingFolders.map((folder) => folder.folderPath));
    let syncedForAgent = 0;

    for (const folder of initiatorFolders) {
      if (existingPaths.has(folder.folderPath)) {
        skippedCount += 1;
        continue;
      }

      if (!input.dryRun) {
        await db.insert(agentSyncFolders).values({
          userId: input.userId,
          characterId: subAgentId,
          folderPath: folder.folderPath,
          displayName: folder.displayName,
          isPrimary: false,
          recursive: folder.recursive,
          includeExtensions: folder.includeExtensions,
          excludePatterns: folder.excludePatterns,
          status: "pending",
          lastSyncedAt: null,
          lastError: null,
          fileCount: 0,
          chunkCount: 0,
          embeddingModel: folder.embeddingModel,
          indexingMode: folder.indexingMode,
          syncMode: folder.syncMode,
          syncCadenceMinutes: folder.syncCadenceMinutes,
          fileTypeFilters: folder.fileTypeFilters,
          maxFileSizeBytes: folder.maxFileSizeBytes,
          chunkPreset: folder.chunkPreset,
          chunkSizeOverride: folder.chunkSizeOverride,
          chunkOverlapOverride: folder.chunkOverlapOverride,
          reindexPolicy: folder.reindexPolicy,
          skippedCount: 0,
          skipReasons: {},
          lastRunMetadata: {},
          lastRunTrigger: null,
        });
      }

      existingPaths.add(folder.folderPath);
      syncedCount += 1;
      syncedForAgent += 1;
    }

    if (syncedForAgent > 0) {
      syncedByAgent[subAgentId] = syncedForAgent;
    }
  }

  if (!input.dryRun) {
    await db
      .update(agentWorkflows)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(agentWorkflows.id, input.workflowId));
  }

  return { syncedCount, skippedCount, syncedByAgent };
}

export async function shareFolderToWorkflowSubagents(input: {
  workflowId: string;
  folderId: string;
  userId: string;
  dryRun?: boolean;
}): Promise<{
  workflowId: string;
  folderId: string;
  subAgentIds: string[];
  syncedCount: number;
  skippedCount: number;
}> {
  const [workflowRow, folderRow, members] = await Promise.all([
    db
      .select()
      .from(agentWorkflows)
      .where(
        and(
          eq(agentWorkflows.id, input.workflowId),
          eq(agentWorkflows.userId, input.userId)
        )
      )
      .limit(1),
    db
      .select()
      .from(agentSyncFolders)
      .where(eq(agentSyncFolders.id, input.folderId))
      .limit(1),
    db
      .select({ agentId: agentWorkflowMembers.agentId, role: agentWorkflowMembers.role })
      .from(agentWorkflowMembers)
      .where(eq(agentWorkflowMembers.workflowId, input.workflowId)),
  ]);

  if (!workflowRow.length) {
    throw new Error("Workflow not found");
  }

  if (!folderRow.length) {
    throw new Error("Folder not found");
  }

  const folder = folderRow[0];
  const subAgentIds = members.filter((m) => m.role === "subagent").map((m) => m.agentId);
  let syncedCount = 0;
  let skippedCount = 0;

  for (const subAgentId of subAgentIds) {
    const existing = await db
      .select({ id: agentSyncFolders.id })
      .from(agentSyncFolders)
      .where(
        and(
          eq(agentSyncFolders.characterId, subAgentId),
          eq(agentSyncFolders.folderPath, folder.folderPath)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      skippedCount += 1;
      continue;
    }

    if (!input.dryRun) {
      await db.insert(agentSyncFolders).values({
        userId: input.userId,
        characterId: subAgentId,
        folderPath: folder.folderPath,
        displayName: folder.displayName,
        isPrimary: false,
        recursive: folder.recursive,
        includeExtensions: folder.includeExtensions,
        excludePatterns: folder.excludePatterns,
        status: "pending",
        lastSyncedAt: null,
        lastError: null,
        fileCount: 0,
        chunkCount: 0,
        embeddingModel: folder.embeddingModel,
        indexingMode: folder.indexingMode,
        syncMode: folder.syncMode,
        syncCadenceMinutes: folder.syncCadenceMinutes,
        fileTypeFilters: folder.fileTypeFilters,
        maxFileSizeBytes: folder.maxFileSizeBytes,
        chunkPreset: folder.chunkPreset,
        chunkSizeOverride: folder.chunkSizeOverride,
        chunkOverlapOverride: folder.chunkOverlapOverride,
        reindexPolicy: folder.reindexPolicy,
        skippedCount: 0,
        skipReasons: {},
        lastRunMetadata: {},
        lastRunTrigger: null,
      });
    }

    syncedCount += 1;
  }

  return {
    workflowId: input.workflowId,
    folderId: input.folderId,
    subAgentIds,
    syncedCount,
    skippedCount,
  };
}

export async function registerWorkflowSubagentLifecycle(input: {
  workflowId: string;
  userId: string;
  agentId: string;
  sessionId: string;
}): Promise<{
  workflowRunId: string;
  observeSubAgent: (data?: Record<string, unknown>) => Promise<void>;
  stopSubAgent: (status: "succeeded" | "failed" | "cancelled", data?: Record<string, unknown>) => Promise<void>;
  markTaskCompleted: (data?: Record<string, unknown>) => Promise<void>;
}> {
  const run = await createAgentRun({
    sessionId: input.sessionId,
    userId: input.userId,
    characterId: input.agentId,
    pipelineName: "workflow-subagent",
    triggerType: "tool",
    metadata: {
      workflowId: input.workflowId,
      agentId: input.agentId,
    },
  });

  await appendRunEvent({
    runId: run.id,
    eventType: "step_started",
    pipelineName: "workflow-subagent",
    stepName: "SubagentStart",
    data: {
      workflowId: input.workflowId,
      agentId: input.agentId,
    },
  });

  return {
    workflowRunId: run.id,
    observeSubAgent: async (data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "ObserveSubagent",
        data: data ?? {},
      });
    },
    stopSubAgent: async (status, data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: status === "failed" ? "step_failed" : "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "SubagentStop",
        level: status === "failed" ? "error" : "info",
        data: {
          status,
          ...(data ?? {}),
        },
      });
      await completeAgentRun(run.id, status, data ?? {});
    },
    markTaskCompleted: async (data) => {
      await appendRunEvent({
        runId: run.id,
        eventType: "step_completed",
        pipelineName: "workflow-subagent",
        stepName: "TaskCompleted",
        data: data ?? {},
      });
    },
  };
}
