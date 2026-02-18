import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { isAudioMimeType, transcribeAudio } from "@/lib/audio/transcription";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (!file.size) {
      return NextResponse.json({ error: "Uploaded audio file is empty" }, { status: 400 });
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file exceeds 25MB limit" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "audio/webm";
    if (!isAudioMimeType(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported audio format: ${mimeType || "unknown"}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribeAudio(buffer, mimeType, file.name || undefined);

    return NextResponse.json({
      success: true,
      text: result.text,
      provider: result.provider,
      durationSeconds: result.durationSeconds,
      language: result.language,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to transcribe audio";
    const status =
      message.includes("disabled") ||
      message.includes("No API key") ||
      message.includes("Unsupported STT provider")
        ? 400
        : 500;
    console.error("[Voice API] Transcribe failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
