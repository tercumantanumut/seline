import path from "path";
import { ChannelType } from "./types";

export function getChannelsBasePath(): string {
  if (process.env.LOCAL_DATA_PATH) {
    return path.join(process.env.LOCAL_DATA_PATH, "channels");
  }
  return path.join(process.cwd(), ".local-data", "channels");
}

export function getWhatsAppAuthPath(connectionId: string): string {
  return path.join(getChannelsBasePath(), "whatsapp", connectionId, "auth");
}

export function buildConversationKey(params: {
  connectionId: string;
  peerId: string;
  threadId?: string | null;
}): string {
  const thread = params.threadId ?? "root";
  return `${params.connectionId}:${params.peerId}:${thread}`;
}

export function normalizeChannelText(text?: string | null): string {
  return (text ?? "").trim();
}

export function ensureChannelType(value: string): ChannelType {
  if (value === "whatsapp" || value === "telegram" || value === "slack" || value === "discord") {
    return value;
  }
  throw new Error(`Unsupported channel type: ${value}`);
}
