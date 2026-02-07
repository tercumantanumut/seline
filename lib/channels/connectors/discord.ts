import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
} from "discord.js";
import type { Message as DiscordMessage, TextChannel, DMChannel } from "discord.js";
import type {
  ChannelConnector,
  ChannelInboundMessage,
  ChannelSendPayload,
  ChannelSendResult,
  DiscordConnectionConfig,
} from "../types";
import { normalizeChannelText } from "../utils";

type DiscordConnectorOptions = {
  connectionId: string;
  characterId: string;
  config: DiscordConnectionConfig;
  onMessage: (message: ChannelInboundMessage) => void | Promise<void>;
  onStatus: (status: ChannelConnector["status"], error?: string | null) => void;
};

export class DiscordConnector implements ChannelConnector {
  connectionId: string;
  channelType: ChannelConnector["channelType"] = "discord";
  status: ChannelConnector["status"] = "disconnected";

  private client: Client;
  private onMessage: DiscordConnectorOptions["onMessage"];
  private onStatus: DiscordConnectorOptions["onStatus"];
  private characterId: string;
  private botToken: string;
  private botUserId: string | null = null;

  constructor(options: DiscordConnectorOptions) {
    this.connectionId = options.connectionId;
    this.characterId = options.characterId;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.botToken = options.config.botToken;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  async connect(): Promise<void> {
    if (this.status === "connected") return;

    this.status = "connecting";
    this.onStatus(this.status);

    this.client.on("ready", () => {
      this.botUserId = this.client.user?.id ?? null;
      this.status = "connected";
      this.onStatus(this.status);
      console.log(`[Discord] Connected as ${this.client.user?.tag}`);
    });

    this.client.on("messageCreate", async (msg) => {
      await this.handleMessage(msg);
    });

    this.client.on("error", (error) => {
      console.error("[Discord] Client error:", error);
      this.status = "error";
      this.onStatus(this.status, error.message);
    });

    try {
      await this.client.login(this.botToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = "error";
      this.onStatus(this.status, message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.client.destroy();
    } catch {
      // Ignore teardown errors
    }
    this.status = "disconnected";
    this.onStatus(this.status);
  }

  async sendMessage(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    const channel = await this.client.channels.fetch(payload.peerId);
    if (!channel || !("send" in channel)) {
      throw new Error(`Discord channel ${payload.peerId} not found or not text-based`);
    }

    const textChannel = channel as TextChannel | DMChannel;
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
    const files = attachment
      ? [new AttachmentBuilder(attachment.data, { name: attachment.filename })]
      : undefined;

    // Reply in thread if threadId is provided
    if (payload.threadId) {
      try {
        const parentChannel = await this.client.channels.fetch(payload.peerId);
        if (parentChannel && "threads" in parentChannel) {
          const thread = await (parentChannel as TextChannel).threads.fetch(payload.threadId);
          if (thread) {
            const sent = await thread.send({ content: text || undefined, files });
            return { externalMessageId: sent.id };
          }
        }
      } catch {
        // Fall through to regular send
      }
    }

    // Reply to specific message if provided
    if (payload.replyToMessageId) {
      try {
        const msg = await textChannel.messages.fetch(payload.replyToMessageId);
        const sent = await msg.reply({ content: text || undefined, files });
        return { externalMessageId: sent.id };
      } catch {
        // Fall through to regular send
      }
    }

    const sent = await textChannel.send({ content: text || " ", files });
    return {
      externalMessageId: sent.id,
      chunkIndex: payload.chunkIndex,
      totalChunks: payload.totalChunks,
    };
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    // Ignore bot messages (including our own)
    if (msg.author.bot) return;

    const peerId = msg.channelId;
    if (!peerId) return;

    const text = normalizeChannelText(msg.content);
    const attachments = await extractDiscordAttachments(msg);

    const threadId = msg.channel.isThread() ? msg.channel.id : null;
    const parentChannelId = threadId && "parentId" in msg.channel ? (msg.channel.parentId ?? peerId) : peerId;

    const inbound: ChannelInboundMessage = {
      connectionId: this.connectionId,
      characterId: this.characterId,
      channelType: "discord",
      peerId: parentChannelId,
      peerName:
        msg.guild?.name
          ? `${msg.guild.name} #${("name" in msg.channel ? msg.channel.name : peerId)}`
          : msg.author.username,
      threadId,
      messageId: msg.id,
      text,
      attachments,
      timestamp: msg.createdAt.toISOString(),
    };

    await this.onMessage(inbound);
  }
}

async function extractDiscordAttachments(
  msg: DiscordMessage
): Promise<ChannelInboundMessage["attachments"]> {
  const result: NonNullable<ChannelInboundMessage["attachments"]> = [];

  for (const attachment of msg.attachments.values()) {
    const mimeType = attachment.contentType || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");

    if (!isImage && !isAudio) continue;

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) continue;

      const arrayBuffer = await response.arrayBuffer();
      result.push({
        type: isImage ? "image" : "audio",
        filename: attachment.name || `discord-${attachment.id}`,
        mimeType,
        data: Buffer.from(arrayBuffer),
      });
    } catch (error) {
      console.error(`[Discord] Failed to download attachment ${attachment.id}:`, error);
    }
  }

  return result;
}
