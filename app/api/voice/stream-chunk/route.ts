import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { createSession, feedChunk, isVoskStreamingAvailable } from "@/lib/audio/vosk-session";

const MAX_CHUNK_BYTES = 5 * 1024 * 1024; // 5MB per chunk

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    if (!isVoskStreamingAvailable()) {
      return NextResponse.json(
        { error: "Vosk streaming is not available. Ensure vosk is installed, model is downloaded, and ffmpeg is available." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const chunk = formData.get("chunk");
    const sessionId = formData.get("sessionId");
    const isFirst = formData.get("isFirst");

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    if (!(chunk instanceof File)) {
      return NextResponse.json({ error: "chunk (audio blob) is required" }, { status: 400 });
    }

    if (chunk.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Chunk exceeds 5MB limit" }, { status: 400 });
    }

    // Create session on first chunk
    if (isFirst === "true") {
      createSession(sessionId);
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());
    const result = feedChunk(sessionId, buffer);

    return NextResponse.json({
      sessionId,
      partial: result.partial,
      text: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process audio chunk";
    console.error("[Voice API] stream-chunk failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
