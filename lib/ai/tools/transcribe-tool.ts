/**
 * Transcribe Audio Tool
 *
 * Allows the LLM to transcribe audio when explicitly asked.
 * Primarily used when users ask to "transcribe", "what does this audio say", etc.
 */

import { tool, jsonSchema } from "ai";
import { isTranscriptionAvailable } from "@/lib/audio/transcription";

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

      const available = isTranscriptionAvailable();

      return {
        status: "success" as const,
        transcriptionAvailable: available,
        autoTranscribeEnabled: available,
        supportedFormats: ["ogg", "mp3", "m4a", "wav", "webm", "opus", "aac"],
        provider: available ? "openai-whisper" : "none",
        note: available
          ? "Audio attachments from WhatsApp, Telegram, Slack, and Discord voice notes are automatically transcribed and included as text in the conversation."
          : "Transcription is not configured. An OpenAI API key is required for Whisper transcription.",
      };
    },
  });
}
