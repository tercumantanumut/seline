"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  BookText,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Hash,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pin,
  Plug,
  PlusCircle,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Pencil,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarSelectionDialog } from "@/components/avatar-selection-dialog";
import { ChannelConnectionsDialog } from "@/components/channels/channel-connections-dialog";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { SessionItem } from "./session-item";
import { CHANNEL_TYPE_ICONS } from "./constants";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import type { CharacterDisplayData } from "@/components/assistant-ui/character-context";
import type { SessionChannelType, SessionInfo } from "./types";

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

type DateRangeFilter = "all" | "today" | "week" | "month";
type ChannelFilter = "all" | SessionChannelType;

interface CharacterSidebarProps {
  character: CharacterFullData;
  characterDisplay: CharacterDisplayData | null;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  loadingSessions: boolean;
  hasMore: boolean;
  totalCount: number;
  searchQuery: string;
  channelFilter: ChannelFilter;
  dateRange: DateRangeFilter;
  onSearchChange: (value: string) => void;
  onChannelFilterChange: (value: ChannelFilter) => void;
  onDateRangeChange: (value: DateRangeFilter) => void;
  onLoadMore: () => void;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResetChannelSession: (
    sessionId: string,
    options?: { archiveOld?: boolean },
  ) => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<boolean>;
  onExportSession: (
    sessionId: string,
    format: "markdown" | "json" | "text",
  ) => Promise<void>;
  onPinSession: (sessionId: string) => Promise<void>;
  onAvatarChange: (newAvatarUrl: string | null) => void;
}

function parseAsUTC(dateStr: string): Date {
  const normalized =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
      ? dateStr
      : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

function getDateBucket(date: Date): "today" | "week" | "older" {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days < 7) return "week";
  return "older";
}

