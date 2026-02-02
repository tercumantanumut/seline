import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramConnector } from "@/lib/channels/connectors/telegram";
import type { ChannelInboundMessage } from "@/lib/channels/types";

const sendMessage = vi.fn();
const sendPhoto = vi.fn();

vi.mock("grammy", () => {
  class Bot {
    api = {
      sendMessage,
      sendPhoto,
      getMe: vi.fn(),
    };
    constructor(_token: string) {}
    start = vi.fn();
    stop = vi.fn();
    catch = vi.fn();
    on = vi.fn();
  }

  class InputFile {
    constructor(public data: Buffer, public filename: string) {}
  }

  class GrammyError extends Error {
    error_code: number;
    constructor(message: string, code = 0) {
      super(message);
      this.error_code = code;
    }
  }

  return { Bot, InputFile, GrammyError };
});

function createConnector() {
  return new TelegramConnector({
    connectionId: "conn-1",
    characterId: "char-1",
    config: { type: "telegram", botToken: "token" },
    onMessage: async (_message: ChannelInboundMessage) => {},
    onStatus: () => {},
  });
}

describe("TelegramConnector chunking", () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendPhoto.mockReset();
  });

  it("sends single message without reply parameters", async () => {
    sendMessage.mockResolvedValue({ message_id: 100 });
    const connector = createConnector();

    await connector.sendMessage({
      peerId: "123",
      text: "Hello",
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Hello",
      expect.objectContaining({ reply_parameters: undefined })
    );
  });

  it("threads chunks to first message", async () => {
    sendMessage.mockResolvedValue({ message_id: 101 });
    const connector = createConnector();

    await connector.sendMessage({
      peerId: "123",
      text: "Chunk",
      replyToMessageId: "88",
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Chunk",
      expect.objectContaining({ reply_parameters: { message_id: 88 } })
    );
  });

  it("includes chunk numbering in text", async () => {
    sendMessage.mockResolvedValue({ message_id: 102 });
    const connector = createConnector();

    await connector.sendMessage({
      peerId: "123",
      text: "Part of plan",
      chunkIndex: 2,
      totalChunks: 5,
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "(2/5) Part of plan",
      expect.any(Object)
    );
  });
});
