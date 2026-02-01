import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser, getAgentDocumentById, updateAgentDocument } from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";
import { indexAgentDocumentEmbeddings } from "@/lib/documents/embeddings";

type RouteParams = {
  params: Promise<{ id: string; documentId: string }>
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId, documentId } = await params;

    const character = await getCharacter(characterId);
    if (!character || character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const document = await getAgentDocumentById(documentId, dbUser.id);
    if (!document || document.characterId !== characterId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.status !== "failed") {
      return NextResponse.json(
        { error: "Only failed documents can be retried" },
        { status: 400 }
      );
    }

    // Reset to pending and clear error
    await updateAgentDocument(documentId, dbUser.id, {
      status: "pending",
      errorMessage: null,
    });

    // Retry embedding (chunks should still exist from first attempt)
    try {
      const result = await indexAgentDocumentEmbeddings({
        documentId,
        userId: dbUser.id,
      });

      const refreshed = await getAgentDocumentById(documentId, dbUser.id);
      return NextResponse.json({
        document: refreshed,
        embeddedChunkCount: result.embeddedChunkCount
      });
    } catch (error) {
      console.error("Retry document processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to retry processing";

      await updateAgentDocument(documentId, dbUser.id, {
        status: "failed",
        errorMessage,
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Retry document error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry document" },
      { status: 500 }
    );
  }
}
