import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser, getAgentDocumentById, listAgentDocumentsForCharacter, createAgentDocument, createAgentDocumentChunks, deleteAgentDocument, deleteAgentDocumentChunksByDocumentId, updateAgentDocument } from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";
import { saveDocumentFile } from "@/lib/storage/local-storage";
import { extractTextFromDocument } from "@/lib/documents/parser";
import { chunkText } from "@/lib/documents/chunking";
import { indexAgentDocumentEmbeddings } from "@/lib/documents/embeddings";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import type { NewAgentDocumentChunk } from "@/lib/db/sqlite-schema";
import { DocumentProcessingError } from "@/lib/documents/errors";

// Route params type (Next.js App Router with async params)
type RouteParams = { params: Promise<{ id: string }> };
const MAX_DOCUMENT_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024; // 1 MB
const MAX_DOCUMENT_UPLOAD_MB = Math.floor(MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024));

const uploadMetadataSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  // Flexible tags input: either comma-separated string, JSON string array, or repeated form field
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

function parseTags(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;

  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // Try JSON array first
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // Fallback to comma-separated list
    }

    return trimmed.split(",").map((v) => v.trim()).filter(Boolean);
  }

  return undefined;
}

function documentTooLargeResponse() {
  return NextResponse.json(
    { error: `File is too large. Max upload size is ${MAX_DOCUMENT_UPLOAD_MB}MB.` },
    { status: 413 }
  );
}

// GET - List documents for a specific agent
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId } = await params;

    const character = await getCharacter(characterId);
    if (!character || character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const documents = await listAgentDocumentsForCharacter(dbUser.id, characterId);

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("List agent documents error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list documents" },
      { status: 500 }
    );
  }
}

// POST - Upload and index a new document for an agent (PDF/text/Markdown/HTML)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId } = await params;

    const character = await getCharacter(characterId);
    if (!character || character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "multipart/form-data is required for document upload" },
        { status: 400 }
      );
    }

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_DOCUMENT_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
      ) {
        return documentTooLargeResponse();
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      return documentTooLargeResponse();
    }

    // Collect metadata fields
    const metadataInput = {
      title: (formData.get("title") as string | null) ?? undefined,
      description: (formData.get("description") as string | null) ?? undefined,
      // Prefer repeated "tags" fields if present, otherwise single value
      tags:
        formData.getAll("tags").length > 0
          ? (formData.getAll("tags") as string[])
          : ((formData.get("tags") as string | null) ?? undefined),
    };

    const parsedMetadata = uploadMetadataSchema.safeParse(metadataInput);
    if (!parsedMetadata.success) {
      return NextResponse.json(
        { error: "Invalid metadata", details: parsedMetadata.error.flatten() },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Persist document file under a stable, agent-scoped path
    const stored = await saveDocumentFile(buffer, dbUser.id, characterId, file.name);

    // Extract normalized text content and any structural metadata (e.g. page count)
    const parsed = await extractTextFromDocument(buffer, file.type || "application/octet-stream", file.name);

    const tags = parseTags(parsedMetadata.data.tags) ?? [];

	    const document = await createAgentDocument({
      userId: dbUser.id,
      characterId,
      originalFilename: file.name,
      contentType: file.type || "application/octet-stream",
      extension: stored.extension,
      storagePath: stored.localPath,
      sizeBytes: file.size,
      title: parsedMetadata.data.title,
      description: parsedMetadata.data.description,
      pageCount: parsed.pageCount,
      sourceType: "upload",
      tags,
      metadata: {},
      status: "pending",
    });

    // Chunk the extracted text for later embedding/search
    const { maxChunksPerFile } = getVectorSearchConfig();
    const chunks = chunkText(parsed.text, {
      maxChunks: maxChunksPerFile > 0 ? maxChunksPerFile : undefined,
    });
    const chunkRows: NewAgentDocumentChunk[] = chunks.map((chunk) => ({
      documentId: document.id,
      userId: dbUser.id,
      characterId,
      chunkIndex: chunk.index,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      embedding: null,
      embeddingModel: null,
      embeddingDimensions: null,
    }));

	    if (chunkRows.length > 0) {
	      await createAgentDocumentChunks(chunkRows);
	    }

	    // Compute embeddings and mark the document as ready for semantic search.
	    let embeddedChunkCount = 0;
	    try {
	      const result = await indexAgentDocumentEmbeddings({
	        documentId: document.id,
	        userId: dbUser.id,
	      });
	      embeddedChunkCount = result.embeddedChunkCount;
	      // Document status updated to "ready" by indexAgentDocumentEmbeddings
	    } catch (error) {
	      // On error: update document to "failed" with error message
	      console.error("Document processing error:", error);

	      let errorMessage = "Failed to process document";
	      let errorCode: string | undefined;
	      let suggestedAction: string | undefined;

	      if (error instanceof DocumentProcessingError) {
	        errorMessage = error.message;
	        errorCode = error.code;
	        suggestedAction = error.suggestedAction;
	      } else if (error instanceof Error) {
	        errorMessage = error.message;
	      }

	      await updateAgentDocument(document.id, dbUser.id, {
	        status: "failed",
	        errorMessage,
	      });

	      // Return the failed document (still 201 - document was created)
	      const failedDoc = await getAgentDocumentById(document.id, dbUser.id);
	      return NextResponse.json(
	        {
	          document: failedDoc ?? document,
	          chunkCount: chunkRows.length,
	          embeddedChunkCount: 0,
	          error: errorMessage,
	          errorCode,
	          suggestedAction,
	        },
	        { status: 201 } // 201 = created, just failed to process
	      );
	    }

	    // Success path
	    const refreshed = await getAgentDocumentById(document.id, dbUser.id);

	    return NextResponse.json(
	      {
	        document: refreshed ?? document,
	        chunkCount: chunkRows.length,
	        embeddedChunkCount,
	      },
	      { status: 201 },
	    );
  } catch (error) {
    console.error("Upload agent document error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload document" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a document and its chunks for an agent
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId } = await params;

    const character = await getCharacter(characterId);
    if (!character || character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ error: "documentId query parameter is required" }, { status: 400 });
    }

    const existing = await getAgentDocumentById(documentId, dbUser.id);
    if (!existing || existing.characterId !== characterId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete chunks explicitly (in addition to ON DELETE CASCADE) to be safe
    await deleteAgentDocumentChunksByDocumentId(documentId, dbUser.id);
    await deleteAgentDocument(documentId, dbUser.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete agent document error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete document" },
      { status: 500 }
    );
  }
}

