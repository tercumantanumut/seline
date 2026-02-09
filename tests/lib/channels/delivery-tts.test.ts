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

// ---------------------------------------------------------------------------
// Mock DB queries
// ---------------------------------------------------------------------------

const dbMocks = vi.hoisted(() => ({
  getChannelConversation: vi.fn(),
  getChannelConnection: vi.fn(),
  createChannelMessage: vi.fn(),
  touchChannelConversation: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getChannelConversation: dbMocks.getChannelConversation,
  getChannelConnection: dbMocks.getChannelConnection,
  createChannelMessage: dbMocks.createChannelMessage,
  touchChannelConversation: dbMocks.touchChannelConversation,
  getSession: dbMocks.getSession,
  updateSession: dbMocks.updateSession,
}));

// Mock characters
vi.mock("@/lib/characters/queries", () => ({
  getCharacter: vi.fn().mockResolvedValue(null),
}));

// Mock channel manager
const sendMessageMock = vi.fn().mockResolvedValue({ externalMessageId: "ext-1" });
vi.mock("@/lib/channels/manager", () => ({
  getChannelManager: () => ({
    sendMessage: sendMessageMock,
  }),
}));

// Mock local storage
vi.mock("@/lib/storage/local-storage", () => ({
  readLocalFile: vi.fn().mockReturnValue(Buffer.from("fake-image")),
}));

// Mock TTS manager
const ttsMocks = vi.hoisted(() => ({
  isTTSAvailable: vi.fn().mockReturnValue(false),
  synthesizeSpeech: vi.fn(),
  shouldSummarizeForTTS: vi.fn().mockReturnValue(false),
  summarizeForTTS: vi.fn().mockImplementation((t: string) => t),
  getAudioForChannel: vi.fn().mockImplementation((audio: Buffer, mime: string) => ({
    audio,
    mimeType: mime,
    extension: "mp3",
  })),
}));

vi.mock("@/lib/tts/manager", () => ({
  isTTSAvailable: ttsMocks.isTTSAvailable,
  synthesizeSpeech: ttsMocks.synthesizeSpeech,
  shouldSummarizeForTTS: ttsMocks.shouldSummarizeForTTS,
  summarizeForTTS: ttsMocks.summarizeForTTS,
  getAudioForChannel: ttsMocks.getAudioForChannel,
}));

// Mock TTS directives
vi.mock("@/lib/tts/directives", () => ({
  parseTTSDirectives: vi.fn().mockImplementation((text: string) => ({
    text,
    directive: null,
  })),
}));

