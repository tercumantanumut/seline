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

// Mock transcription availability
const transcriptionMocks = vi.hoisted(() => ({
  isTranscriptionAvailable: vi.fn().mockReturnValue(true),
  isWhisperCppAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/audio/transcription", () => ({
  isTranscriptionAvailable: transcriptionMocks.isTranscriptionAvailable,
  isWhisperCppAvailable: transcriptionMocks.isWhisperCppAvailable,
}));

// Mock node:fs for findWhisperBinaryNote
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

import { createTranscribeTool } from "@/lib/ai/tools/transcribe-tool";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Transcribe Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.state.settings = {
      sttEnabled: true,
      sttProvider: "openai",
    };
    transcriptionMocks.isTranscriptionAvailable.mockReturnValue(true);
    transcriptionMocks.isWhisperCppAvailable.mockReturnValue(false);
  });

  it("creates a tool with correct structure", () => {
    const tool = createTranscribeTool({ sessionId: "sess-1" });
    expect(tool).toBeDefined();
  });

  it("returns error for UNSCOPED session", async () => {
    const tool = createTranscribeTool({ sessionId: "UNSCOPED" });
    const result = await tool.execute(
      { instruction: "Check transcription" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("requires an active session"),
      })
    );
  });

  it("reports OpenAI Whisper as available when configured", async () => {
    settingsMock.state.settings = {
      sttEnabled: true,
      sttProvider: "openai",
    };
    transcriptionMocks.isTranscriptionAvailable.mockReturnValue(true);

    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "What transcription is available?" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.status).toBe("success");
    expect(result.transcriptionAvailable).toBe(true);
    expect(result.provider).toBe("openai-whisper");
    expect(result.supportedFormats).toContain("ogg");
    expect(result.supportedFormats).toContain("mp3");
    expect(result.supportedFormats).toContain("wav");
  });

  it("reports whisper.cpp as available when local is configured and working", async () => {
    settingsMock.state.settings = {
      sttEnabled: true,
      sttProvider: "local",
      sttLocalModel: "ggml-tiny.en",
    };
    transcriptionMocks.isTranscriptionAvailable.mockReturnValue(true);
    transcriptionMocks.isWhisperCppAvailable.mockReturnValue(true);

    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "Check transcription" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.status).toBe("success");
    expect(result.transcriptionAvailable).toBe(true);
    expect(result.provider).toBe("whisper.cpp");
    expect(result.localWhisperAvailable).toBe(true);
  });

  it("reports whisper.cpp as unavailable when binary/model not found", async () => {
    settingsMock.state.settings = {
      sttEnabled: true,
      sttProvider: "local",
      sttLocalModel: "ggml-tiny.en",
    };
    transcriptionMocks.isTranscriptionAvailable.mockReturnValue(false);
    transcriptionMocks.isWhisperCppAvailable.mockReturnValue(false);

    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "Check transcription" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.status).toBe("success");
    expect(result.transcriptionAvailable).toBe(false);
    // Should mention whisper.cpp setup instructions
    expect(result.note).toMatch(/whisper-cli|whisper\.cpp|download/i);
  });

  it("reports not configured when STT is disabled", async () => {
    settingsMock.state.settings = {
      sttEnabled: false,
    };
    transcriptionMocks.isTranscriptionAvailable.mockReturnValue(false);

    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "Check" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.status).toBe("success");
    expect(result.transcriptionAvailable).toBe(false);
    expect(result.provider).toBe("none");
  });

  it("includes supported audio formats in response", async () => {
    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "What formats do you support?" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.supportedFormats).toEqual(
      expect.arrayContaining(["ogg", "mp3", "m4a", "wav", "webm", "opus", "aac"])
    );
  });

  it("includes helpful note about auto-transcription when available", async () => {
    const tool = createTranscribeTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { instruction: "How does transcription work?" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.note).toMatch(/automatically transcribed/i);
  });
});
