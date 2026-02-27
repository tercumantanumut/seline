"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AvatarSelectionDialog } from "@/components/avatar-selection-dialog";
import { ChannelConnectionsDialog } from "@/components/channels/channel-connections-dialog";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import type { CharacterDisplayData } from "@/components/assistant-ui/character-context";
import type { SessionChannelType, SessionInfo } from "./types";
import { parseAsUTC, getDateBucket } from "./sidebar-utils";
import { SidebarCharacterProfile } from "./sidebar-character-profile";
import { SidebarDeleteDialog } from "./sidebar-delete-dialog";
import { SessionList } from "./session-list";
import { SidebarArchived } from "./sidebar-archived";
import { SidebarQuickLinks } from "./sidebar-quick-links";

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
  onArchiveSession: (sessionId: string) => Promise<void>;
  onRestoreSession: (sessionId: string) => Promise<void>;
  characterId: string;
  onAvatarChange: (newAvatarUrl: string | null) => void;
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
  onArchiveSession,
  onRestoreSession,
  characterId,
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
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<SessionInfo[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
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

  // Press '/' to focus the session search field — handled inside SessionList via its own ref

  const stopEditing = useCallback(() => {
    setEditingSessionId(null);
    setEditTitle("");
  }, []);

  const startEditingSession = useCallback((session: SessionInfo) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title || "");
  }, []);

  useEffect(() => {
    if (!archivedOpen) return;
    let cancelled = false;
    setLoadingArchived(true);
    fetch(`/api/sessions?characterId=${characterId}&status=archived&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setArchivedSessions((data.sessions ?? []) as SessionInfo[]);
      })
      .catch(() => {/* silent */})
      .finally(() => { if (!cancelled) setLoadingArchived(false); });
    return () => { cancelled = true; };
  }, [archivedOpen, characterId]);

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

  const orderedSessions = useMemo(
    () => [
      ...groupedSessions.today,
      ...groupedSessions.week,
      ...groupedSessions.older,
    ],
    [groupedSessions],
  );

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
      <SidebarDeleteDialog
        open={deleteDialogOpen}
        pendingSession={pendingDeleteSession}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          } else {
            setDeleteDialogOpen(true);
          }
        }}
        onArchiveAndReset={handleArchiveAndReset}
        onConfirmDelete={handleConfirmDelete}
      />

      <SidebarCharacterProfile
        character={character}
        avatarUrl={avatarUrl ?? undefined}
        initials={initials}
        channelConnections={channelConnections}
        channelsLoading={channelsLoading}
        onOpenAvatarDialog={() => setAvatarDialogOpen(true)}
        onOpenChannelsDialog={() => setChannelsOpen(true)}
      />

      <SessionList
        sessions={sessions}
        pinnedSessions={pinnedSessions}
        groupedSessions={groupedSessions}
        orderedSessions={orderedSessions}
        currentSessionId={currentSessionId}
        loadingSessions={loadingSessions}
        hasMore={hasMore}
        totalCount={totalCount}
        searchQuery={searchQuery}
        channelFilter={channelFilter}
        dateRange={dateRange}
        filtersOpen={filtersOpen}
        connectedCount={connectedCount}
        editingSessionId={editingSessionId}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        onSearchChange={onSearchChange}
        onChannelFilterChange={onChannelFilterChange}
        onDateRangeChange={onDateRangeChange}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
        onLoadMore={onLoadMore}
        onNewSession={onNewSession}
        onSwitchSession={onSwitchSession}
        onDeleteRequest={handleDeleteRequest}
        onArchiveSession={onArchiveSession}
        onExportSession={onExportSession}
        onResetChannelSession={(sessionId) => void onResetChannelSession(sessionId)}
        onPinSession={onPinSession}
        onSaveEdit={() => void handleRename()}
        onCancelEdit={stopEditing}
        onStartEdit={startEditingSession}
      />

      <SidebarArchived
        archivedOpen={archivedOpen}
        onToggle={() => setArchivedOpen((prev) => !prev)}
        archivedSessions={archivedSessions}
        loadingArchived={loadingArchived}
        onRestoreSession={onRestoreSession}
        onArchivedRestored={(sessionId) =>
          setArchivedSessions((prev) => prev.filter((s) => s.id !== sessionId))
        }
      />

      <SidebarQuickLinks
        characterId={characterId}
        characterName={character.name}
        resourcesOpen={resourcesOpen}
        docsOpen={docsOpen}
        onToggleResources={() => setResourcesOpen((prev) => !prev)}
        onToggleDocs={() => setDocsOpen((prev) => !prev)}
      />
    </div>
  );
}
