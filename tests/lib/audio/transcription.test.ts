import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock settings
// ---------------------------------------------------------------------------

const settingsMock = vi.hoisted(() => {
  const state = {
    settings: {} as Record<string, any>,
  };
  return {
    state,
    loadSettings: vi.fn(() => state.settings),
  };
});

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMock.loadSettings,
}));

// ---------------------------------------------------------------------------
// Mock node:child_process and node:fs for whisper.cpp tests
// ---------------------------------------------------------------------------

const fsMock = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({ transcription: [{ text: "hello world" }] })),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

const cpMock = vi.hoisted(() => ({
  execFileSync: vi.fn(() => ""),
}));

vi.mock("node:fs", () => fsMock);
vi.mock("node:child_process", () => cpMock);

import {
  transcribeAudio,
  isTranscriptionAvailable,
  isWhisperCppAvailable,
  isAudioMimeType,
} from "@/lib/audio/transcription";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Audio Transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    settingsMock.state.settings = {
      sttEnabled: true,
      sttProvider: "openai",
      openrouterApiKey: "sk-test-key",
    };
    // Default: existsSync returns false
    fsMock.existsSync.mockReturnValue(false);
  });

  // ── isAudioMimeType ────────────────────────────────────────────────────

  describe("isAudioMimeType", () => {
    it("detects standard audio MIME types", () => {
      expect(isAudioMimeType("audio/ogg")).toBe(true);
      expect(isAudioMimeType("audio/mpeg")).toBe(true);
      expect(isAudioMimeType("audio/mp4")).toBe(true);
      expect(isAudioMimeType("audio/wav")).toBe(true);
      expect(isAudioMimeType("audio/webm")).toBe(true);
      expect(isAudioMimeType("audio/opus")).toBe(true);
      expect(isAudioMimeType("audio/aac")).toBe(true);
    });

    it("detects application/ogg as audio", () => {
      expect(isAudioMimeType("application/ogg")).toBe(true);
    });

    it("rejects non-audio MIME types", () => {
      expect(isAudioMimeType("image/png")).toBe(false);
      expect(isAudioMimeType("text/plain")).toBe(false);
      expect(isAudioMimeType("application/json")).toBe(false);
      expect(isAudioMimeType("video/mp4")).toBe(false);
    });
  });

  // ── isTranscriptionAvailable ───────────────────────────────────────────

  describe("isTranscriptionAvailable", () => {
    it("returns false when STT is disabled", () => {
      settingsMock.state.settings.sttEnabled = false;
      expect(isTranscriptionAvailable()).toBe(false);
    });

    it("returns true for OpenAI provider with API key in settings", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
        openrouterApiKey: "sk-test",
      };
      expect(isTranscriptionAvailable()).toBe(true);
    });

    it("returns true for OpenAI provider with OPENAI_API_KEY env", () => {
      process.env.OPENAI_API_KEY = "sk-env-key";
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };
      expect(isTranscriptionAvailable()).toBe(true);
    });

    it("returns false for OpenAI provider with no API key", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };
      expect(isTranscriptionAvailable()).toBe(false);
    });

    it("returns false for local provider when whisper-cli and model are not found", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
      };
      fsMock.existsSync.mockReturnValue(false);
      expect(isTranscriptionAvailable()).toBe(false);
    });

    it("returns true for local provider when whisper-cli binary and model exist", () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "ggml-tiny.en",
      };
      // existsSync is called for binary path and model path — both should return true
      fsMock.existsSync.mockReturnValue(true);
      expect(isTranscriptionAvailable()).toBe(true);
    });
  });

  // ── isWhisperCppAvailable ──────────────────────────────────────────────

  describe("isWhisperCppAvailable", () => {
    it("returns false when whisper-cli binary is not found", () => {
      fsMock.existsSync.mockReturnValue(false);
      expect(isWhisperCppAvailable()).toBe(false);
    });

    it("returns true when both binary and model file exist", () => {
      fsMock.existsSync.mockReturnValue(true);
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "ggml-tiny.en",
      };
      expect(isWhisperCppAvailable()).toBe(true);
    });

    it("returns false when binary exists but model does not", () => {
      // First call (binary check) → true, subsequent calls (model path) → false
      fsMock.existsSync
        .mockReturnValueOnce(true)   // /opt/homebrew/bin/whisper-cli
        .mockReturnValue(false);     // all model paths
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "ggml-tiny.en",
      };
      expect(isWhisperCppAvailable()).toBe(false);
    });

    it("finds model via platform-specific userData fallback (electron:dev)", () => {
      // Simulates electron:dev where LOCAL_DATA_PATH is NOT set
      // but the model was downloaded to ~/Library/Application Support/seline/models/whisper/
      delete process.env.LOCAL_DATA_PATH;
      delete process.env.ELECTRON_USER_DATA_PATH;
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "ggml-tiny.en",
      };
      // Binary found at /opt/homebrew/bin/whisper-cli, model found via userData fallback
      fsMock.existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.includes("whisper-cli")) return true;
        if (typeof p === "string" && p.includes("models/whisper") && p.endsWith("ggml-tiny.en.bin")) return true;
        return false;
      });
      expect(isWhisperCppAvailable()).toBe(true);
    });
  });

  // ── transcribeAudio ────────────────────────────────────────────────────

  describe("transcribeAudio", () => {
    const fakeAudio = Buffer.from("fake-audio-data");

    it("throws when STT is disabled", async () => {
      settingsMock.state.settings.sttEnabled = false;
      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow("Speech-to-text is disabled");
    });

    it("throws for unsupported provider", async () => {
      settingsMock.state.settings.sttProvider = "deepgram";
      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow("Unsupported STT provider: deepgram");
    });

    it("throws when local provider model is not found", async () => {
      settingsMock.state.settings.sttProvider = "local";
      settingsMock.state.settings.sttLocalModel = "ggml-tiny.en";
      fsMock.existsSync.mockReturnValue(false);
      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow(/not found|download/i);
    });

    it("throws when local provider binary is not found", async () => {
      settingsMock.state.settings.sttProvider = "local";
      settingsMock.state.settings.sttLocalModel = "ggml-tiny.en";
      // Model path exists but binary doesn't
      fsMock.existsSync
        .mockReturnValueOnce(false)  // settings.whisperCppPath
        .mockReturnValueOnce(false)  // /opt/homebrew/bin/whisper-cli
        .mockReturnValueOnce(false); // /usr/local/bin/whisper-cli
      cpMock.execFileSync.mockImplementation((cmd: string) => {
        if (cmd === "which") throw new Error("not found");
        return "";
      });
      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow(/whisper-cli not found|not found/i);
    });

    it("throws when OpenAI provider has no API key", async () => {
      settingsMock.state.settings = {
        sttEnabled: true,
        sttProvider: "openai",
      };
      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow("No API key configured for transcription");
    });

    it("calls OpenAI Whisper API and returns TranscriptionResult", async () => {
      process.env.OPENAI_API_KEY = "sk-test-openai";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: "Hello, this is a test transcription",
          duration: 3.5,
          language: "en",
        }),
      });

      const result = await transcribeAudio(fakeAudio, "audio/ogg", "voice-note.ogg");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-openai",
          }),
        })
      );

      expect(result).toEqual({
        text: "Hello, this is a test transcription",
        provider: "openai",
        durationSeconds: 3.5,
        language: "en",
      });
    });

    it("throws on OpenAI API error", async () => {
      process.env.OPENAI_API_KEY = "sk-test";

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      });

      await expect(
        transcribeAudio(fakeAudio, "audio/ogg")
      ).rejects.toThrow("OpenAI Whisper API error 429: Rate limit exceeded");
    });

    it("defaults to openai provider when sttProvider is undefined", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      settingsMock.state.settings = { sttEnabled: true };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: "test", duration: 1.0 }),
      });

      const result = await transcribeAudio(fakeAudio, "audio/mpeg");
      expect(result.provider).toBe("openai");
    });
  });
});
