import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import {
  agentSyncFolders,
  characterImages,
  characters,
} from "@/lib/db/sqlite-character-schema";
import type { InferInsertModel } from "drizzle-orm";
import { agentPlugins } from "@/lib/db/sqlite-plugins-schema";
import {
  buildDuplicateCharacterName,
  buildDuplicateDisplayName,
  buildDuplicateMetadata,
} from "@/lib/characters/duplicate";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const [source] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (source.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const duplicated = await db.transaction(async (tx) => {
      const [newCharacter] = await tx
        .insert(characters)
        .values({
          userId: dbUser.id,
          name: buildDuplicateCharacterName(source.name),
          displayName: buildDuplicateDisplayName(source.displayName),
          tagline: source.tagline,
          status: "active",
          isDefault: false,
          metadata: buildDuplicateMetadata(source.metadata),
        })
        .returning();

      const sourceFolders = await tx
        .select()
        .from(agentSyncFolders)
        .where(eq(agentSyncFolders.characterId, id));

      if (sourceFolders.length > 0) {
        const duplicatedFolders: InferInsertModel<typeof agentSyncFolders>[] = sourceFolders.map((folder) => ({
          userId: dbUser.id,
          characterId: newCharacter.id,
          folderPath: folder.folderPath,
          displayName: folder.displayName,
          isPrimary: folder.isPrimary,
          recursive: folder.recursive,
          includeExtensions: folder.includeExtensions as string[],
          excludePatterns: folder.excludePatterns as string[],
          status: "pending",
          indexingMode: folder.indexingMode,
          syncMode: folder.syncMode,
          syncCadenceMinutes: folder.syncCadenceMinutes,
          fileTypeFilters: folder.fileTypeFilters as string[],
          maxFileSizeBytes: folder.maxFileSizeBytes,
          chunkPreset: folder.chunkPreset,
          chunkSizeOverride: folder.chunkSizeOverride,
          chunkOverlapOverride: folder.chunkOverlapOverride,
          reindexPolicy: folder.reindexPolicy,
          inheritedFromWorkflowId: null,
          inheritedFromAgentId: null,
        }));
        await tx.insert(agentSyncFolders).values(duplicatedFolders);
      }

      const sourcePluginAssignments = await tx
        .select()
        .from(agentPlugins)
        .where(and(eq(agentPlugins.agentId, id), eq(agentPlugins.enabled, true)));

      if (sourcePluginAssignments.length > 0) {
        await tx.insert(agentPlugins).values(
          sourcePluginAssignments.map((assignment) => ({
            agentId: newCharacter.id,
            pluginId: assignment.pluginId,
            workflowId: null,
            enabled: true,
          }))
        );
      }

      const sourceImages = await tx
        .select()
        .from(characterImages)
        .where(eq(characterImages.characterId, id));

      if (sourceImages.length > 0) {
        // Keep original localPath/url references: image row deletion currently does not delete files.
        await tx.insert(characterImages).values(
          sourceImages.map((image) => ({
            characterId: newCharacter.id,
            imageType: image.imageType,
            isPrimary: image.isPrimary,
            localPath: image.localPath,
            url: image.url,
            thumbnailUrl: image.thumbnailUrl,
            width: image.width,
            height: image.height,
            format: image.format,
            prompt: image.prompt,
            seed: image.seed,
            generationModel: image.generationModel,
            sortOrder: image.sortOrder,
            metadata: image.metadata,
          }))
        );
      }

      return newCharacter;
    });

    return NextResponse.json({ character: duplicated }, { status: 201 });
  } catch (error) {
    console.error("[Duplicate Agent] Error:", error);
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to duplicate agent" }, { status: 500 });
  }
}
