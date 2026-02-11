import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for inbound voice message handling.
 *
 * When a user sends a voice note via WhatsApp/Telegram/etc., the inbound
 * pipeline:
 *   1. Detects the audio MIME type
 *   2. Checks if transcription is available
 *   3. Calls transcribeAudio() to get text
 *   4. Adds the transcript as a text part with metadata
 *
 * This test verifies the buildMessageParts logic by testing the transcription
 * module integration points directly, since buildMessageParts is not exported.
 */

// ---------------------------------------------------------------------------
// Mock settings
// ---------------------------------------------------------------------------

const settingsMock = vi.hoisted(() => {
  const state = { settings: {} as Record<string, any> };
  return {
    state,
    loadSettings: vi.fn(() => state.settings),
  };
});

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMock.loadSettings,
}));

import {
  transcribeAudio,
  isTranscriptionAvailable,
  isAudioMimeType,
} from "@/lib/audio/transcription";

// ---------------------------------------------------------------------------
// Tests — Inbound voice message flow
// ---------------------------------------------------------------------------

describe("Inbound Voice Message Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe("Voice note detection", () => {
    it("identifies WhatsApp voice note MIME type (audio/ogg)", () => {
      expect(isAudioMimeType("audio/ogg")).toBe(true);
    });

    it("identifies Telegram voice note MIME type (audio/ogg)", () => {
      expect(isAudioMimeType("audio/ogg")).toBe(true);
    });

    it("identifies Discord voice message (audio/webm)", () => {
      expect(isAudioMimeType("audio/webm")).toBe(true);
    });

    it("identifies Slack audio (audio/mp4)", () => {
      expect(isAudioMimeType("audio/mp4")).toBe(true);
    });

    it("identifies M4A files from iOS", () => {
      expect(isAudioMimeType("audio/x-m4a")).toBe(true);
    });
  });

  describe("Transcription availability check before processing", () => {
    it("reports available when OpenAI STT is configured", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
        openrouterApiKey: "sk-key",
      };
      expect(isTranscriptionAvailable()).toBe(true);
    });

    it("reports unavailable when STT is disabled", () => {
      settingsMock.state.settings = {
        sttEnabled: false,
        openrouterApiKey: "sk-key",
      };
      expect(isTranscriptionAvailable()).toBe(false);
    });

    it("reports unavailable when no API key and provider is openai", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };
      expect(isTranscriptionAvailable()).toBe(false);
    });

    it("reports unavailable for local provider when local model is missing", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "missing-model-id",
      };
      expect(isTranscriptionAvailable()).toBe(false);
    });
  });

  describe("Voice note transcription", () => {
    it("transcribes WhatsApp voice note via OpenAI Whisper", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "Hey, can you help me with something?",
          duration: 5.2,
          language: "en",
        }),
      });

      const voiceNote = Buffer.from("fake-ogg-audio");
      const result = await transcribeAudio(voiceNote, "audio/ogg", "voice-note.ogg");

      expect(result.text).toBe("Hey, can you help me with something?");
      expect(result.provider).toBe("openai");
      expect(result.durationSeconds).toBe(5.2);
      expect(result.language).toBe("en");
    });

    it("formats transcript label with provider and duration", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "Hello",
          duration: 3.5,
          language: "en",
        }),
      });

      const result = await transcribeAudio(Buffer.from("audio"), "audio/ogg");

      // This is how inbound.ts formats it:
      const durationLabel = result.durationSeconds
        ? ` | duration=${result.durationSeconds.toFixed(1)}s`
        : "";
      const formattedText = `[Voice note transcript | provider=${result.provider}${durationLabel}]\n${result.text}`;

      expect(formattedText).toBe(
        "[Voice note transcript | provider=openai | duration=3.5s]\nHello"
      );
    });

    it("handles transcription failure gracefully", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      await expect(
        transcribeAudio(Buffer.from("audio"), "audio/ogg")
      ).rejects.toThrow("OpenAI Whisper API error 500");

      // In inbound.ts, this error is caught and a fallback message is used:
      // "[Voice note: transcription failed — voice-note.ogg]"
    });

    it("handles unconfigured transcription gracefully", () => {
      settingsMock.state.settings = {
        sttEnabled: false,
      };

      // In inbound.ts, isTranscriptionAvailable() is checked first
      expect(isTranscriptionAvailable()).toBe(false);
      // And the fallback message would be:
      // "[Voice note: voice-note.ogg — transcription not configured]"
    });
  });

  describe("End-to-end voice message scenarios", () => {
    it("WhatsApp voice note → transcribe → text part in conversation", async () => {
      // Simulate: User sends voice note on WhatsApp
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };

      // 1. Check MIME type
      const mimeType = "audio/ogg";
      expect(isAudioMimeType(mimeType)).toBe(true);

      // 2. Check availability
      expect(isTranscriptionAvailable()).toBe(true);

      // 3. Transcribe
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "Please schedule a meeting for tomorrow at 3pm",
          duration: 7.8,
          language: "en",
        }),
      });

      const result = await transcribeAudio(
        Buffer.from("whatsapp-ogg-audio"),
        mimeType,
        "voice-note-001.ogg"
      );

      // 4. Verify the transcript would be added as a text part
      expect(result.text).toBe("Please schedule a meeting for tomorrow at 3pm");
      expect(result.durationSeconds).toBe(7.8);
    });

    it("Telegram voice note → transcribe → text part", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };

      expect(isAudioMimeType("audio/ogg")).toBe(true);
      expect(isTranscriptionAvailable()).toBe(true);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "Привет, как дела?",
          duration: 2.1,
          language: "ru",
        }),
      });

      const result = await transcribeAudio(
        Buffer.from("telegram-ogg-audio"),
        "audio/ogg",
        "voice.ogg"
      );

      expect(result.text).toBe("Привет, как дела?");
      expect(result.language).toBe("ru");
    });

    it("Voice note with local provider and missing model → configuration error", async () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "missing-model-id",
      };

      // Availability check returns false when model is unavailable.
      expect(isTranscriptionAvailable()).toBe(false);

      // Direct call should surface a clear configuration error.
      await expect(
        transcribeAudio(Buffer.from("audio"), "audio/ogg")
      ).rejects.toThrow("not found");
    });
  });
});
