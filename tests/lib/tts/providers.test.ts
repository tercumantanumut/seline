import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { OpenAITTSProvider } from "@/lib/tts/providers/openai-tts";
import { ElevenLabsTTSProvider } from "@/lib/tts/providers/elevenlabs";

// ---------------------------------------------------------------------------
// OpenAI TTS Provider
// ---------------------------------------------------------------------------

describe("OpenAITTSProvider", () => {
  const provider = new OpenAITTSProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    settingsMock.state.settings = {};
  });

  describe("isAvailable", () => {
    it("returns false with no API key", () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it("returns true with OpenRouter API key", () => {
      settingsMock.state.settings.openrouterApiKey = "sk-test";
      expect(provider.isAvailable()).toBe(true);
    });

    it("returns true with OPENAI_API_KEY env", () => {
      process.env.OPENAI_API_KEY = "sk-env";
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("synthesize", () => {
    it("throws when no API key is configured", async () => {
      await expect(
        provider.synthesize({ text: "Hello" })
      ).rejects.toThrow("No OpenAI or OpenRouter API key");
    });

    it("calls OpenAI TTS API with correct parameters", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {
        openaiTtsModel: "gpt-4o-mini-tts",
        openaiTtsVoice: "alloy",
      };

      const fakeAudio = new ArrayBuffer(100);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => fakeAudio,
      });

      const result = await provider.synthesize({ text: "Hello world" });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/speech",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test",
          }),
        })
      );

      // Verify the request body
      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe("gpt-4o-mini-tts");
      expect(body.voice).toBe("alloy");
      expect(body.input).toBe("Hello world");
      expect(body.response_format).toBe("mp3");

      expect(result.audio).toBeInstanceOf(Buffer);
      expect(result.mimeType).toBe("audio/mpeg");
    });

    it("requests Opus format for Telegram channel hint", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {};

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      const result = await provider.synthesize({
        text: "Hello",
        channelHint: "telegram",
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.response_format).toBe("opus");
      expect(result.mimeType).toBe("audio/ogg");
    });

    it("uses MP3 format for non-Telegram channels", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = {};

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      const result = await provider.synthesize({
        text: "Hello",
        channelHint: "whatsapp",
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.response_format).toBe("mp3");
      expect(result.mimeType).toBe("audio/mpeg");
    });

    it("uses custom voice from options", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = { openaiTtsVoice: "alloy" };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      await provider.synthesize({ text: "Hi", voice: "echo" });

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voice).toBe("echo");
    });

    it("throws on API error", async () => {
      process.env.OPENAI_API_KEY = "sk-test";

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      await expect(
        provider.synthesize({ text: "Hello" })
      ).rejects.toThrow("OpenAI TTS API error 500");
    });

    it("uses OpenRouter base URL when no OPENAI_API_KEY env", async () => {
      settingsMock.state.settings.openrouterApiKey = "sk-or-key";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      await provider.synthesize({ text: "Hello" });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toBe("https://openrouter.ai/api/v1/audio/speech");
    });
  });
});

// ---------------------------------------------------------------------------
// ElevenLabs TTS Provider
// ---------------------------------------------------------------------------

describe("ElevenLabsTTSProvider", () => {
  const provider = new ElevenLabsTTSProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.state.settings = {};
  });

  describe("isAvailable", () => {
    it("returns false with no API key", () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it("returns true with API key", () => {
      settingsMock.state.settings.elevenLabsApiKey = "el-test";
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("synthesize", () => {
    it("throws when no API key is configured", async () => {
      await expect(
        provider.synthesize({ text: "Hello" })
      ).rejects.toThrow("No ElevenLabs API key");
    });

    it("calls ElevenLabs API with correct voice ID", async () => {
      settingsMock.state.settings = {
        elevenLabsApiKey: "el-key",
        elevenLabsVoiceId: "custom-voice-id",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      const result = await provider.synthesize({ text: "Hello" });

      const callUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(callUrl).toContain("custom-voice-id");
      expect(result.mimeType).toBe("audio/mpeg");
    });

    it("uses default Rachel voice when no voiceId configured", async () => {
      settingsMock.state.settings = { elevenLabsApiKey: "el-key" };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      await provider.synthesize({ text: "Hello" });

      const callUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(callUrl).toContain("21m00Tcm4TlvDq8ikWAM"); // Rachel default
    });

    it("passes speed in voice_settings", async () => {
      settingsMock.state.settings = { elevenLabsApiKey: "el-key" };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      await provider.synthesize({ text: "Hello", speed: 1.5 });

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voice_settings.speed).toBe(1.5);
    });

    it("throws on API error", async () => {
      settingsMock.state.settings = { elevenLabsApiKey: "el-key" };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        provider.synthesize({ text: "Hello" })
      ).rejects.toThrow("ElevenLabs TTS API error 401");
    });
  });
});
