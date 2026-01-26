import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getChannelConnection,
  listChannelConnections,
  updateChannelConnection,
  getOrCreateLocalUser,
} from "@/lib/db/queries";
import { WhatsAppConnector } from "./connectors/whatsapp";
import { TelegramConnector } from "./connectors/telegram";
import { SlackConnector } from "./connectors/slack";
import { ChannelConnector, ChannelSendPayload, ChannelSendResult, ChannelStatus } from "./types";
import { handleInboundMessage } from "./inbound";

class ChannelManager {
  private connectors = new Map<string, ChannelConnector>();
  private qrCodes = new Map<string, string>();
  private bootstrapped = false;

  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(settings.localUserId, settings.localUserEmail);
    const connections = await listChannelConnections({ userId: dbUser.id });

    await Promise.all(
      connections.map((conn) =>
        this.connect(conn.id).catch((error) => {
          console.error("[Channels] Failed to connect", conn.id, error);
        })
      )
    );
  }

  getQrCode(connectionId: string): string | null {
    return this.qrCodes.get(connectionId) ?? null;
  }

  async connect(connectionId: string): Promise<ChannelConnector | null> {
    const existing = this.connectors.get(connectionId);
    if (existing && existing.status === "connected") {
      return existing;
    }

    const connection = await getChannelConnection(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const config = connection.config as { type?: string } | null;
    if (!config || typeof config !== "object") {
      throw new Error("Invalid channel configuration");
    }

    await updateChannelConnection(connectionId, { status: "connecting", lastError: null });

    const updateStatus = async (status: ChannelStatus, error?: string | null) => {
      await updateChannelConnection(connectionId, {
        status,
        lastError: error ?? null,
      });
    };

    const handleQr = (qr: string | null) => {
      if (qr) {
        this.qrCodes.set(connectionId, qr);
      } else {
        this.qrCodes.delete(connectionId);
      }
    };

    let connector: ChannelConnector;
    if (connection.channelType === "whatsapp") {
      connector = new WhatsAppConnector({
        connectionId,
        characterId: connection.characterId,
        config: { type: "whatsapp", ...(config as any) },
        onMessage: handleInboundMessage,
        onStatus: updateStatus,
        onQr: handleQr,
      });
    } else if (connection.channelType === "telegram") {
      connector = new TelegramConnector({
        connectionId,
        characterId: connection.characterId,
        config: { type: "telegram", ...(config as any) },
        onMessage: handleInboundMessage,
        onStatus: updateStatus,
      });
    } else if (connection.channelType === "slack") {
      connector = new SlackConnector({
        connectionId,
        characterId: connection.characterId,
        config: { type: "slack", ...(config as any) },
        onMessage: handleInboundMessage,
        onStatus: updateStatus,
      });
    } else {
      throw new Error(`Unsupported channel type: ${connection.channelType}`);
    }

    this.connectors.set(connectionId, connector);
    try {
      await connector.connect();
      return connector;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateStatus("error", message);
      this.connectors.delete(connectionId);
      throw error;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const connector = this.connectors.get(connectionId);
    if (connector) {
      await connector.disconnect();
    }
    this.connectors.delete(connectionId);
    this.qrCodes.delete(connectionId);
    await updateChannelConnection(connectionId, { status: "disconnected" });
  }

  async sendMessage(connectionId: string, payload: ChannelSendPayload): Promise<ChannelSendResult> {
    const connector = await this.connect(connectionId);
    if (!connector) {
      throw new Error("Channel connector unavailable");
    }
    return connector.sendMessage(payload);
  }
}

let singleton: ChannelManager | null = null;

export function getChannelManager(): ChannelManager {
  if (!singleton) {
    singleton = new ChannelManager();
  }
  return singleton;
}
