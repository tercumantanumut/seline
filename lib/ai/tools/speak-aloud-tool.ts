/**
 * Speak Aloud Tool
 *
 * Allows the LLM to explicitly synthesize text to speech.
 * The audio is saved to local storage and the URL is returned so the UI can auto-play it.
 */

import { tool, jsonSchema } from "ai";
import { synthesizeSpeech, isTTSAvailable } from "@/lib/tts/manager";
import { saveFile } from "@/lib/storage/local-storage";

interface SpeakAloudInput {
  text: string;
  voice?: string;
  speed?: number;
}

export function createSpeakAloudTool({ sessionId }: { sessionId: string }) {
  return tool({
    description: `Synthesize text to speech audio. Use when the user asks to "read aloud", "speak", or "say something". Returns an audio URL that the UI plays automatically.`,

    inputSchema: jsonSchema<SpeakAloudInput>({
      type: "object",
      title: "SpeakAloudInput",
      description: "Text to synthesize to speech",
      properties: {
        text: {
          type: "string",
          description: "The text to speak aloud. Keep concise for natural speech.",
        },
        voice: {
          type: "string",
          description: "Optional voice identifier (e.g., 'alloy', 'en-US-AriaNeural'). Omit to use the configured default.",
        },
        speed: {
          type: "number",
          description: "Speech speed multiplier (0.5 to 2.0). Default: 1.0.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    }),

    execute: async ({ text, voice, speed }: SpeakAloudInput) => {
      if (sessionId === "UNSCOPED") {
        return { status: "error" as const, error: "speakAloud requires an active session." };
      }

      if (!isTTSAvailable()) {
        return {
          status: "error" as const,
          error: "TTS is not available. Enable it in Settings → Voice & Audio.",
        };
      }

      if (!text || text.trim().length === 0) {
        return { status: "error" as const, error: "No text provided to speak." };
      }

      try {
        const result = await synthesizeSpeech({ text, voice, speed });

        // Determine file extension from mimeType
        const ext = result.mimeType === "audio/ogg" ? "ogg"
          : result.mimeType === "audio/opus" ? "opus"
          : "mp3";

        // Save audio to local storage so the UI can play it via URL
        const saved = await saveFile(
          result.audio,
          sessionId,
          `speak-${Date.now()}.${ext}`,
          "generated"
        );

        return {
          status: "success" as const,
          audioUrl: saved.url,
          mimeType: result.mimeType,
          audioSize: result.audio.length,
          textLength: text.length,
          message: `Generated ${(result.audio.length / 1024).toFixed(1)} KB of audio for ${text.length} characters.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: "error" as const, error: `TTS synthesis failed: ${message}` };
      }
    },
  });
}
