import { loadSettings } from "@/lib/settings/settings-manager";
import type { TTSOptions, TTSProvider, TTSResult } from "../types";

export class ElevenLabsTTSProvider implements TTSProvider {
  name = "elevenlabs";

  isAvailable(): boolean {
    const settings = loadSettings();
    return !!settings.elevenLabsApiKey;
  }

  async synthesize(options: TTSOptions): Promise<TTSResult> {
    const settings = loadSettings();
    const apiKey = settings.elevenLabsApiKey;
    if (!apiKey) {
      throw new Error("No ElevenLabs API key configured");
    }

    const voiceId = options.voice || settings.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel default

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: options.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: options.speed ?? 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS API error ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      mimeType: "audio/mpeg",
    };
  }
}