export function CharacterSidebar({
  character,
  characterDisplay,
  sessions,
  currentSessionId,
  loadingSessions,
  hasMore,
  totalCount,
  searchQuery,
  channelFilter,
  dateRange,
  onSearchChange,
  onChannelFilterChange,
  onDateRangeChange,
  onLoadMore,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onResetChannelSession,
  onRenameSession,
  onExportSession,
  onPinSession,
  onAvatarChange,
}: CharacterSidebarProps) {
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const avatarUrl =
    characterDisplay?.avatarUrl || characterDisplay?.primaryImageUrl;
  const initials =
    characterDisplay?.initials || character.name.substring(0, 2).toUpperCase();
  const t = useTranslations("chat");
  const tChannels = useTranslations("channels");
  const formatter = useFormatter();
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [channelConnections, setChannelConnections] = useState<
    ChannelConnectionSummary[]
  >([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<SessionInfo | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const stopEditing = useCallback(() => {
    setEditingSessionId(null);
    setEditTitle("");
  }, []);

  const startEditingSession = useCallback((session: SessionInfo) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title || "");
  }, []);

  useEffect(() => {
    // Refs removed, logic moved to SessionItem
  }, [editingSessionId]);

  const handleRename = useCallback(async () => {
    if (!editingSessionId) {
      return;
    }
    const success = await onRenameSession(editingSessionId, editTitle);
    if (success) {
      stopEditing();
    }
  }, [editTitle, editingSessionId, onRenameSession, stopEditing]);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setPendingDeleteSession(null);
  }, []);

  const isChannelBoundSession = useCallback(
    (session: SessionInfo) =>
      Boolean(session.metadata?.channelType || session.channelType),
    [],
  );

  const handleDeleteRequest = useCallback(
    (session: SessionInfo) => {
      if (isChannelBoundSession(session)) {
        setPendingDeleteSession(session);
        setDeleteDialogOpen(true);
        return;
      }
      onDeleteSession(session.id);
    },
    [isChannelBoundSession, onDeleteSession],
  );

  const handleArchiveAndReset = useCallback(async () => {
    if (!pendingDeleteSession) {
      return;
    }
    await onResetChannelSession(pendingDeleteSession.id, { archiveOld: true });
    closeDeleteDialog();
  }, [closeDeleteDialog, onResetChannelSession, pendingDeleteSession]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteSession) {
      return;
    }
    await onDeleteSession(pendingDeleteSession.id);
    closeDeleteDialog();
  }, [closeDeleteDialog, onDeleteSession, pendingDeleteSession]);

  const pinnedSessions = useMemo(
    () => sessions.filter((s) => s.metadata?.pinned === true),
    [sessions],
  );

  const groupedSessions = useMemo(() => {
    const groups: Record<"today" | "week" | "older", SessionInfo[]> = {
      today: [],
      week: [],
      older: [],
    };
    for (const session of sessions) {
      if (session.metadata?.pinned) continue; // pinned shown separately at top
      const date = parseAsUTC(session.updatedAt);
      if (isNaN(date.getTime())) {
        groups.older.push(session);
        continue;
      }
      groups[getDateBucket(date)].push(session);
    }
    return groups;
  }, [sessions]);

  const loadChannelConnections = useCallback(async () => {
    setChannelsLoading(true);
    const { data, error } = await resilientFetch<{ connections?: ChannelConnectionSummary[] }>(
      `/api/channels/connections?characterId=${character.id}`,
    );
    if (data) {
      setChannelConnections(
        (data.connections || []) as ChannelConnectionSummary[],
      );
    }
    if (error) {
      console.error("Failed to load channel connections:", error);
    }
    setChannelsLoading(false);
  }, [character.id]);

  useEffect(() => {
    void loadChannelConnections();
  }, [loadChannelConnections]);

  const connectedCount = channelConnections.filter(
    (connection) => connection.status === "connected",
  ).length;
  const loadedCount = sessions.length;
  const hasNoResults = !loadingSessions && loadedCount === 0;
  const shouldGroupSessions = sessions.length > 5;
  const activeFilterCount =
    Number(channelFilter !== "all") + Number(dateRange !== "all");
  const orderedSessions = useMemo(
    () => [
      ...groupedSessions.today,
      ...groupedSessions.week,
      ...groupedSessions.older,
    ],
    [groupedSessions],
  );

  const renderSessionList = (values: SessionInfo[], label?: string) => {
    if (values.length === 0) return null;
    return (
      <div className="space-y-1.5">
        {label ? (
          <p className="px-1 pt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-terminal-muted/80">
            {label}
          </p>
        ) : null}
        {values.map((session) => {
          const isCurrent = session.id === currentSessionId;
          const isEditing = editingSessionId === session.id;
          return (
            <SessionItem
              key={session.id}
              session={session}
              isCurrent={isCurrent}
              isEditing={isEditing}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              onSwitch={() => onSwitchSession(session.id)}
              onSaveEdit={() => void handleRename()}
              onCancelEdit={stopEditing}
              onStartEdit={() => startEditingSession(session)}
              onDelete={() => handleDeleteRequest(session)}
              onExport={(format) => void onExportSession(session.id, format)}
              onResetChannel={() => void onResetChannelSession(session.id)}
              isPinned={session.metadata?.pinned === true}
              onPin={() => void onPinSession(session.id)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AvatarSelectionDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        characterId={character.id}
        characterName={character.displayName || character.name}
        currentAvatarUrl={avatarUrl || null}
        onAvatarChange={(url) => {
          onAvatarChange(url);
          setAvatarDialogOpen(false);
        }}
      />
      <ChannelConnectionsDialog
        open={channelsOpen}
        onOpenChange={setChannelsOpen}
        characterId={character.id}
        characterName={character.displayName || character.name}
        onConnectionsChange={setChannelConnections}
      />
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          } else {
            setDeleteDialogOpen(true);
          }
        }}
      >
        <AlertDialogContent className="font-mono">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-terminal-dark uppercase tracking-tight">
              {t("channelSession.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-terminal-muted">
              {t("channelSession.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">
              {t("sidebar.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-mono bg-terminal-green text-terminal-cream hover:bg-terminal-green/90"
              onClick={() => void handleArchiveAndReset()}
            >
              {t("channelSession.archiveReset")}
            </AlertDialogAction>
            <AlertDialogAction
              className="font-mono bg-red-600 text-white hover:bg-red-600/90"
              onClick={() => void handleConfirmDelete()}
            >
              {t("channelSession.deleteAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="rounded-lg border border-terminal-border/30 bg-terminal-cream/80 p-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setAvatarDialogOpen(true)}
              className="relative group cursor-pointer"
              title={t("sidebar.changeAvatar")}
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
                  onClick={() => setChannelsOpen(true)}
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

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 px-4 pb-2">
          <h3 className="mb-2 text-xs font-semibold font-mono text-terminal-dark uppercase tracking-wider">
            {t("sidebar.history")}
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-terminal-muted" />
              <Input
                className="pl-8 h-9 font-mono text-sm"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t("sidebar.searchPlaceholder")}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewSession}
              className="h-9 px-2.5 text-terminal-green hover:bg-terminal-green/10"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              <span className="text-xs font-mono font-medium">
                {t("sidebar.new")}
              </span>
            </Button>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2 space-y-1.5">
          <button
            className="flex w-full items-center justify-between rounded-md border border-terminal-border/50 bg-terminal-cream/60 px-2.5 py-2 text-left"
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
          >
            <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-dark">
              <Filter className="h-3.5 w-3.5" />
              {t("sidebar.filters")}
            </span>
            <div className="flex items-center gap-1.5">
              {activeFilterCount > 0 ? (
                <Badge className="border-terminal-border bg-terminal-dark/10 px-1.5 py-0 text-[10px] font-mono text-terminal-dark">
                  {activeFilterCount}
                </Badge>
              ) : null}
              {filtersOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-terminal-muted" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-terminal-muted" />
              )}
            </div>
          </button>
          {filtersOpen ? (
            <div className="space-y-2 rounded-md border border-terminal-border/40 bg-terminal-cream/40 p-2.5">
              {connectedCount > 0 || channelFilter !== "all" ? (
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "whatsapp", "telegram", "slack"] as const).map(
                    (option) => (
                      <Button
                        key={option}
                        variant={
                          channelFilter === option ? "default" : "outline"
                        }
                        size="sm"
                        className="h-7 px-2.5 text-[11px] font-mono"
                        onClick={() => onChannelFilterChange(option)}
                      >
                        {option === "all"
                          ? t("sidebar.channelAll")
                          : tChannels(`types.${option}`)}
                      </Button>
                    ),
                  )}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {(["all", "today", "week", "month"] as const).map((option) => (
                  <Button
                    key={option}
                    variant={dateRange === option ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-mono"
                    onClick={() => onDateRangeChange(option)}
                  >
                    {t(`sidebar.date.${option}`)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <ScrollArea className="flex-1 min-h-0 px-4">
          <div className="space-y-2 pr-2 pb-2">
            {loadingSessions && loadedCount === 0 ? (
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                    <Skeleton className="h-6 w-6 shrink-0 rounded-sm" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-full rounded" />
                      <Skeleton className="h-3 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : hasNoResults ? (
              <div className="rounded-lg border border-dashed border-terminal-border/60 bg-terminal-cream/40 p-4 text-center">
                <p className="text-sm text-terminal-muted font-mono">
                  {t("sidebar.empty")}
                </p>
                <p className="mt-1 text-xs text-terminal-muted/80 font-mono">
                  {t("sidebar.emptyHint")}
                </p>
                <Button
                  className="mt-3 h-8 font-mono"
                  size="sm"
                  onClick={onNewSession}
                >
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                  {t("sidebar.startNew")}
                </Button>
              </div>
            ) : (
              <>
                {pinnedSessions.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="px-1 pt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-terminal-amber/80 flex items-center gap-1">
                      <Pin className="h-2.5 w-2.5" />
                      {t("sidebar.pinnedSection")}
                    </p>
                    {pinnedSessions.map((session) => {
                      const isCurrent = session.id === currentSessionId;
                      const isEditing = editingSessionId === session.id;
                      return (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isCurrent={isCurrent}
                          isEditing={isEditing}
                          editTitle={editTitle}
                          setEditTitle={setEditTitle}
                          onSwitch={() => onSwitchSession(session.id)}
                          onSaveEdit={() => void handleRename()}
                          onCancelEdit={stopEditing}
                          onStartEdit={() => startEditingSession(session)}
                          onDelete={() => handleDeleteRequest(session)}
                          onExport={(format) => void onExportSession(session.id, format)}
                          onResetChannel={() => void onResetChannelSession(session.id)}
                          isPinned={true}
                          onPin={() => void onPinSession(session.id)}
                        />
                      );
                    })}
                    <div className="border-t border-terminal-border/40 pt-1" />
                  </div>
                ) : null}
                {shouldGroupSessions ? (
                  <>
                    {renderSessionList(
                      groupedSessions.today,
                      t("sidebar.groups.today"),
                    )}
                    {renderSessionList(
                      groupedSessions.week,
                      t("sidebar.groups.week"),
                    )}
                    {renderSessionList(
                      groupedSessions.older,
                      t("sidebar.groups.older"),
                    )}
                  </>
                ) : (
                  renderSessionList(orderedSessions)
                )}
              </>
            )}
            {hasMore && !hasNoResults ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 font-mono text-xs"
                onClick={onLoadMore}
                disabled={loadingSessions}
              >
                {loadingSessions ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {t("sidebar.loadingMore")}
                  </>
                ) : (
                  t("sidebar.loadMore", {
                    loaded: loadedCount,
                    total: totalCount,
                  })
                )}
              </Button>
            ) : null}
          </div>
        </ScrollArea>

        <div className="shrink-0 space-y-1.5 px-4 pb-4">
          <button
            className="flex w-full items-center justify-between rounded-md border border-terminal-border/50 bg-terminal-cream/60 px-2.5 py-2 text-left"
            onClick={() => setResourcesOpen((prev) => !prev)}
            aria-expanded={resourcesOpen}
          >
            <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-dark">
              <Link2 className="h-3.5 w-3.5" />
              {t("sidebar.quickLinks")}
            </span>
            {resourcesOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-terminal-muted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-terminal-muted" />
            )}
          </button>
          {resourcesOpen ? (
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href={`/agents/${character.id}/memory`}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.agentMemoryShort")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href={`/agents/${character.id}/schedules`}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.schedulesShort")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href={`/agents/${character.id}/skills`}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.skillsShort")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href="/skills/library"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.libraryShort")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href="/dashboard"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.dashboardShort")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                asChild
              >
                <Link
                  href="/usage"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem(
                        "seline-return-url",
                        window.location.href,
                      );
                    }
                  }}
                >
                  {t("sidebar.usageShort")}
                </Link>
              </Button>
            </div>
          ) : null}

          <button
            className="flex w-full items-center justify-between rounded-md border border-terminal-border/50 bg-terminal-cream/60 px-2.5 py-2 text-left"
            onClick={() => setDocsOpen((prev) => !prev)}
            aria-expanded={docsOpen}
          >
            <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-dark">
              <BookText className="h-3.5 w-3.5" />
              {t("sidebar.knowledgeBase")}
            </span>
            {docsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-terminal-muted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-terminal-muted" />
            )}
          </button>
          {docsOpen ? (
            <div className="max-h-56 overflow-y-auto rounded-md border border-terminal-border/40 bg-terminal-cream/30 p-2">
              <DocumentsPanel
                agentId={character.id}
                agentName={character.name}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
