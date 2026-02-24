/**
 * getWorkflowResources — assembles the WorkflowResourceContext for a given agent.
 * Extracted from workflows.ts to isolate the subagent-directory and sandbox-policy
 * query logic from the core CRUD operations.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  agentWorkflows,
  agentWorkflowMembers,
} from "@/lib/db/sqlite-workflows-schema";
import { characters } from "@/lib/db/sqlite-character-schema";
import { getActiveDelegationsForCharacter } from "@/lib/ai/tools/delegate-to-subagent-tool";
import {
  toObject,
  mapWorkflowRow,
  mapWorkflowMemberRow,
  buildWorkflowPromptContext,
  type WorkflowResourceContext,
  type WorkflowPromptContextInput,
} from "./workflow-types";

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

  const promptContextInput: WorkflowPromptContextInput = {
    workflowName: workflow.name,
    role: member.role,
    sharedPluginCount: sharedResources.pluginIds.length,
    sharedFolderCount: sharedResources.syncFolderIds.length,
    subagentDirectory,
    activeDelegations,
  };

  const promptContext = buildWorkflowPromptContext(promptContextInput);

  return {
    workflowId,
    role: member.role,
    sharedResources,
    policy,
    promptContext,
    promptContextInput,
  };
}
