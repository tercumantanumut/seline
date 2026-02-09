import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramConnector } from "@/lib/channels/connectors/telegram";
import type { ChannelInboundMessage } from "@/lib/channels/types";

const sendMessage = vi.fn();
const sendPhoto = vi.fn();
const sendVoice = vi.fn();

vi.mock("grammy", () => {
  class Bot {
    api = {
      sendMessage,
      sendPhoto,
      sendVoice,
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
    sendVoice.mockReset();
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

describe("TelegramConnector voice caption truncation", () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendPhoto.mockReset();
    sendVoice.mockReset();
  });

  it("sends short caption as-is on voice message", async () => {
    sendVoice.mockResolvedValue({ message_id: 200 });
    const connector = createConnector();
    const shortText = "Here is a quick reply";

    await connector.sendMessage({
      peerId: "123",
      text: shortText,
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendVoice).toHaveBeenCalledTimes(1);
    expect(sendVoice).toHaveBeenCalledWith(
      123,
      expect.anything(),
      expect.objectContaining({ caption: shortText })
    );
    // No overflow message sent
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("truncates long caption and sends overflow as separate message", async () => {
    sendVoice.mockResolvedValue({ message_id: 201 });
    sendMessage.mockResolvedValue({ message_id: 202 });
    const connector = createConnector();
    // Create text that exceeds 1024 chars
    const longText = "A".repeat(1200);

    await connector.sendMessage({
      peerId: "123",
      text: longText,
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendVoice).toHaveBeenCalledTimes(1);
    const voiceCaption = sendVoice.mock.calls[0][2].caption;
    expect(voiceCaption.length).toBeLessThanOrEqual(1024);
    expect(voiceCaption).toContain("\u2026"); // ellipsis
    // Full text sent as follow-up
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      123,
      longText,
      expect.objectContaining({ reply_parameters: { message_id: 201 } })
    );
  });

  it("always strips YouTube URLs from voice captions", async () => {
    sendVoice.mockResolvedValue({ message_id: 203 });
    sendMessage.mockResolvedValue({ message_id: 204 });
    const connector = createConnector();
    // Short text with a YouTube URL — total is well under 1024 chars
    const textWithUrl = "Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ enjoy!";

    await connector.sendMessage({
      peerId: "123",
      text: textWithUrl,
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendVoice).toHaveBeenCalledTimes(1);
    const voiceCaption = sendVoice.mock.calls[0][2].caption;
    // YouTube URL must be stripped from voice caption
    expect(voiceCaption).not.toContain("youtube.com");
    expect(voiceCaption).toContain("Check out this video:");
    expect(voiceCaption).toContain("enjoy!");
    // Full original text (with URL) sent as follow-up
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toBe(textWithUrl);
  });

  it("does not strip YouTube URLs from photo captions", async () => {
    sendPhoto.mockResolvedValue({ message_id: 205 });
    const connector = createConnector();
    const textWithUrl = "Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    await connector.sendMessage({
      peerId: "123",
      text: textWithUrl,
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
      ],
    });

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const photoCaption = sendPhoto.mock.calls[0][2].caption;
    // Photo captions keep YouTube URLs
    expect(photoCaption).toContain("youtube.com");
    // No overflow since it fits within 1024
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("retries without caption on GrammyError caption too long", async () => {
    // Import GrammyError from the mock
    const { GrammyError } = await import("grammy");
    const captionError = new GrammyError("Bad Request: message caption is too long", 400);

    // First call fails, retry succeeds
    sendVoice
      .mockRejectedValueOnce(captionError)
      .mockResolvedValueOnce({ message_id: 205 });
    sendMessage.mockResolvedValue({ message_id: 206 });
    const connector = createConnector();

    await connector.sendMessage({
      peerId: "123",
      text: "Some text that somehow still triggers the error",
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    // sendVoice called twice: first with caption (fails), then without
    expect(sendVoice).toHaveBeenCalledTimes(2);
    expect(sendVoice.mock.calls[1][2]).not.toHaveProperty("caption");
    // Full text sent as separate message
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("re-throws non-caption errors from sendVoice", async () => {
    const { GrammyError } = await import("grammy");
    const otherError = new GrammyError("Bad Request: file is too big", 400);

    sendVoice.mockRejectedValue(otherError);
    const connector = createConnector();

    await expect(
      connector.sendMessage({
        peerId: "123",
        text: "Hello",
        attachments: [
          { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
        ],
      })
    ).rejects.toThrow("file is too big");

    // Only one attempt
    expect(sendVoice).toHaveBeenCalledTimes(1);
  });

  it("truncates photo captions the same way", async () => {
    sendPhoto.mockResolvedValue({ message_id: 300 });
    sendMessage.mockResolvedValue({ message_id: 301 });
    const connector = createConnector();
    const longText = "B".repeat(1200);

    await connector.sendMessage({
      peerId: "123",
      text: longText,
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
      ],
    });

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const photoCaption = sendPhoto.mock.calls[0][2].caption;
    expect(photoCaption.length).toBeLessThanOrEqual(1024);
    // Overflow sent as follow-up
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toBe(longText);
  });

  it("sends no caption for empty/whitespace text", async () => {
    sendVoice.mockResolvedValue({ message_id: 400 });
    const connector = createConnector();

    await connector.sendMessage({
      peerId: "123",
      text: "   ",
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendVoice).toHaveBeenCalledTimes(1);
    expect(sendVoice.mock.calls[0][2].caption).toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("TelegramConnector image + voice coexistence", () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendPhoto.mockReset();
    sendVoice.mockReset();
  });

  it("sends both photo and voice when both attachments are present", async () => {
    sendPhoto.mockResolvedValue({ message_id: 500 });
    sendVoice.mockResolvedValue({ message_id: 501 });
    const connector = createConnector();

    const result = await connector.sendMessage({
      peerId: "123",
      text: "Here is the image you requested",
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    // Both sendPhoto and sendVoice must be called
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendVoice).toHaveBeenCalledTimes(1);
    // Photo should be sent without caption (text goes to voice)
    expect(sendPhoto.mock.calls[0][2].caption).toBeUndefined();
    // Voice should carry the text as caption
    expect(sendVoice.mock.calls[0][2].caption).toBe("Here is the image you requested");
    // Voice should be threaded as a reply to the photo
    expect(sendVoice.mock.calls[0][2].reply_parameters).toEqual({ message_id: 500 });
    // Return the first (photo) message ID
    expect(result.externalMessageId).toBe("500");
  });

  it("threads voice to photo and sends overflow when caption is long", async () => {
    sendPhoto.mockResolvedValue({ message_id: 510 });
    sendVoice.mockResolvedValue({ message_id: 511 });
    sendMessage.mockResolvedValue({ message_id: 512 });
    const connector = createConnector();
    const longText = "C".repeat(1200);

    await connector.sendMessage({
      peerId: "123",
      text: longText,
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendVoice).toHaveBeenCalledTimes(1);
    // Voice caption should be truncated
    const voiceCaption = sendVoice.mock.calls[0][2].caption;
    expect(voiceCaption.length).toBeLessThanOrEqual(1024);
    expect(voiceCaption).toContain("\u2026");
    // Overflow text sent as follow-up
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toBe(longText);
  });

  it("sends image-only without voice when no audio attachment", async () => {
    sendPhoto.mockResolvedValue({ message_id: 520 });
    const connector = createConnector();

    const result = await connector.sendMessage({
      peerId: "123",
      text: "Just an image",
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
      ],
    });

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendPhoto.mock.calls[0][2].caption).toBe("Just an image");
    expect(sendVoice).not.toHaveBeenCalled();
    expect(result.externalMessageId).toBe("520");
  });

  it("sends voice-only without photo when no image attachment", async () => {
    sendVoice.mockResolvedValue({ message_id: 530 });
    const connector = createConnector();

    const result = await connector.sendMessage({
      peerId: "123",
      text: "Just a voice note",
      attachments: [
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendVoice).toHaveBeenCalledTimes(1);
    expect(sendVoice.mock.calls[0][2].caption).toBe("Just a voice note");
    expect(sendPhoto).not.toHaveBeenCalled();
    // Voice reply_parameters should use the original (undefined in this case)
    expect(sendVoice.mock.calls[0][2].reply_parameters).toBeUndefined();
    expect(result.externalMessageId).toBe("530");
  });

  it("returns photo message ID when caption retry happens with both attachments", async () => {
    const { GrammyError } = await import("grammy");
    const captionError = new GrammyError("Bad Request: message caption is too long", 400);

    sendPhoto.mockResolvedValue({ message_id: 540 });
    sendVoice
      .mockRejectedValueOnce(captionError)
      .mockResolvedValueOnce({ message_id: 541 });
    sendMessage.mockResolvedValue({ message_id: 542 });
    const connector = createConnector();

    const result = await connector.sendMessage({
      peerId: "123",
      text: "Some text",
      attachments: [
        { type: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("img") },
        { type: "audio", filename: "voice.ogg", mimeType: "audio/ogg", data: Buffer.from("audio") },
      ],
    });

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendVoice).toHaveBeenCalledTimes(2);
    // Should return the photo's message ID (first message sent)
    expect(result.externalMessageId).toBe("540");
  });
});
