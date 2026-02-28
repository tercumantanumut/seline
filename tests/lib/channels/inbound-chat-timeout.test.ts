import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/local-auth", () => ({
  SESSION_COOKIE_NAME: "seline_session",
}));

const mocks = vi.hoisted(() => {
  const state = {
    shouldTimeout: false,
  };

  return {
    state,
    loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
    getCharacter: vi.fn(async () => ({ id: "char-1", name: "Seline" })),
    getOrCreateLocalUser: vi.fn(async () => ({ id: "user-1" })),
    getChannelConnection: vi.fn(async () => ({
      id: "conn-1",
      userId: "user-1",
      characterId: "char-1",
      channelType: "telegram",
    })),
    findChannelConversation: vi.fn(async () => ({
      id: "conv-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      peerId: "peer-1",
      threadId: null,
      peerName: "Peer",
    })),
    findChannelMessageByExternalId: vi.fn(async () => undefined),
    createSession: vi.fn(async () => ({ id: "session-1", metadata: {} })),
    createChannelConversation: vi.fn(async () => ({
      id: "conv-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      peerId: "peer-1",
    })),
    updateChannelConversation: vi.fn(async () => ({
      id: "conv-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      peerId: "peer-1",
      threadId: null,
      peerName: "Peer",
    })),
    updateSession: vi.fn(async () => ({ id: "session-1", metadata: {} })),
    getSession: vi.fn(async () => ({ id: "session-1", status: "active" })),
    touchChannelConversation: vi.fn(async () => undefined),
    createMessage: vi.fn(async () => ({ id: "msg-1" })),
    createChannelMessage: vi.fn(async () => ({ id: "map-1" })),
    getMessages: vi.fn(async () => []),
    convertDBMessagesToUIMessages: vi.fn(() => [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]),
    saveFile: vi.fn(async () => ({ url: "/api/media/file" })),
    nextOrderingIndex: vi.fn(async () => 1),
    transcribeAudio: vi.fn(async () => ({ text: "hi", provider: "openai" })),
    isTranscriptionAvailable: vi.fn(() => false),
    isAudioMimeType: vi.fn(() => false),
    taskRegistry: {
      register: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(() => ({ tasks: [] })),
    },
    abortChatRun: vi.fn(() => true),
    manager: {
      sendMessage: vi.fn(async () => ({ externalMessageId: "out-1" })),
      sendTyping: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: mocks.loadSettings,
}));

vi.mock("@/lib/characters/queries", () => ({
  getCharacter: mocks.getCharacter,
}));

vi.mock("@/lib/db/queries", () => ({
  getOrCreateLocalUser: mocks.getOrCreateLocalUser,
  getChannelConnection: mocks.getChannelConnection,
  findChannelConversation: mocks.findChannelConversation,
  findChannelMessageByExternalId: mocks.findChannelMessageByExternalId,
  createSession: mocks.createSession,
  createChannelConversation: mocks.createChannelConversation,
  updateChannelConversation: mocks.updateChannelConversation,
  updateSession: mocks.updateSession,
  getSession: mocks.getSession,
  touchChannelConversation: mocks.touchChannelConversation,
  createMessage: mocks.createMessage,
  createChannelMessage: mocks.createChannelMessage,
  getMessages: mocks.getMessages,
}));

vi.mock("@/lib/messages/converter", () => ({
  convertDBMessagesToUIMessages: mocks.convertDBMessagesToUIMessages,
}));

vi.mock("@/lib/storage/local-storage", () => ({
  saveFile: mocks.saveFile,
}));

vi.mock("@/lib/session/message-ordering", () => ({
  nextOrderingIndex: mocks.nextOrderingIndex,
}));

vi.mock("@/lib/audio/transcription", () => ({
  transcribeAudio: mocks.transcribeAudio,
  isTranscriptionAvailable: mocks.isTranscriptionAvailable,
  isAudioMimeType: mocks.isAudioMimeType,
}));

vi.mock("@/lib/background-tasks/registry", () => ({
  taskRegistry: mocks.taskRegistry,
}));

vi.mock("@/lib/background-tasks/chat-abort-registry", () => ({
  abortChatRun: mocks.abortChatRun,
}));

vi.mock("@/lib/channels/manager", () => ({
  getChannelManager: () => mocks.manager,
}));

describe("Channel chat timeout isolation", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.CHANNEL_CHAT_TIMEOUT_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.shouldTimeout = false;
    process.env.CHANNEL_CHAT_TIMEOUT_MS = "20";

    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.signal) {
        throw new Error("missing signal");
      }

      if (!mocks.state.shouldTimeout) {
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined }),
              cancel: async () => undefined,
            }),
          },
          text: async () => "",
          status: 200,
        } as unknown as Response;
      }

      await new Promise<void>((resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      });

      return {
        ok: false,
        text: async () => "",
        status: 500,
      } as unknown as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.CHANNEL_CHAT_TIMEOUT_MS;
    } else {
      process.env.CHANNEL_CHAT_TIMEOUT_MS = originalEnv;
    }
    vi.resetModules();
  });

  it("marks channel task failed with ChannelTimeoutError without touching chat abort registry", async () => {
    mocks.state.shouldTimeout = true;

    const { handleInboundMessage } = await import("@/lib/channels/inbound");

    await expect(
      handleInboundMessage({
        connectionId: "conn-1",
        characterId: "char-1",
        channelType: "telegram",
        peerId: "peer-1",
        threadId: null,
        messageId: "msg-timeout",
        text: "long running request",
      })
    ).resolves.toBeUndefined();

    expect(mocks.taskRegistry.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      "failed",
      expect.objectContaining({ error: expect.stringContaining("Channel chat wait timed out") })
    );
    expect(mocks.abortChatRun).not.toHaveBeenCalled();
  });
});
