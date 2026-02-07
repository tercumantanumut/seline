import { loadSettings } from "@/lib/settings/settings-manager";
import type { TTSOptions, TTSProvider, TTSResult } from "../types";

export class OpenAITTSProvider implements TTSProvider {
  name = "openai";

  isAvailable(): boolean {
    const settings = loadSettings();
    // OpenAI TTS works with direct OpenAI key or OpenRouter key (openai-compatible)
    return !!(settings.openaiApiKey || process.env.OPENAI_API_KEY || settings.openrouterApiKey);
  }

  async synthesize(options: TTSOptions): Promise<TTSResult> {
    const settings = loadSettings();
    // Priority: settings.openaiApiKey > env OPENAI_API_KEY > settings.openrouterApiKey
    const openaiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
    const apiKey = openaiKey || settings.openrouterApiKey;
    if (!apiKey) {
      throw new Error("No OpenAI or OpenRouter API key configured for TTS");
    }

    const baseUrl = openaiKey
      ? "https://api.openai.com/v1"
      : "https://openrouter.ai/api/v1";

    const model = settings.openaiTtsModel || "gpt-4o-mini-tts";
    const voice = options.voice || settings.openaiTtsVoice || "alloy";

    // Request Opus natively for Telegram (avoids ffmpeg conversion step)
    const wantsOpus = options.channelHint === "telegram";
    const responseFormat = wantsOpus ? "opus" : "mp3";

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: options.text,
        voice,
        speed: options.speed ?? 1.0,
        response_format: responseFormat,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS API error ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      mimeType: wantsOpus ? "audio/ogg" : "audio/mpeg",
    };
  }
}
