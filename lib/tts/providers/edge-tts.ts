import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { TTSOptions, TTSProvider, TTSResult } from "../types";
import { DEFAULT_EDGE_TTS_VOICE } from "../edge-tts-voices";

export class EdgeTTSProvider implements TTSProvider {
  name = "edge";

  isAvailable(): boolean {
    return true; // Edge TTS is always available (free, no API key)
  }

  async synthesize(options: TTSOptions): Promise<TTSResult> {
    const { EdgeTTS } = await import("node-edge-tts");

    // Resolve voice: explicit param > user setting > default
    let voice = options.voice;
    if (!voice) {
      try {
        const { loadSettings } = await import("@/lib/settings/settings-manager");
        const settings = loadSettings();
        voice = settings.edgeTtsVoice || DEFAULT_EDGE_TTS_VOICE;
      } catch {
        voice = DEFAULT_EDGE_TTS_VOICE;
      }
    }
    const rate = options.speed ? `${((options.speed - 1) * 100).toFixed(0)}%` : undefined;

    const tts = new EdgeTTS({
      voice,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: rate || undefined,
    });

    // Write to a temporary file, then read into buffer
    const tempPath = join(tmpdir(), `selene-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

    try {
      await tts.ttsPromise(options.text, tempPath);
      const audio = readFileSync(tempPath);

      return {
        audio,
        mimeType: "audio/mpeg",
      };
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
