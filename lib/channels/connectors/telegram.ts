import { Bot, InputFile } from "grammy";
import type { Context } from "grammy";
import { ChannelConnector, ChannelInboundMessage, ChannelSendPayload, ChannelSendResult, TelegramConnectionConfig } from "../types";
import { normalizeChannelText } from "../utils";

type TelegramConnectorOptions = {
  connectionId: string;
  characterId: string;
  config: TelegramConnectionConfig;
  onMessage: (message: ChannelInboundMessage) => void | Promise<void>;
  onStatus: (status: ChannelConnector["status"], error?: string | null) => void;
};

export class TelegramConnector implements ChannelConnector {
  connectionId: string;
  channelType: ChannelConnector["channelType"] = "telegram";
  status: ChannelConnector["status"] = "disconnected";

  private bot: Bot;
  private onMessage: TelegramConnectorOptions["onMessage"];
  private onStatus: TelegramConnectorOptions["onStatus"];
  private characterId: string;
  private botToken: string;

  constructor(options: TelegramConnectorOptions) {
    this.connectionId = options.connectionId;
    this.characterId = options.characterId;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.botToken = options.config.botToken;
    this.bot = new Bot(options.config.botToken);
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.onStatus(this.status);

    this.bot.catch((error) => {
      console.error("[Channels] Telegram bot error:", error);
      this.status = "error";
      this.onStatus(this.status, String(error));
    });

    try {
      await this.bot.api.getMe();
    } catch (error) {
      this.status = "error";
      this.onStatus(this.status, String(error));
      throw error;
    }

    this.bot.on("message", async (ctx) => {
      if (ctx.from?.is_bot) {
        return;
      }

      const peerId = String(ctx.chat?.id);
      if (!peerId) return;

      const text = normalizeChannelText(ctx.message?.text || ctx.message?.caption);
      const attachments = await extractTelegramAttachments(ctx, this.botToken);

      const inbound: ChannelInboundMessage = {
        connectionId: this.connectionId,
        characterId: this.characterId,
        channelType: "telegram",
        peerId,
        peerName: ctx.chat?.title || ctx.chat?.username || ctx.from?.username || ctx.from?.first_name || null,
        threadId: ctx.message?.message_thread_id ? String(ctx.message.message_thread_id) : null,
        messageId: String(ctx.message?.message_id ?? Date.now()),
        text,
        attachments,
        timestamp: ctx.message?.date ? new Date(ctx.message.date * 1000).toISOString() : undefined,
      };

      await this.onMessage(inbound);
    });

    this.bot.start().catch((error) => {
      this.status = "error";
      this.onStatus(this.status, String(error));
    });
    this.status = "connected";
    this.onStatus(this.status);
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
    this.status = "disconnected";
    this.onStatus(this.status);
  }

  async sendMessage(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    const chatId = Number(payload.peerId);
    const text = payload.text || "";
    const attachment = payload.attachments?.[0];

    if (attachment && attachment.type === "image") {
      const sent = await this.bot.api.sendPhoto(chatId, new InputFile(attachment.data, attachment.filename), {
        caption: text || undefined,
        message_thread_id: payload.threadId ? Number(payload.threadId) : undefined,
      });
      return { externalMessageId: String(sent.message_id) };
    }

    const sent = await this.bot.api.sendMessage(chatId, text || " ", {
      message_thread_id: payload.threadId ? Number(payload.threadId) : undefined,
    });
    return { externalMessageId: String(sent.message_id) };
  }
}

async function extractTelegramAttachments(ctx: Context, botToken: string): Promise<ChannelInboundMessage["attachments"]> {
  const attachments: ChannelInboundMessage["attachments"] = [];
  const photo = ctx.message?.photo?.[ctx.message.photo.length - 1];
  if (!photo) {
    return attachments;
  }

  const fileInfo = await ctx.api.getFile(photo.file_id);
  if (!fileInfo.file_path) {
    return attachments;
  }
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") || "image/jpeg";

  attachments.push({
    type: "image",
    filename: `telegram-${photo.file_unique_id}.jpg`,
    mimeType,
    data: buffer,
  });

  return attachments;
}
