import { loadSettings } from "@/lib/settings/settings-manager";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TTSOptions, TTSProvider, TTSResult } from "./types";
import { EdgeTTSProvider } from "./providers/edge-tts";
import { OpenAITTSProvider } from "./providers/openai-tts";
import { ElevenLabsTTSProvider } from "./providers/elevenlabs";

const providers: Record<string, TTSProvider> = {
  edge: new EdgeTTSProvider(),
  openai: new OpenAITTSProvider(),
  elevenlabs: new ElevenLabsTTSProvider(),
};

/**
 * Get the ordered fallback chain of TTS providers.
 * Primary provider from settings is tried first, then fallbacks.
 */
function getProviderChain(): TTSProvider[] {
  const settings = loadSettings();
  const primary = settings.ttsProvider || "edge";
  const chain: TTSProvider[] = [];

  // Primary first
  if (providers[primary]) {
    chain.push(providers[primary]);
  }

  // Then fallbacks in order: elevenlabs → openai → edge
  const fallbackOrder = ["elevenlabs", "openai", "edge"];
  for (const name of fallbackOrder) {
    if (name !== primary && providers[name]) {
      chain.push(providers[name]);
    }
  }

  return chain;
}

/**
 * Synthesize text to speech using the configured provider chain.
 * Tries each provider in order until one succeeds.
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResult> {
  const chain = getProviderChain();
  let lastError: Error | null = null;

  for (const provider of chain) {
    if (!provider.isAvailable()) {
      continue;
    }

    try {
      const result = await provider.synthesize(options);
      console.log(`[TTS] Synthesized ${options.text.length} chars via ${provider.name}`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[TTS] Provider ${provider.name} failed:`, lastError.message);
    }
  }

  throw lastError || new Error("No TTS provider available");
}

/**
 * Check if TTS is enabled and at least one provider is available.
 */
export function isTTSAvailable(): boolean {
  const settings = loadSettings();
  if (!settings.ttsEnabled) return false;
  return getProviderChain().some((p) => p.isAvailable());
}

/**
 * Check if text exceeds the TTS summarization threshold.
 */
export function shouldSummarizeForTTS(text: string): boolean {
  const settings = loadSettings();
  const threshold = settings.ttsSummarizeThreshold ?? 1500;
  return text.length > threshold;
}

/**
 * Summarize long text for TTS using the configured utility model.
 * Falls back to crude truncation if the LLM call fails or times out.
 *
 * Inspired by OpenClaw's `summarizeText()` in tts.ts — uses a fast model
 * to condense replies while preserving tone and key information.
 */
export async function summarizeForTTS(text: string): Promise<string> {
  const settings = loadSettings();
  const threshold = settings.ttsSummarizeThreshold ?? 1500;

  if (text.length <= threshold) {
    return text;
  }

  try {
    // Dynamic import to avoid circular deps and keep TTS module lightweight
    const { generateText } = await import("ai");
    const { getUtilityModel } = await import("@/lib/ai/providers");

    const model = getUtilityModel();
    if (!model) {
      // No utility model configured — fall back to truncation
      console.warn("[TTS] No utility model for summarization, truncating");
      return text.slice(0, threshold - 3) + "...";
    }

    const { text: summary } = await generateText({
      model,
      prompt:
        `You are a concise summarizer. Summarize the following text to approximately ${threshold} characters. ` +
        `Maintain the original tone and style. Reply only with the summary, no extra commentary.\n\n` +
        `<text>\n${text}\n</text>`,
      maxOutputTokens: Math.ceil(threshold / 2),
      temperature: 0.3,
      abortSignal: AbortSignal.timeout(15000),
    });

    if (!summary || summary.trim().length === 0) {
      throw new Error("Empty summary returned");
    }

    console.log(`[TTS] Summarized ${text.length} chars → ${summary.trim().length} chars`);
    return summary.trim();
  } catch (error) {
    console.warn("[TTS] Summarization failed, truncating:", error instanceof Error ? error.message : error);
    return text.slice(0, threshold - 3) + "...";
  }
}

/**
 * Convert audio buffer to the optimal format for a given channel.
 * Telegram voice notes require OGG/Opus for the round voice bubble UX.
 * Falls back to returning the original audio if conversion fails.
 */
export function getAudioForChannel(
  audio: Buffer,
  mimeType: string,
  channelType: string
): { audio: Buffer; mimeType: string; extension: string } {
  if (channelType === "telegram") {
    // If already OGG/Opus, return as-is
    if (mimeType === "audio/ogg" || mimeType === "audio/opus") {
      return { audio, mimeType: "audio/ogg", extension: "ogg" };
    }

    // Try to convert MP3 → OGG/Opus using ffmpeg for Telegram voice bubble
    try {
      const converted = convertToOpus(audio);
      console.log(`[TTS] Converted ${mimeType} to OGG/Opus for Telegram voice bubble`);
      return { audio: converted, mimeType: "audio/ogg", extension: "ogg" };
    } catch (error) {
      // ffmpeg not available or conversion failed — send MP3 as-is
      // Telegram will accept it but show as regular audio (no round bubble)
      console.warn(`[TTS] OGG/Opus conversion failed, sending MP3:`, error instanceof Error ? error.message : error);
      return { audio, mimeType, extension: "mp3" };
    }
  }

  return { audio, mimeType, extension: "mp3" };
}

/**
 * Convert audio buffer to OGG/Opus format using ffmpeg.
 * Throws if ffmpeg is not installed or conversion fails.
 */
function convertToOpus(inputAudio: Buffer): Buffer {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn = join(tmpdir(), `seline-tts-in-${id}.mp3`);
  const tmpOut = join(tmpdir(), `seline-tts-out-${id}.ogg`);

  try {
    writeFileSync(tmpIn, inputAudio);
    execFileSync("ffmpeg", [
      "-y", "-i", tmpIn,
      "-c:a", "libopus",
      "-b:a", "48k",
      "-vbr", "on",
      "-application", "voip",
      tmpOut,
    ], { timeout: 15000, stdio: "pipe" });
    return readFileSync(tmpOut);
  } finally {
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpOut); } catch {}
  }
}
