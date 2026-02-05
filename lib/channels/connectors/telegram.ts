import { Bot, InputFile, GrammyError } from "grammy";
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
  private started = false;
  private connecting = false;
  private handlersAttached = false;
  private startPromise: Promise<void> | null = null;
  private pollingBlocked = false;

  constructor(options: TelegramConnectorOptions) {
    this.connectionId = options.connectionId;
    this.characterId = options.characterId;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.botToken = options.config.botToken;
    this.bot = new Bot(options.config.botToken);
  }

  async connect(): Promise<void> {
    if (this.status === "connected" || this.connecting) {
      return;
    }

    this.connecting = true;
    this.status = "connecting";
    this.onStatus(this.status);

    this.attachHandlers();

    try {
      await this.bot.api.getMe();
    } catch (error) {
      this.status = "error";
      this.onStatus(this.status, String(error));
      this.connecting = false;
      throw error;
    }

    if (this.pollingBlocked || this.started || this.startPromise) {
      this.status = "connected";
      this.onStatus(this.status);
      this.connecting = false;
      return;
    }

    this.started = true;
    const startPromise = this.bot.start({ drop_pending_updates: true });
    this.startPromise = startPromise;

    startPromise
      .then(() => {
        this.startPromise = null;
        this.started = false;
      })
      .catch((error) => {
        this.startPromise = null;
        this.started = false;
        this.handleTelegramError(error);
      });

    this.status = "connected";
    this.onStatus(this.status);
    this.connecting = false;
  }

  async disconnect(): Promise<void> {
    this.connecting = false;
    this.started = false;
    this.startPromise = null;
    await this.bot.stop();
    this.status = "disconnected";
    this.onStatus(this.status);
  }

  async sendMessage(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    const chatId = Number(payload.peerId);
    const replyParameters = payload.replyToMessageId
      ? { message_id: Number(payload.replyToMessageId) }
      : undefined;
    let text = payload.text || "";
    if (
      payload.totalChunks &&
      payload.totalChunks > 1 &&
      payload.chunkIndex &&
      !/^\(\d+\/\d+\)\s/.test(text)
    ) {
      text = `(${payload.chunkIndex}/${payload.totalChunks}) ${text}`;
    }
    const attachment = payload.attachments?.[0];

    if (attachment && attachment.type === "image") {
      const sent = await this.bot.api.sendPhoto(chatId, new InputFile(attachment.data, attachment.filename), {
        caption: text || undefined,
        message_thread_id: payload.threadId ? Number(payload.threadId) : undefined,
        reply_parameters: replyParameters,
      });
      return {
        externalMessageId: String(sent.message_id),
        chunkIndex: payload.chunkIndex,
        totalChunks: payload.totalChunks,
      };
    }

    const sent = await this.bot.api.sendMessage(chatId, text || " ", {
      message_thread_id: payload.threadId ? Number(payload.threadId) : undefined,
      reply_parameters: replyParameters,
    });
    return {
      externalMessageId: String(sent.message_id),
      chunkIndex: payload.chunkIndex,
      totalChunks: payload.totalChunks,
    };
  }

  private attachHandlers(): void {
    if (this.handlersAttached) {
      return;
    }

    this.bot.catch((error) => {
      this.handleTelegramError(error);
    });

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

    this.handlersAttached = true;
  }

  private handleTelegramError(error: unknown): void {
    if (this.status === "disconnected") {
      return;
    }

    if (isConflictError(error)) {
      const message = "Telegram polling conflict: another instance is already running";
      this.pollingBlocked = true;
      console.warn("[Channels] Telegram polling conflict detected; marking as connected.", message);
      this.status = "connected";
      this.onStatus(this.status);
      return;
    }

    console.error("[Channels] Telegram bot error:", error);
    this.status = "error";
    this.onStatus(this.status, formatTelegramError(error));
  }
}

function isConflictError(error: unknown): boolean {
  if (error instanceof GrammyError) {
    return error.error_code === 409;
  }
  if (error instanceof Error) {
    return error.message.includes("409") && error.message.includes("getUpdates");
  }
  return false;
}

function formatTelegramError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

  if (!response.ok) {
    console.error(
      `[Telegram] Failed to download photo (file_id ${photo.file_id}) — ` +
      `${response.status} ${response.statusText}.`
    );
    return attachments;
  }

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
