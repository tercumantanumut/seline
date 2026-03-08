"use client";

import { useMemo } from "react";
import { Camera, FolderPlus, Plug, MoreHorizontal, Copy, Puzzle } from "lucide-react";
import {
  Wrench,
  Database,
  ChartBar,
  Trash,
  Plug as PhosphorPlug,
  UserCircle,
  Pencil,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GradientBackground } from "@/components/ui/noisy-gradient-backgrounds";
import type { GradientColor } from "@/components/ui/noisy-gradient-backgrounds";
import { getAgentAccentColor } from "@/lib/personalization/accent-colors";
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
  onOpenFoldersDialog: () => void;
  onEditIdentity: () => void;
  onEditTools: () => void;
  onEditMcp: () => void;
  onEditPlugins: () => void;
  onEditAvatar3d: () => void;
  onNavigateDashboard: () => void;
  onDuplicate: () => void;
  isDuplicating?: boolean;
  onDelete: () => void;
}

export function SidebarCharacterProfile({
  character,
  avatarUrl,
  initials,
  channelConnections,
  channelsLoading,
  onOpenAvatarDialog,
  onOpenChannelsDialog,
  onOpenFoldersDialog,
  onEditIdentity,
  onEditTools,
  onEditMcp,
  onEditPlugins,
  onEditAvatar3d,
  onNavigateDashboard,
  onDuplicate,
  isDuplicating = false,
  onDelete,
}: SidebarCharacterProfileProps) {
  const t = useTranslations("chat");
  const tPicker = useTranslations("picker");
  const tChannels = useTranslations("channels");

  const accentColor = useMemo(
    () => getAgentAccentColor(character.id),
    [character.id]
  );

  const gradientColors = useMemo((): GradientColor[] => {
    const hex = accentColor.hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dr = Math.max(0, Math.round(r * 0.3));
    const dg = Math.max(0, Math.round(g * 0.3));
    const db = Math.max(0, Math.round(b * 0.3));
    return [
      { color: `rgba(${dr},${dg},${db},1)`, stop: "0%" },
      { color: `rgba(${r},${g},${b},1)`, stop: "60%" },
      { color: `rgba(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)},1)`, stop: "100%" },
    ];
  }, [accentColor.hex]);

  const connectedCount = channelConnections.filter(
    (connection) => connection.status === "connected",
  ).length;

  return (
    <div className="shrink-0 px-4 pt-3 pb-2">
      <div className="group/card relative overflow-hidden rounded-lg border border-terminal-border/30 bg-terminal-cream/80 p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenAvatarDialog}
            className="relative group cursor-pointer shrink-0"
            title={t("sidebar.changeAvatar")}
            aria-label={t("sidebar.changeAvatar")}
          >
            <Avatar className="h-10 w-10 shadow-sm">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={character.name} />
              ) : null}
              <AvatarFallback className="relative overflow-hidden">
                <GradientBackground
                  colors={gradientColors}
                  gradientOrigin="bottom-middle"
                  gradientSize="150% 150%"
                  noiseIntensity={0.9}
                  noisePatternAlpha={45}
                  noisePatternSize={60}
                  noisePatternRefreshInterval={7}
                  className="rounded-full"
                />
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-terminal-dark/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Camera className="h-3.5 w-3.5 text-terminal-cream" />
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold font-mono text-terminal-dark">
              {character.displayName || character.name}
            </h2>
            <div className="mt-1.5 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenFoldersDialog}
                className="h-6 px-1.5 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10"
              >
                <FolderPlus className="mr-1 h-3 w-3" />
                <span className="text-[10px] font-mono">
                  {t("sidebar.folders")}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenChannelsDialog}
                className="h-6 px-1.5 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10"
              >
                <Plug className="mr-1 h-3 w-3" />
                <span className="text-[10px] font-mono">
                  {t("sidebar.channels")}
                </span>
              </Button>
            </div>
            {connectedCount > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {channelConnections
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
                  })}
              </div>
            )}
          </div>

          {/* 3-dot overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute top-2 right-2 rounded-md p-1 opacity-0 transition-opacity hover:bg-terminal-dark/10 group-hover/card:opacity-60 hover:!opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-offset-1 focus-visible:ring-offset-terminal-cream"
                aria-label={`Agent options for ${character.displayName || character.name}`}
              >
                <MoreHorizontal className="w-4 h-4 text-terminal-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 font-mono text-sm"
            >
              <DropdownMenuItem onSelect={onEditIdentity}>
                <Pencil className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.editInfo")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditTools}>
                <Wrench className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.manageTools")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenFoldersDialog}>
                <Database className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.syncFolders")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditMcp}>
                <PhosphorPlug className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.mcpTools")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditPlugins}>
                <Puzzle className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.plugins")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditAvatar3d}>
                <UserCircle className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.avatar3d")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNavigateDashboard}>
                <ChartBar className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.dashboard")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isDuplicating} onSelect={onDuplicate}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash className="w-3.5 h-3.5 mr-2" />
                {tPicker("menu.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
