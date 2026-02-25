export type SessionChannelType = "whatsapp" | "telegram" | "slack" | "discord";

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
  hasActiveRun?: boolean;
  metadata: {
    characterId?: string;
    characterName?: string;
    channelType?: SessionChannelType;
    channelPeerName?: string | null;
    channelPeerId?: string | null;
    pinned?: boolean;
    // Per-session model overrides (Bag of Models feature)
    sessionProvider?: string;
    sessionChatModel?: string;
    sessionResearchModel?: string;
    sessionVisionModel?: string;
    sessionUtilityModel?: string;
    workspaceInfo?: import("@/lib/workspace/types").WorkspaceInfo;
  };
}

