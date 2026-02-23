import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  agentWorkflows,
  agentWorkflowMembers,
} from "@/lib/db/sqlite-workflows-schema";
import { agentSyncFolders } from "@/lib/db/sqlite-character-schema";
import { notifyFolderChange } from "@/lib/vectordb/folder-events";

export interface SyncSharedFoldersInput {
  userId: string;
  initiatorId: string;
  subAgentIds: string[];
  workflowId: string;
  dryRun?: boolean;
}

/**
 * Sync initiator-owned folders to all workflow subagents.
 */
export async function syncSharedFoldersToSubAgents(
  input: SyncSharedFoldersInput
): Promise<{ syncedCount: number; skippedCount: number; syncedByAgent: Record<string, number> }> {
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
 * Share a member's own folders with other members.
 */
export async function syncOwnFoldersToWorkflowMembers(input: {
  userId: string;
  sourceAgentId: string;
  targetAgentIds: string[];
  workflowId: string;
  dryRun?: boolean;
}): Promise<{ syncedCount: number; skippedCount: number }> {
  if (input.targetAgentIds.length === 0) {
    return { syncedCount: 0, skippedCount: 0 };
  }

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

    const existingPaths = new Set(existingFolders.map((folder) => folder.folderPath));

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
 * Remove inherited folder copies when a member leaves.
 */
export async function cleanupInheritedFoldersOnRemoval(input: {
  workflowId: string;
  leavingAgentId: string;
  remainingMemberIds: string[];
}): Promise<void> {
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

      const affectedAgents = new Set(otherMembersInherited.map((row) => row.characterId));
      for (const agentId of affectedAgents) {
        const folderIds = otherMembersInherited
          .filter((row) => row.characterId === agentId)
          .map((row) => row.id);
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
  const subAgentIds = members.filter((member) => member.role === "subagent").map((member) => member.agentId);
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
