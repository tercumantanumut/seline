import { NextRequest, NextResponse } from "next/server";
import { findEdgeTTSVoice, DEFAULT_EDGE_TTS_VOICE } from "@/lib/tts/edge-tts-voices";

/**
 * GET /api/tts/preview?voice=en-US-AriaNeural
 *
 * Synthesizes a short sample sentence with the given Edge TTS voice
 * and returns the audio as audio/mpeg.
 */
export async function GET(request: NextRequest) {
  const voiceId = request.nextUrl.searchParams.get("voice") || DEFAULT_EDGE_TTS_VOICE;

  const voiceInfo = findEdgeTTSVoice(voiceId);
  if (!voiceInfo) {
    return NextResponse.json({ error: "Unknown voice" }, { status: 400 });
  }

  // Short, natural sample text
  const sampleText = "Hello! I'm your AI assistant. How can I help you today?";

  try {
    const { EdgeTTS } = await import("node-edge-tts");
    const { readFileSync, unlinkSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const tts = new EdgeTTS({
      voice: voiceId,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });

    const tempPath = join(tmpdir(), `seline-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

    try {
      await tts.ttsPromise(sampleText, tempPath);
      const audio = readFileSync(tempPath);

      return new NextResponse(audio, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audio.length),
          "Cache-Control": "public, max-age=86400", // cache 24h — same voice = same audio
        },
      });
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `TTS preview failed: ${message}` }, { status: 500 });
  }
}
