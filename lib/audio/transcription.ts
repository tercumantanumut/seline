import { loadSettings } from "@/lib/settings/settings-manager";

export interface TranscriptionResult {
  text: string;
  provider: string;
  durationSeconds?: number;
  language?: string;
}

/**
 * Transcribe an audio buffer using the configured STT provider.
 * Uses OpenAI Whisper API by default (compatible with OpenRouter).
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  filename?: string
): Promise<TranscriptionResult> {
  const settings = loadSettings();

  if (!settings.sttEnabled) {
    throw new Error("Speech-to-text is disabled in settings");
  }

  const provider = settings.sttProvider || "openai";

  if (provider === "openai") {
    return transcribeWithOpenAI(audio, mimeType, filename);
  }

  throw new Error(`Unsupported STT provider: ${provider}`);
}

async function transcribeWithOpenAI(
  audio: Buffer,
  mimeType: string,
  filename?: string
): Promise<TranscriptionResult> {
  const settings = loadSettings();
  const apiKey = process.env.OPENAI_API_KEY || settings.openrouterApiKey;
  if (!apiKey) {
    throw new Error("No OpenAI or OpenRouter API key configured for transcription");
  }

  // OpenRouter doesn't support audio transcription directly, use OpenAI
  const baseUrl = process.env.OPENAI_API_KEY
    ? "https://api.openai.com/v1"
    : "https://api.openai.com/v1"; // Whisper is only on OpenAI direct

  // If only OpenRouter key, we can still try — some users have OpenAI key in env
  const effectiveKey = process.env.OPENAI_API_KEY || apiKey;

  const extension = getExtensionForMimeType(mimeType);
  const effectiveFilename = filename || `audio.${extension}`;

  const formData = new FormData();
  // Convert Buffer to plain ArrayBuffer to satisfy BlobPart typing
  const uint8 = new Uint8Array(audio);
  const blob = new Blob([uint8 as BlobPart], { type: mimeType });
  formData.append("file", blob, effectiveFilename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as {
    text: string;
    duration?: number;
    language?: string;
  };

  console.log(
    `[STT] Transcribed audio (${result.duration?.toFixed(1)}s) via OpenAI Whisper`
  );

  return {
    text: result.text,
    provider: "openai",
    durationSeconds: result.duration,
    language: result.language,
  };
}

function getExtensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/opus": "opus",
    "audio/aac": "aac",
  };
  return map[mimeType] || "ogg";
}

/**
 * Check if audio transcription is available.
 */
export function isTranscriptionAvailable(): boolean {
  const settings = loadSettings();
  if (!settings.sttEnabled) return false;
  return !!(process.env.OPENAI_API_KEY || settings.openrouterApiKey);
}

/**
 * Detect if a MIME type represents an audio file.
 */
export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith("audio/") || mimeType === "application/ogg";
}
