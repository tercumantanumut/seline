import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFiles } from "@/lib/db/sqlite-character-schema";
import { eq, like, and } from "drizzle-orm";

/**
 * GET /api/files/search?characterId=xxx&query=filename&limit=20
 *
 * Search synced files for @ mention autocomplete in the chat composer.
 * Returns matching file paths sorted by relevance.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get("characterId");
    const query = searchParams.get("query") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    if (!characterId) {
      return NextResponse.json(
        { error: "characterId is required" },
        { status: 400 }
      );
    }

    // Query agentSyncFiles with fuzzy match on relativePath
    const files = await db
      .select({
        relativePath: agentSyncFiles.relativePath,
        filePath: agentSyncFiles.filePath,
      })
      .from(agentSyncFiles)
      .where(
        query
          ? and(
              eq(agentSyncFiles.characterId, characterId),
              like(agentSyncFiles.relativePath, `%${query}%`)
            )
          : eq(agentSyncFiles.characterId, characterId)
      )
      .limit(limit);

    return NextResponse.json({ files });
  } catch (error) {
    console.error("[files/search] Error:", error);
    return NextResponse.json(
      { error: "Failed to search files" },
      { status: 500 }
    );
  }
}
