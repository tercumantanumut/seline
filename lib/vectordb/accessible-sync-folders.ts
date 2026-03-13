import { and, eq, inArray, isNull } from "drizzle-orm";
import { getWorkflowByAgentId, getWorkflowMembers } from "@/lib/agents/workflows";
import { toObject } from "@/lib/agents/workflow-types";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders, characters } from "@/lib/db/sqlite-character-schema";
import { normalizeFolderPath } from "./path-validation";
import { getSyncFolders } from "./sync-folder-crud";

export type AccessibleSyncFolder = typeof agentSyncFolders.$inferSelect;

export async function getAccessibleSyncFolders(characterId: string): Promise<AccessibleSyncFolder[]> {
  const ownFolders = await getSyncFolders(characterId);

  const membership = await getWorkflowByAgentId(characterId);
  if (!membership) {
    return ownFolders;
  }

  const [characterRow] = await db
    .select({ metadata: characters.metadata })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const metadata = toObject(characterRow?.metadata);
  const sandbox = toObject(metadata.workflowSandboxPolicy);
  if (sandbox.allowSharedFolders === false) {
    return ownFolders;
  }

  const members = await getWorkflowMembers(membership.workflow.id);
  const otherMemberIds = members
    .map((member) => member.agentId)
    .filter((agentId) => agentId !== characterId);

  if (otherMemberIds.length === 0) {
    return ownFolders;
  }

  const sharedFolders = await db
    .select()
    .from(agentSyncFolders)
    .where(
      and(
        inArray(agentSyncFolders.characterId, otherMemberIds),
        isNull(agentSyncFolders.inheritedFromWorkflowId)
      )
    );

  const seenPaths = new Set(ownFolders.map((folder) => normalizeFolderPath(folder.folderPath)));
  const dedupedSharedFolders = sharedFolders.filter((folder) => {
    const normalizedPath = normalizeFolderPath(folder.folderPath);
    if (seenPaths.has(normalizedPath)) {
      return false;
    }
    seenPaths.add(normalizedPath);
    return true;
  });

  return [...ownFolders, ...dedupedSharedFolders];
}