import { deliverChannelReply, persistVoiceState } from "@/lib/channels/delivery";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Channel Delivery with TTS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.state.settings = {
      ttsEnabled: true,
      ttsProvider: "edge",
      ttsAutoMode: "channels-only",
    };

    dbMocks.getChannelConversation.mockResolvedValue({
      id: "conv-1",
      connectionId: "conn-1",
      peerId: "peer-1",
      threadId: null,
    });

    dbMocks.getChannelConnection.mockResolvedValue({
      id: "conn-1",
      channelType: "telegram",
    });

    dbMocks.createChannelMessage.mockResolvedValue({});
    dbMocks.touchChannelConversation.mockResolvedValue({});
    sendMessageMock.mockResolvedValue({ externalMessageId: "ext-1" });
  });

  it("delivers text reply without TTS when TTS is disabled", async () => {
    settingsMock.state.settings.ttsEnabled = false;
    ttsMocks.isTTSAvailable.mockReturnValue(false);

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hello!" }],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({
        text: "Hello!",
      })
    );

    // No audio attachment
    const callArgs = sendMessageMock.mock.calls[0][1];
    const audioAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "audio"
    );
    expect(audioAttachments).toHaveLength(0);
  });

  it("attaches TTS audio when TTS is available and auto-mode is channels-only", async () => {
    ttsMocks.isTTSAvailable.mockReturnValue(true);
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("fake-tts-audio"),
      mimeType: "audio/mpeg",
    });
    ttsMocks.getAudioForChannel.mockReturnValue({
      audio: Buffer.from("fake-ogg-audio"),
      mimeType: "audio/ogg",
      extension: "ogg",
    });

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hello from the agent!" }],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(ttsMocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.any(String),
        channelHint: "telegram",
      })
    );

    // Should include audio attachment
    const callArgs = sendMessageMock.mock.calls[0][1];
    const audioAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "audio"
    );
    expect(audioAttachments).toHaveLength(1);
    expect(audioAttachments[0].mimeType).toBe("audio/ogg");
    expect(audioAttachments[0].filename).toBe("voice-reply.ogg");
  });

  it("does not generate TTS when auto-mode is off", async () => {
    settingsMock.state.settings.ttsAutoMode = "off";
    ttsMocks.isTTSAvailable.mockReturnValue(true);

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hello!" }],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(ttsMocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("skips empty or very short text for TTS", async () => {
    ttsMocks.isTTSAvailable.mockReturnValue(true);

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hi" }], // Only 2 chars — below 5 char threshold
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(ttsMocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("summarizes long text before TTS", async () => {
    ttsMocks.isTTSAvailable.mockReturnValue(true);
    ttsMocks.shouldSummarizeForTTS.mockReturnValue(true);
    ttsMocks.summarizeForTTS.mockResolvedValue("Summarized text");
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("audio"),
      mimeType: "audio/mpeg",
    });

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "A".repeat(2000) }],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(ttsMocks.summarizeForTTS).toHaveBeenCalled();
  });

  it("exits early when no conversationId in metadata", async () => {
    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hello" }],
      sessionMetadata: {}, // No channelConversationId
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("exits early when conversation not found", async () => {
    dbMocks.getChannelConversation.mockResolvedValue(null);

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [{ type: "text", text: "Hello" }],
      sessionMetadata: { channelConversationId: "conv-missing" },
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("delivers both image and TTS audio attachments in a single payload", async () => {
    ttsMocks.isTTSAvailable.mockReturnValue(true);
    ttsMocks.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("fake-tts-audio"),
      mimeType: "audio/mpeg",
    });
    ttsMocks.getAudioForChannel.mockReturnValue({
      audio: Buffer.from("fake-ogg-audio"),
      mimeType: "audio/ogg",
      extension: "ogg",
    });

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [
        { type: "text", text: "Here is the design you asked for" },
        { type: "image", image: "/api/media/sessions/sess-1/uploads/design.jpg" },
      ],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const callArgs = sendMessageMock.mock.calls[0][1];
    const imageAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "image"
    );
    const audioAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "audio"
    );
    // Both image and audio must be present in the same payload
    expect(imageAttachments).toHaveLength(1);
    expect(audioAttachments).toHaveLength(1);
    expect(audioAttachments[0].mimeType).toBe("audio/ogg");
  });

  it("delivers image without audio when TTS is disabled", async () => {
    settingsMock.state.settings.ttsEnabled = false;
    ttsMocks.isTTSAvailable.mockReturnValue(false);

    await deliverChannelReply({
      sessionId: "sess-1",
      messageId: "msg-1",
      content: [
        { type: "text", text: "Here is the design" },
        { type: "image", image: "/api/media/sessions/sess-1/uploads/design.jpg" },
      ],
      sessionMetadata: { channelConversationId: "conv-1" },
    });

    const callArgs = sendMessageMock.mock.calls[0][1];
    const imageAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "image"
    );
    const audioAttachments = (callArgs.attachments || []).filter(
      (a: any) => a.type === "audio"
    );
    expect(imageAttachments).toHaveLength(1);
    expect(audioAttachments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// persistVoiceState
// ---------------------------------------------------------------------------

describe("persistVoiceState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists voice state to session metadata", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "sess-1",
      metadata: { existingKey: "value" },
    });

    await persistVoiceState("sess-1", {
      ttsAutoMode: "always",
      lastProvider: "edge",
    });

    expect(dbMocks.updateSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          existingKey: "value",
          voice: expect.objectContaining({
            ttsAutoMode: "always",
            lastProvider: "edge",
            updatedAt: expect.any(String),
          }),
        }),
      })
    );
  });

  it("handles missing session gracefully", async () => {
    dbMocks.getSession.mockResolvedValue(null);

    // Should not throw
    await persistVoiceState("sess-missing", { ttsAutoMode: "off" });
    expect(dbMocks.updateSession).not.toHaveBeenCalled();
  });

  it("handles session with null metadata", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "sess-1",
      metadata: null,
    });

    await persistVoiceState("sess-1", { lastVoice: "alloy" });

    expect(dbMocks.updateSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          voice: expect.objectContaining({
            lastVoice: "alloy",
          }),
        }),
      })
    );
  });
});
