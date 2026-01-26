import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason,
  proto,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import fs from "fs/promises";
import { ChannelConnector, ChannelInboundMessage, ChannelSendPayload, ChannelSendResult, WhatsAppConnectionConfig } from "../types";
import { getWhatsAppAuthPath, normalizeChannelText } from "../utils";

type WhatsAppConnectorOptions = {
  connectionId: string;
  characterId: string;
  config: WhatsAppConnectionConfig;
  onMessage: (message: ChannelInboundMessage) => void | Promise<void>;
  onStatus: (status: ChannelConnector["status"], error?: string | null) => void;
  onQr: (qr: string | null) => void;
};

export class WhatsAppConnector implements ChannelConnector {
  connectionId: string;
  channelType: ChannelConnector["channelType"] = "whatsapp";
  status: ChannelConnector["status"] = "disconnected";

  private sock: ReturnType<typeof makeWASocket> | null = null;
  private authPath: string;
  private onMessage: WhatsAppConnectorOptions["onMessage"];
  private onStatus: WhatsAppConnectorOptions["onStatus"];
  private onQr: WhatsAppConnectorOptions["onQr"];
  private characterId: string;
  private reconnecting = false;

  constructor(options: WhatsAppConnectorOptions) {
    this.connectionId = options.connectionId;
    this.characterId = options.characterId;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.onQr = options.onQr;
    this.authPath = options.config.authPath || getWhatsAppAuthPath(options.connectionId);
  }

  async connect(): Promise<void> {
    this.status = "connecting";
    this.onStatus(this.status);

    await fs.mkdir(this.authPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      version,
      logger,
      browser: ["Seline", "Desktop", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.onQr(qr);
      }

      if (connection === "open") {
        this.status = "connected";
        this.onQr(null);
        this.onStatus(this.status);
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        const restartRequired = reason === DisconnectReason.restartRequired;

        if (loggedOut) {
          this.status = "disconnected";
          this.onStatus(this.status, "Logged out");
          this.onQr(null);
          void fs.rm(this.authPath, { recursive: true, force: true });
          return;
        }

        if (restartRequired && !this.reconnecting) {
          this.reconnecting = true;
          this.status = "connecting";
          this.onStatus(this.status, "Restarting connection");
          setTimeout(() => {
            this.reconnecting = false;
            void this.connect().catch((error) => {
              this.onStatus("error", String(error));
            });
          }, 1500);
          return;
        }

        this.status = "error";
        const error = String(lastDisconnect?.error || "Connection closed");
        this.onStatus(this.status, error);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) {
          continue;
        }

        const peerId = msg.key.remoteJid;
        if (!peerId) continue;

        const text = extractText(msg.message);
        const attachments = await extractAttachments(msg, sock);
        const inbound: ChannelInboundMessage = {
          connectionId: this.connectionId,
          characterId: this.characterId,
          channelType: "whatsapp",
          peerId,
          peerName: msg.pushName || null,
          threadId: null,
          messageId: msg.key.id || `${peerId}:${Date.now()}`,
          text: normalizeChannelText(text),
          attachments,
          timestamp: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : undefined,
        };

        await this.onMessage(inbound);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // Ignore teardown errors.
      }
    }
    this.status = "disconnected";
    this.onStatus(this.status);
  }

  async sendMessage(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    if (!this.sock) {
      throw new Error("WhatsApp socket not connected");
    }

    const text = payload.text || "";
    const attachment = payload.attachments?.[0];
    let result: proto.WebMessageInfo | undefined;

    if (attachment && attachment.type === "image") {
      result = await this.sock.sendMessage(payload.peerId, {
        image: attachment.data,
        caption: text || undefined,
      });
    } else {
      result = await this.sock.sendMessage(payload.peerId, { text });
    }

    const externalMessageId = result?.key?.id || `${payload.peerId}:${Date.now()}`;
    return { externalMessageId };
  }

  getQrCode(): string | null {
    return null;
  }
}

function extractText(message: proto.IMessage): string | null {
  if (message.conversation) {
    return message.conversation;
  }
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }
  return null;
}

async function extractAttachments(
  msg: proto.IWebMessageInfo,
  sock: ReturnType<typeof makeWASocket>
) {
  const attachments: ChannelInboundMessage["attachments"] = [];
  const image = msg.message?.imageMessage;
  if (!image) {
    return attachments;
  }

  const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: sock.logger, reuploadRequest: sock.updateMediaMessage });
  if (buffer instanceof Buffer) {
    attachments.push({
      type: "image",
      filename: image?.caption ? `${image.caption}.jpg` : `whatsapp-${msg.key.id}.jpg`,
      mimeType: image?.mimetype || "image/jpeg",
      data: buffer,
    });
  }
  return attachments;
}
