export type SessionChannelType = "whatsapp" | "telegram" | "slack";

export interface SessionInfo {
  id: string;
  title: string | null;
  characterId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  messageCount?: number | null;
  totalTokenCount?: number | null;
  channelType?: SessionChannelType | null;
  metadata: {
    characterId?: string;
    characterName?: string;
    channelType?: SessionChannelType;
    channelPeerName?: string | null;
    channelPeerId?: string | null;
  };
}

