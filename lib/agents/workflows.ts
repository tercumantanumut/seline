import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
import { getActiveDelegationsForCharacter } from "@/lib/ai/tools/delegate-to-subagent-tool";
import { notifyFolderChange } from "@/lib/vectordb/folder-events";

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
    source: "plugin-import" | "manual" | "system-agents";
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

export interface WorkflowPromptContextDelegation {
  delegationId: string;
  delegateAgent: string;
  task: string;
  running: boolean;
  elapsed: number;
}

export interface WorkflowPromptContextInput {
  workflowName: string;
  role: "initiator" | "subagent";
  sharedPluginCount: number;
  sharedFolderCount: number;
  subagentDirectory: string[];
  activeDelegations?: WorkflowPromptContextDelegation[];
}

export function buildWorkflowPromptContext(input: WorkflowPromptContextInput): string {
  const lines: string[] = [
    `Workflow: ${input.workflowName}`,
    `Role: ${input.role}`,
    `Shared plugins: ${input.sharedPluginCount}`,
    `Shared folders: ${input.sharedFolderCount}`,
    "Sub-agents:",
    ...(input.subagentDirectory.length > 0 ? input.subagentDirectory : ["- none"]),
    "",
    "Standard terms: workflow, initiator, subagent, delegationId, agentId, observe, continue, stop.",
  ];

  if (input.role === "initiator") {
    lines.push(
      "",
      "## Initiator / Orchestrator Contract",
      "- Delegate when work is multi-step, parallelizable, or requires specialized subagent purpose/capability.",
      "- Do work directly when the task is simple, single-step, or faster to complete in current context.",
      "- Choose target subagent from directory by explicit purpose match before starting delegation.",
      "- Required execution sequence: delegateToSubagent list -> start -> observe(waitSeconds) -> continue or stop.",
      "- Avoid duplicate work: if a delegation to the same subagent is already active, reuse it via observe/continue/stop.",
      "- Integrate and summarize subagent outputs back to the user with clear decisions and next actions.",
      "",
      "## Compatibility Mapping",
      "- run_in_background: start is background by default in Seline. For near-foreground behavior, call observe with waitSeconds (for example 30, 60, 600).",
      "- resume(agent_id): map to continue using delegationId (not agentId) to preserve delegation context.",
      "- max_turns: no strict delegation parameter today; include explicit turn/stop constraints inside task instructions when needed.",
      "- For long-running executeCommand jobs (for example npm install/build), prefer background: true and avoid tight status polling loops.",
      "- When waiting on background jobs, use paced observe/status checks (for example every 30-120s) or a sleep command (for example bash -lc 'sleep 45') between checks.",
    );

    const activeDelegations = input.activeDelegations ?? [];
    if (activeDelegations.length > 0) {
      lines.push(
        "",
        "Active delegations (reuse these; do not start duplicates to the same subagent):",
      );
      for (const del of activeDelegations) {
        const elapsed = Math.floor(del.elapsed / 1000);
        const status = del.running ? `running ${elapsed}s` : "settled";
        lines.push(`- ${del.delegationId}: "${del.delegateAgent}" - task: "${del.task}" (${status})`);
      }
    }
  } else {
    lines.push(
      "",
      "## Subagent / Executor Contract",
      "- Execute the initiator's delegated task precisely; keep scope tight unless clarification is required.",
      "- Return structured deliverables with sections: Summary, Findings, Evidence, Risks, Next Actions.",
      "- If data is missing or conflicting, explicitly escalate with what is missing and the minimum clarification needed.",
      "- Do not orchestrate further delegation unless the initiator explicitly requests it.",
      "- When blocked, provide a concise blocker report plus a concrete proposed path forward.",
    );
  }

  return lines.join("\n");
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
  const source = parsed.source === "manual"
    ? "manual"
    : parsed.source === "system-agents"
      ? "system-agents"
      : "plugin-import";
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
  /** When provided, collects all members' own (non-inherited) folders instead of just the initiator's. */
  workflowId?: string;
}): Promise<WorkflowSharedResources> {
  // Collect own (non-inherited) folder IDs from either just the initiator or all workflow members
  let syncFolderIds: string[];
  if (input.workflowId) {
    // Get all members of this workflow
    const memberRows = await db
      .select({ agentId: agentWorkflowMembers.agentId })
      .from(agentWorkflowMembers)
      .where(eq(agentWorkflowMembers.workflowId, input.workflowId));
    const memberIds = memberRows.map((m) => m.agentId);

    // Collect each member's own (non-inherited) folders
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
    // Initial creation: only the initiator's own folders
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

    for (const key of Object.keys(mcpServers)) {
      mcpServerNames.add(key);
    }

    for (const key of Object.keys(hooksMap)) {
      hookEvents.add(key);
    }
  }

  return {
    syncFolderIds,
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
  // Include all members' own folders in the shared resources snapshot
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

export async function getWorkflowResources(
  workflowId: string,
  agentId: string
): Promise<WorkflowResourceContext | null> {
  const [workflowRow, memberRow, agentRow, workflowMemberRows] = await Promise.all([
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
    db
      .select()
      .from(agentWorkflowMembers)
      .where(eq(agentWorkflowMembers.workflowId, workflowId)),
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

  const workflowMembers = workflowMemberRows.map(mapWorkflowMemberRow);
  const memberIds = workflowMembers.map((workflowMember) => workflowMember.agentId);

  const memberCharacterRows = memberIds.length
    ? await db
        .select({
          id: characters.id,
          name: characters.name,
          displayName: characters.displayName,
          tagline: characters.tagline,
        })
        .from(characters)
        .where(inArray(characters.id, memberIds))
    : [];

  const memberCharacterMap = new Map(
    memberCharacterRows.map((row) => [row.id, row]),
  );

  const subagentDirectory = workflowMembers
    .filter((workflowMember) => workflowMember.role === "subagent")
    .map((workflowMember) => {
      const charRow = memberCharacterMap.get(workflowMember.agentId);
      const agentName =
        charRow?.displayName ||
        charRow?.name ||
        workflowMember.agentId;
      const purpose =
        workflowMember.metadataSeed?.purpose ||
        charRow?.tagline ||
        "No purpose set";
      return `- ${agentName} (id: ${workflowMember.agentId}): ${purpose}`;
    });

  const activeDelegations =
    member.role === "initiator" ? getActiveDelegationsForCharacter(agentId) : [];

  const promptContext = buildWorkflowPromptContext({
    workflowName: workflow.name,
    role: member.role,
    sharedPluginCount: sharedResources.pluginIds.length,
    sharedFolderCount: sharedResources.syncFolderIds.length,
    subagentDirectory,
    activeDelegations,
  });

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
  // Only sync own (non-inherited) folders from the initiator to subagents
  const initiatorFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(
      and(
        eq(agentSyncFolders.characterId, input.initiatorId),
        isNull(agentSyncFolders.inheritedFromWorkflowId)
      )
    );

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
        const [inserted] = await db.insert(agentSyncFolders).values({
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
          inheritedFromWorkflowId: input.workflowId,
          inheritedFromAgentId: input.initiatorId,
        }).returning();

        if (inserted) {
          notifyFolderChange(subAgentId, { type: "added", folderId: inserted.id });
        }
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

/**
 * Share a new workflow member's own (non-inherited) sync folders to other workflow members.
 * Called when an agent with existing folders is added to a workflow so other members
 * can also access those folders.
 */
async function syncOwnFoldersToWorkflowMembers(input: {
  userId: string;
  sourceAgentId: string;
  targetAgentIds: string[];
  workflowId: string;
  dryRun?: boolean;
}): Promise<{ syncedCount: number; skippedCount: number }> {
  if (input.targetAgentIds.length === 0) {
    return { syncedCount: 0, skippedCount: 0 };
  }

  // Only share the source agent's own (non-inherited) folders
  const sourceFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(
      and(
        eq(agentSyncFolders.characterId, input.sourceAgentId),
        isNull(agentSyncFolders.inheritedFromWorkflowId)
      )
    );

  if (sourceFolders.length === 0) {
    return { syncedCount: 0, skippedCount: 0 };
  }

  let syncedCount = 0;
  let skippedCount = 0;

  for (const targetAgentId of input.targetAgentIds) {
    const existingFolders = await db
      .select({ folderPath: agentSyncFolders.folderPath })
      .from(agentSyncFolders)
      .where(eq(agentSyncFolders.characterId, targetAgentId));

    const existingPaths = new Set(existingFolders.map((f) => f.folderPath));

    for (const folder of sourceFolders) {
      if (existingPaths.has(folder.folderPath)) {
        skippedCount += 1;
        continue;
      }

      if (!input.dryRun) {
        const [inserted] = await db.insert(agentSyncFolders).values({
          userId: input.userId,
          characterId: targetAgentId,
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
          inheritedFromWorkflowId: input.workflowId,
          inheritedFromAgentId: input.sourceAgentId,
        }).returning();

        if (inserted) {
          notifyFolderChange(targetAgentId, { type: "added", folderId: inserted.id });
        }
      }

      existingPaths.add(folder.folderPath);
      syncedCount += 1;
    }
  }

  return { syncedCount, skippedCount };
}

/**
 * Remove inherited sync folders when a member leaves a workflow.
 * Cleans up in both directions:
 * 1. Removes folders the leaving agent inherited from others via this workflow.
 * 2. Removes folder copies that were shared from the leaving agent to other members.
 */
async function cleanupInheritedFoldersOnRemoval(input: {
  workflowId: string;
  leavingAgentId: string;
  remainingMemberIds: string[];
}): Promise<void> {
  // 1. Remove folders that the leaving agent inherited from this workflow
  const leavingAgentInherited = await db
    .select({ id: agentSyncFolders.id })
    .from(agentSyncFolders)
    .where(
      and(
        eq(agentSyncFolders.characterId, input.leavingAgentId),
        eq(agentSyncFolders.inheritedFromWorkflowId, input.workflowId)
      )
    );

  if (leavingAgentInherited.length > 0) {
    await db
      .delete(agentSyncFolders)
      .where(
        and(
          eq(agentSyncFolders.characterId, input.leavingAgentId),
          eq(agentSyncFolders.inheritedFromWorkflowId, input.workflowId)
        )
      );

    for (const { id } of leavingAgentInherited) {
      notifyFolderChange(input.leavingAgentId, { type: "removed", folderId: id, wasPrimary: false });
    }
  }

  // 2. Remove copies of the leaving agent's folders that were shared to other members
  if (input.remainingMemberIds.length > 0) {
    const otherMembersInherited = await db
      .select({ id: agentSyncFolders.id, characterId: agentSyncFolders.characterId })
      .from(agentSyncFolders)
      .where(
        and(
          inArray(agentSyncFolders.characterId, input.remainingMemberIds),
          eq(agentSyncFolders.inheritedFromWorkflowId, input.workflowId),
          eq(agentSyncFolders.inheritedFromAgentId, input.leavingAgentId)
        )
      );

    if (otherMembersInherited.length > 0) {
      await db
        .delete(agentSyncFolders)
        .where(
          and(
            inArray(agentSyncFolders.characterId, input.remainingMemberIds),
            eq(agentSyncFolders.inheritedFromWorkflowId, input.workflowId),
            eq(agentSyncFolders.inheritedFromAgentId, input.leavingAgentId)
          )
        );

      // Notify each affected agent
      const affectedAgents = new Set(otherMembersInherited.map((r) => r.characterId));
      for (const agentId of affectedAgents) {
        const folderIds = otherMembersInherited
          .filter((r) => r.characterId === agentId)
          .map((r) => r.id);
        for (const folderId of folderIds) {
          notifyFolderChange(agentId, { type: "removed", folderId, wasPrimary: false });
        }
      }
    }
  }
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
      // The folder's original owner is tracked via characterId on the source folder record
      const sourceAgentId = folder.inheritedFromAgentId ?? folder.characterId;
      const [inserted] = await db.insert(agentSyncFolders).values({
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
        inheritedFromWorkflowId: input.workflowId,
        inheritedFromAgentId: sourceAgentId,
      }).returning();

      if (inserted) {
        notifyFolderChange(subAgentId, { type: "added", folderId: inserted.id });
      }
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
