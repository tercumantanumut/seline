import { App, LogLevel } from "@slack/bolt";
import type { ChannelInboundMessage, ChannelConnector, ChannelSendPayload, ChannelSendResult, SlackConnectionConfig } from "../types";
import { normalizeChannelText } from "../utils";

type SlackConnectorOptions = {
  connectionId: string;
  characterId: string;
  config: SlackConnectionConfig;
  onMessage: (message: ChannelInboundMessage) => void | Promise<void>;
  onStatus: (status: ChannelConnector["status"], error?: string | null) => void;
};

export class SlackConnector implements ChannelConnector {
  connectionId: string;
  channelType: ChannelConnector["channelType"] = "slack";
  status: ChannelConnector["status"] = "disconnected";

  private app: App;
  private onMessage: SlackConnectorOptions["onMessage"];
  private onStatus: SlackConnectorOptions["onStatus"];
  private characterId: string;
  private botUserId: string | null = null;

  constructor(options: SlackConnectorOptions) {
    this.connectionId = options.connectionId;
    this.characterId = options.characterId;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.app = new App({
      token: options.config.botToken,
      appToken: options.config.appToken,
      signingSecret: options.config.signingSecret,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.onStatus(this.status);

    const auth = await this.app.client.auth.test();
    this.botUserId = auth.user_id || null;

    this.app.event("message", async ({ event, client }) => {
      if (event.subtype && event.subtype !== "file_share") {
        return;
      }
      const botId = "bot_id" in event ? (event as { bot_id?: string }).bot_id : undefined;
      if (botId || (this.botUserId && event.user === this.botUserId)) {
        return;
      }

      const peerId = event.channel;
      if (!peerId) return;

      const threadId = event.thread_ts ? String(event.thread_ts) : null;
      const text = normalizeChannelText(event.text || "");
      const attachments = await extractSlackAttachments(event, client, this.app.client.token);

      const peerName = await resolveSlackPeerName(client, peerId, event.user);

      const inbound: ChannelInboundMessage = {
        connectionId: this.connectionId,
        characterId: this.characterId,
        channelType: "slack",
        peerId,
        peerName,
        threadId,
        messageId: String(event.ts || Date.now()),
        text,
        attachments,
        timestamp: event.ts ? new Date(Number(event.ts) * 1000).toISOString() : undefined,
      };

      await this.onMessage(inbound);
    });

    await this.app.start();
    this.status = "connected";
    this.onStatus(this.status);
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
    this.status = "disconnected";
    this.onStatus(this.status);
  }

  async sendMessage(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    const text = payload.text || "";
    const attachment = payload.attachments?.[0];

    if (attachment && attachment.type === "image") {
      const uploadArgs: any = {
        channels: payload.peerId,
        file: attachment.data,
        filename: attachment.filename,
        filetype: attachment.mimeType,
        initial_comment: text || undefined,
      };
      if (payload.threadId) {
        uploadArgs.thread_ts = payload.threadId;
      }
      const uploaded = await this.app.client.files.upload(uploadArgs);
      const fileId = (uploaded.file as { id?: string })?.id || `${payload.peerId}:${Date.now()}`;
      return { externalMessageId: String(fileId) };
    }

    const sent = await this.app.client.chat.postMessage({
      channel: payload.peerId,
      text: text || " ",
      thread_ts: payload.threadId || undefined,
    });
    return { externalMessageId: String(sent.ts || `${payload.peerId}:${Date.now()}`) };
  }
}

async function resolveSlackPeerName(client: any, channelId: string, userId?: string | null) {
  try {
    const channelInfo = await client.conversations.info({ channel: channelId });
    const channelName = channelInfo.channel?.name || channelInfo.channel?.user;
    if (channelName) {
      return channelName;
    }
  } catch {
    // Ignore
  }

  if (userId) {
    try {
      const userInfo = await client.users.info({ user: userId });
      return userInfo.user?.real_name || userInfo.user?.name || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function extractSlackAttachments(event: any, client: any, token?: string | undefined) {
  const attachments: ChannelInboundMessage["attachments"] = [];
  const files = event.files as Array<{ url_private_download?: string; mimetype?: string; name?: string }> | undefined;
  const file = files?.find((item) => item.mimetype?.startsWith("image/"));
  if (!file?.url_private_download) {
    return attachments;
  }

  const response = await fetch(file.url_private_download, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    if (response.status === 403) {
      console.error(
        `[Slack] Permission denied downloading file "${file.name}" (403). ` +
        `Your Slack app is missing the "files:read" OAuth scope. ` +
        `Go to api.slack.com → your app → Features & Permissions → Scopes, ` +
        `add "files:read", and reinstall the app.`
      );
    } else {
      console.error(
        `[Slack] Failed to download file "${file.name}" — ` +
        `${response.status} ${response.statusText}. ` +
        `The bot token may be missing or expired.`
      );
    }
    return attachments;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") || file.mimetype || "image/jpeg";
  attachments.push({
    type: "image",
    filename: file.name || `slack-${Date.now()}.jpg`,
    mimeType,
    data: buffer,
  });

  return attachments;
}
