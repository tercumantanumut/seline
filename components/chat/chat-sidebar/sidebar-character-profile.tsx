"use client";

import { Camera, Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CHANNEL_TYPE_ICONS } from "./constants";
import type { SessionChannelType } from "./types";

interface CharacterFullData {
  id: string;
  name: string;
  displayName?: string | null;
  tagline?: string | null;
}

interface ChannelConnectionSummary {
  id: string;
  channelType: SessionChannelType;
  status: "disconnected" | "connecting" | "connected" | "error";
}

interface SidebarCharacterProfileProps {
  character: CharacterFullData;
  avatarUrl: string | undefined;
  initials: string;
  channelConnections: ChannelConnectionSummary[];
  channelsLoading: boolean;
  onOpenAvatarDialog: () => void;
  onOpenChannelsDialog: () => void;
}

export function SidebarCharacterProfile({
  character,
  avatarUrl,
  initials,
  channelConnections,
  channelsLoading,
  onOpenAvatarDialog,
  onOpenChannelsDialog,
}: SidebarCharacterProfileProps) {
  const t = useTranslations("chat");
  const tChannels = useTranslations("channels");

  const connectedCount = channelConnections.filter(
    (connection) => connection.status === "connected",
  ).length;

  return (
    <div className="shrink-0 px-4 pt-3 pb-2">
      <div className="rounded-lg border border-terminal-border/30 bg-terminal-cream/80 p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenAvatarDialog}
            className="relative group cursor-pointer"
            title={t("sidebar.changeAvatar")}
            aria-label={t("sidebar.changeAvatar")}
          >
            <Avatar className="h-10 w-10 shadow-sm">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={character.name} />
              ) : null}
              <AvatarFallback className="bg-terminal-green/10 text-sm font-mono text-terminal-green">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-terminal-dark/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Camera className="h-3.5 w-3.5 text-terminal-cream" />
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate font-semibold font-mono text-terminal-dark">
                {character.displayName || character.name}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenChannelsDialog}
                className="h-7 px-2 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10"
              >
                <Plug className="mr-1 h-3.5 w-3.5" />
                <span className="text-[11px] font-mono">
                  {t("sidebar.channels")}
                </span>
              </Button>
            </div>
            {character.tagline ? (
              <p className="mt-0.5 truncate text-[11px] text-terminal-muted/80 font-mono">
                {character.tagline}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {channelsLoading ? (
                <span className="text-[10px] font-mono text-terminal-muted">
                  {tChannels("connections.loading")}
                </span>
              ) : connectedCount > 0 ? (
                channelConnections
                  .filter((connection) => connection.status === "connected")
                  .map((connection) => {
                    const Icon = CHANNEL_TYPE_ICONS[connection.channelType];
                    return (
                      <Badge
                        key={connection.id}
                        className="border border-transparent bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono text-emerald-700"
                      >
                        <Icon className="mr-1 h-3 w-3" />
                        {tChannels(`types.${connection.channelType}`)}
                      </Badge>
                    );
                  })
              ) : (
                <span className="text-[10px] font-mono text-terminal-muted">
                  {t("sidebar.noActiveChannels")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
