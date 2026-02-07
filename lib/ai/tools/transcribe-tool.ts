/**
 * Transcribe Audio Tool
 *
 * Allows the LLM to transcribe audio when explicitly asked.
 * Primarily used when users ask to "transcribe", "what does this audio say", etc.
 */

import { tool, jsonSchema } from "ai";
import { isTranscriptionAvailable, isWhisperCppAvailable } from "@/lib/audio/transcription";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getWhisperModel } from "@/lib/config/whisper-models";

interface TranscribeInput {
  instruction: string;
}

export function createTranscribeTool({ sessionId }: { sessionId: string }) {
  return tool({
    description: `Check audio transcription status and capabilities. Use when the user asks about transcription settings or audio processing. Audio attachments in channel messages are automatically transcribed — this tool reports the current configuration.`,

    inputSchema: jsonSchema<TranscribeInput>({
      type: "object",
      title: "TranscribeInput",
      description: "Transcription query",
      properties: {
        instruction: {
          type: "string",
          description: "What the user wants to know about transcription capabilities.",
        },
      },
      required: ["instruction"],
      additionalProperties: false,
    }),

    execute: async ({ instruction }: TranscribeInput) => {
      if (sessionId === "UNSCOPED") {
        return { status: "error" as const, error: "transcribe requires an active session." };
      }

      const settings = loadSettings();
      const available = isTranscriptionAvailable();
      const isLocal = settings.sttProvider === "local";
      const localAvailable = isLocal ? isWhisperCppAvailable() : false;

      // Determine provider display name
      let providerName = "none";
      if (available) {
        providerName = isLocal ? "whisper.cpp" : "openai-whisper";
      }

      // Build contextual note
      let note: string;
      if (available) {
        const extra = isLocal
          ? ` Using local whisper.cpp (model: ${getWhisperModel(settings.sttLocalModel || "ggml-tiny.en")?.name || settings.sttLocalModel}).`
          : "";
        note = "Audio attachments from WhatsApp, Telegram, Slack, and Discord voice notes are automatically transcribed and included as text in the conversation." + extra;
      } else if (isLocal) {
        const modelId = settings.sttLocalModel || "ggml-tiny.en";
        const model = getWhisperModel(modelId);
        const hasBinary = !!findWhisperBinaryNote();
        if (!hasBinary) {
          note = `Local whisper.cpp selected but whisper-cli binary not found. Install with: brew install whisper-cpp`;
        } else {
          note = `Local whisper.cpp selected (model: ${model?.name || modelId}) but the model file is not downloaded. Download it in Settings → Voice & Audio.`;
        }
      } else {
        note = "Transcription is not configured. An OpenAI API key is required for Whisper transcription, or switch to local whisper.cpp.";
      }

      return {
        status: "success" as const,
        transcriptionAvailable: available,
        autoTranscribeEnabled: available,
        supportedFormats: ["ogg", "mp3", "m4a", "wav", "webm", "opus", "aac", "flac"],
        provider: providerName,
        localWhisperAvailable: localAvailable,
        note,
      };
    },
  });
}

/** Quick check for the binary without importing heavy modules */
function findWhisperBinaryNote(): boolean {
  try {
    const { existsSync } = require("node:fs");
    const paths = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"];
    return paths.some((p: string) => existsSync(p));
  } catch {
    return false;
  }
}
