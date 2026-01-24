import { NextRequest, NextResponse } from "next/server";
import {
  addSyncFolder,
  getSyncFolders,
  removeSyncFolder,
  syncFolder,
  syncAllFolders,
  reindexAllFolders,
  reindexAllCharacters,
  forceCleanupStuckFolders,
  setPrimaryFolder,
} from "@/lib/vectordb/sync-service";
import { isVectorDBEnabled } from "@/lib/vectordb/client";
import { getSetting, updateSetting } from "@/lib/settings/settings-manager";

/**
 * GET /api/vector-sync?characterId=xxx
 * Get all sync folders for an agent
 */
export async function GET(request: NextRequest) {
  try {
    if (!isVectorDBEnabled()) {
      return NextResponse.json(
        { error: "Vector search is not enabled" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get("characterId");

    const folders = characterId
      ? await getSyncFolders(characterId)
      : await (await import("@/lib/vectordb/sync-service")).getAllSyncFolders();

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("[VectorSync] Error getting folders:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get folders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vector-sync
 * Add a new sync folder or trigger sync
 */
export async function POST(request: NextRequest) {
  try {
    if (!isVectorDBEnabled()) {
      return NextResponse.json(
        { error: "Vector search is not enabled" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action === "add") {
      const { characterId, folderPath, displayName, recursive, includeExtensions, excludePatterns, autoSync } = body;

      if (!characterId || !folderPath) {
        return NextResponse.json(
          { error: "characterId and folderPath are required" },
          { status: 400 }
        );
      }

      const userId = getSetting("localUserId");
      const folderId = await addSyncFolder({
        userId,
        characterId,
        folderPath,
        displayName,
        recursive: recursive ?? true,
        includeExtensions: includeExtensions ?? [".txt", ".md", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css"],
        excludePatterns: excludePatterns ?? ["node_modules", ".git", "dist", "build"],
      });

      // Auto-trigger sync in the background unless explicitly disabled
      // This runs async without blocking the response
      if (autoSync !== false) {
        syncFolder(folderId).catch(err => {
          console.error(`[VectorSync] Background sync failed for folder ${folderId}:`, err);
        });
      }

      return NextResponse.json({ folderId, success: true, syncStarted: autoSync !== false });
    }

    if (action === "sync") {
      const { folderId, characterId } = body;

      if (folderId) {
        const result = await syncFolder(folderId);
        return NextResponse.json({ result, success: true });
      }

      if (characterId) {
        const results = await syncAllFolders(characterId);
        return NextResponse.json({ results, success: true });
      }

      return NextResponse.json(
        { error: "folderId or characterId is required for sync" },
        { status: 400 }
      );
    }

    if (action === "reindex") {
      const { folderId, characterId } = body;

      if (characterId) {
        const results = await reindexAllFolders(characterId);
        return NextResponse.json({ results, success: true });
      }

      if (folderId) {
        const result = await syncFolder(folderId, {}, true);
        return NextResponse.json({ result, success: true });
      }

      return NextResponse.json(
        { error: "folderId or characterId is required for reindex" },
        { status: 400 }
      );
    }

    if (action === "reindex-all") {
      const results = await reindexAllCharacters();
      updateSetting("embeddingReindexRequired", false);
      return NextResponse.json({ results, success: true });
    }

    if (action === "cleanup") {
      // Force cleanup of all stuck syncing/pending folders
      const result = await forceCleanupStuckFolders();
      return NextResponse.json({
        success: true,
        syncingCleaned: result.syncingCleaned,
        pendingCleaned: result.pendingCleaned,
        message: `Cleaned ${result.syncingCleaned} syncing and ${result.pendingCleaned} pending folders`
      });
    }

    if (action === "set-primary") {
      const { folderId, characterId } = body;
      if (!folderId || !characterId) {
        return NextResponse.json(
          { error: "folderId and characterId are required" },
          { status: 400 }
        );
      }

      await setPrimaryFolder(folderId, characterId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'add', 'sync', 'reindex', 'reindex-all', or 'cleanup'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[VectorSync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vector-sync?folderId=xxx
 * Remove a sync folder
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!isVectorDBEnabled()) {
      return NextResponse.json(
        { error: "Vector search is not enabled" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required" },
        { status: 400 }
      );
    }

    await removeSyncFolder(folderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[VectorSync] Error removing folder:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove folder" },
      { status: 500 }
    );
  }
}

