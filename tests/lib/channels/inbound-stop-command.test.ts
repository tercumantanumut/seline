import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    channelConversation: {
      id: "conv-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      peerId: "peer-1",
      threadId: null,
      peerName: "Peer",
    },
    runTasks: [] as Array<{ runId: string; type: "chat" | "channel" | "scheduled"; sessionId?: string }>,
    abortSucceeded: true,
  };

  const manager = {
    sendMessage: vi.fn(async () => ({ externalMessageId: "out-1" })),
    sendTyping: vi.fn(async () => undefined),
  };

  return {
    state,
    manager,
    loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
    getCharacter: vi.fn(async () => ({ id: "char-1", name: "Seline" })),
    getOrCreateLocalUser: vi.fn(async () => ({ id: "user-1" })),
    getChannelConnection: vi.fn(async () => ({
      id: "conn-1",
      userId: "user-1",
      characterId: "char-1",
      channelType: "telegram",
    })),
    findChannelConversation: vi.fn(async () => state.channelConversation),
    findChannelMessageByExternalId: vi.fn(async () => undefined),
    createSession: vi.fn(async () => ({ id: "session-new", metadata: {} })),
    createChannelConversation: vi.fn(async () => ({
      id: "conv-new",
      sessionId: "session-new",
      connectionId: "conn-1",
      peerId: "peer-1",
    })),
    updateChannelConversation: vi.fn(async () => state.channelConversation),
    updateSession: vi.fn(async () => ({ id: "session-1", metadata: {} })),
    getSession: vi.fn(async () => ({ id: "session-1", status: "active" })),
    touchChannelConversation: vi.fn(async () => undefined),
    createMessage: vi.fn(async () => ({ id: "msg-1" })),
    createChannelMessage: vi.fn(async () => ({ id: "map-1" })),
    getMessages: vi.fn(async () => []),
    convertDBMessagesToUIMessages: vi.fn(() => []),
    saveFile: vi.fn(async () => ({ url: "/api/media/file" })),
    nextOrderingIndex: vi.fn(async () => 1),
    transcribeAudio: vi.fn(async () => ({ text: "hi", provider: "openai" })),
    isTranscriptionAvailable: vi.fn(() => false),
    isAudioMimeType: vi.fn(() => false),
    taskRegistry: {
      register: vi.fn(),
      updateStatus: vi.fn(),
      list: vi.fn(() => ({ tasks: state.runTasks })),
    },
    abortChatRun: vi.fn(() => state.abortSucceeded),
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

import { handleInboundMessage } from "@/lib/channels/inbound";

describe("Channel /stop command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.channelConversation = {
      id: "conv-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      peerId: "peer-1",
      threadId: null,
      peerName: "Peer",
    };
    mocks.state.runTasks = [
      {
        runId: "run-1",
        type: "chat",
        sessionId: "session-1",
      },
    ];
    mocks.state.abortSucceeded = true;
  });

  it("handles /stop immediately and aborts active run", async () => {
    await handleInboundMessage({
      connectionId: "conn-1",
      characterId: "char-1",
      channelType: "telegram",
      peerId: "peer-1",
      threadId: null,
      messageId: "msg-stop",
      text: "/stop",
    });

    expect(mocks.abortChatRun).toHaveBeenCalledWith("run-1", "channel_stop_command");
    expect(mocks.manager.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.manager.sendMessage).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ text: "Stopping 1 active run." })
    );
    expect(mocks.taskRegistry.register).not.toHaveBeenCalled();
  });

  it("supports !stop alias and optional @mention", async () => {
    await handleInboundMessage({
      connectionId: "conn-1",
      characterId: "char-1",
      channelType: "telegram",
      peerId: "peer-1",
      threadId: null,
      messageId: "msg-stop-2",
      text: "!stop@SelineBot",
    });

    expect(mocks.abortChatRun).toHaveBeenCalledWith("run-1", "channel_stop_command");
    expect(mocks.manager.sendMessage).toHaveBeenCalledTimes(1);
  });
});
