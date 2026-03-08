import { NextResponse } from "next/server";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders, characters } from "@/lib/db/sqlite-character-schema";
import { eq, or } from "drizzle-orm";
import { isVectorDBEnabled } from "@/lib/vectordb/client";

export interface SyncStatusFolder {
  id: string;
  characterId: string;
  characterName: string | null;
  folderPath: string;
  displayName: string | null;
  status: "pending" | "syncing" | "synced" | "error" | "paused";
  fileCount: number | null;
  chunkCount: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface GlobalSyncStatus {
  isEnabled: boolean;
  isSyncing: boolean;
  activeSyncs: SyncStatusFolder[];
  pendingSyncs: SyncStatusFolder[];
  recentErrors: SyncStatusFolder[];
  totalFolders: number;
  totalSyncingOrPending: number;
}

/**
 * GET /api/sync-status
 * Returns the global sync status for the vector database
 */
export async function GET() {
  try {
    const isEnabled = isVectorDBEnabled();

    if (!isEnabled) {
      return NextResponse.json({
        isEnabled: false,
        isSyncing: false,
        activeSyncs: [],
        pendingSyncs: [],
        recentErrors: [],
        totalFolders: 0,
        totalSyncingOrPending: 0,
      } as GlobalSyncStatus);
    }

    // Get all folders with their character names
    const allFolders = await db
      .select({
        id: agentSyncFolders.id,
        characterId: agentSyncFolders.characterId,
        folderPath: agentSyncFolders.folderPath,
        displayName: agentSyncFolders.displayName,
        status: agentSyncFolders.status,
        fileCount: agentSyncFolders.fileCount,
        chunkCount: agentSyncFolders.chunkCount,
        lastSyncedAt: agentSyncFolders.lastSyncedAt,
        lastError: agentSyncFolders.lastError,
        characterName: characters.name,
      })
      .from(agentSyncFolders)
      .leftJoin(characters, eq(agentSyncFolders.characterId, characters.id));

    // Categorize folders
    const activeSyncs: SyncStatusFolder[] = [];
    const pendingSyncs: SyncStatusFolder[] = [];
    const recentErrors: SyncStatusFolder[] = [];

    for (const folder of allFolders) {
      const statusFolder: SyncStatusFolder = {
        id: folder.id,
        characterId: folder.characterId,
        characterName: folder.characterName,
        folderPath: folder.folderPath,
        displayName: folder.displayName,
        status: folder.status as SyncStatusFolder["status"],
        fileCount: folder.fileCount,
        chunkCount: folder.chunkCount,
        lastSyncedAt: folder.lastSyncedAt,
        lastError: folder.lastError,
      };

      if (folder.status === "syncing") {
        activeSyncs.push(statusFolder);
      } else if (folder.status === "pending") {
        pendingSyncs.push(statusFolder);
      } else if (folder.status === "error" || (folder.status === "paused" && folder.lastError)) {
        recentErrors.push(statusFolder);
      }
    }

    const response: GlobalSyncStatus = {
      isEnabled,
      isSyncing: activeSyncs.length > 0,
      activeSyncs,
      pendingSyncs,
      recentErrors,
      totalFolders: allFolders.length,
      totalSyncingOrPending: activeSyncs.length + pendingSyncs.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[SyncStatus] Error getting sync status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get sync status" },
      { status: 500 }
    );
  }
}
