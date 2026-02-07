import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock TTS manager
// ---------------------------------------------------------------------------

const ttsMocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  isTTSAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/tts/manager", () => ({
  synthesizeSpeech: ttsMocks.synthesizeSpeech,
  isTTSAvailable: ttsMocks.isTTSAvailable,
}));

// Mock local storage
const storageMock = vi.hoisted(() => ({
  saveFile: vi.fn(),
}));

vi.mock("@/lib/storage/local-storage", () => ({
  saveFile: storageMock.saveFile,
}));

import { createSpeakAloudTool } from "@/lib/ai/tools/speak-aloud-tool";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Speak Aloud Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ttsMocks.isTTSAvailable.mockReturnValue(true);
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("fake-mp3-audio-data"),
      mimeType: "audio/mpeg",
    });
    storageMock.saveFile.mockResolvedValue({
      url: "/api/media/sessions/sess-1/generated/speak-12345.mp3",
      path: "sessions/sess-1/generated/speak-12345.mp3",
    });
  });

  it("creates a tool with correct name and description", () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    expect(tool).toBeDefined();
  });

  it("returns error for UNSCOPED session", async () => {
    const tool = createSpeakAloudTool({ sessionId: "UNSCOPED" });
    const result = await tool.execute({ text: "Hello" }, { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("requires an active session"),
      })
    );
  });

  it("returns error when TTS is not available", async () => {
    ttsMocks.isTTSAvailable.mockReturnValue(false);
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute({ text: "Hello" }, { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("not available"),
      })
    );
  });

  it("returns error for empty text", async () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute({ text: "" }, { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("No text"),
      })
    );
  });

  it("returns error for whitespace-only text", async () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute({ text: "   " }, { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("No text"),
      })
    );
  });

  it("synthesizes speech, saves to storage, returns audioUrl", async () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { text: "Hello, this is a test." },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    // Verify TTS was called
    expect(ttsMocks.synthesizeSpeech).toHaveBeenCalledWith({
      text: "Hello, this is a test.",
      voice: undefined,
      speed: undefined,
    });

    // Verify file was saved
    expect(storageMock.saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      "sess-1",
      expect.stringMatching(/^speak-\d+\.mp3$/),
      "generated"
    );

    // Verify result
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        audioUrl: expect.stringContaining("/api/media/"),
        mimeType: "audio/mpeg",
        audioSize: expect.any(Number),
        textLength: 22,
      })
    );
  });

  it("passes custom voice and speed to synthesizer", async () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    await tool.execute(
      { text: "Hello", voice: "echo", speed: 1.5 },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    expect(ttsMocks.synthesizeSpeech).toHaveBeenCalledWith({
      text: "Hello",
      voice: "echo",
      speed: 1.5,
    });
  });

  it("saves OGG files with correct extension", async () => {
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("fake-ogg"),
      mimeType: "audio/ogg",
    });

    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    await tool.execute(
      { text: "Hello" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    expect(storageMock.saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      "sess-1",
      expect.stringMatching(/\.ogg$/),
      "generated"
    );
  });

  it("saves Opus files with correct extension", async () => {
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("fake-opus"),
      mimeType: "audio/opus",
    });

    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    await tool.execute(
      { text: "Hello" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    expect(storageMock.saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      "sess-1",
      expect.stringMatching(/\.opus$/),
      "generated"
    );
  });

  it("handles TTS synthesis failure gracefully", async () => {
    ttsMocks.synthesizeSpeech.mockRejectedValue(new Error("Edge TTS timeout"));

    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { text: "Hello" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("Edge TTS timeout"),
      })
    );
  });

  it("includes human-readable message in success result", async () => {
    const tool = createSpeakAloudTool({ sessionId: "sess-1" });
    const result = await tool.execute(
      { text: "Hello world" },
      { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
    ) as any;

    expect(result.message).toMatch(/KB.*characters/);
  });
});
