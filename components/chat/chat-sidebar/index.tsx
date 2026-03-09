"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AvatarSelectionDialog } from "@/components/avatar-selection-dialog";
import { ChannelConnectionsDialog } from "@/components/channels/channel-connections-dialog";
import {
  FolderManagerDialog,
  ToolEditorDialog,
  PluginEditorDialog,
  McpToolEditorDialog,
} from "@/components/character-picker-dialogs";
import {
  IdentityEditorDialog,
  McpRemovalWarningDialog,
  DeleteAgentDialog,
} from "@/components/character-picker-dialogs-2";
import { Avatar3DModelSelector } from "@/components/avatar-3d/avatar-model-selector";
import { useCharacterActions } from "@/components/character-picker-character-actions-hook";
import { useToolEditor } from "@/components/character-picker-tool-editor-hook";
import type { CharacterSummary } from "@/components/character-picker-types";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import type { CharacterDisplayData } from "@/components/assistant-ui/character-context";
import { getSessionActivityTimestamp } from "@/components/chat/chat-interface-utils";
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
  status?: string;
  metadata?: Record<string, unknown> | null;
  images?: Array<{
    url: string;
    isPrimary: boolean;
    imageType: string;
  }>;
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
  onAvatar3dConfigChange?: (config: { modelUrl: string; bodyType: "M" | "F" }) => void;
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
  onAvatar3dConfigChange,
}: CharacterSidebarProps) {
  const router = useRouter();
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const avatarUrl =
    characterDisplay?.avatarUrl || characterDisplay?.primaryImageUrl;
  const initials =
    characterDisplay?.initials || character.name.substring(0, 2).toUpperCase();
  const t = useTranslations("chat");
  const tPicker = useTranslations("picker");
  const tDeps = useTranslations("picker.toolEditor.dependencyWarnings");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<SessionInfo[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
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

  // Build a CharacterSummary from the full data for the agent action hooks
  const characterSummary = useMemo((): CharacterSummary => ({
    id: character.id,
    name: character.name,
    displayName: character.displayName,
    tagline: character.tagline,
    status: character.status || "active",
    metadata: character.metadata as CharacterSummary["metadata"],
    images: character.images,
    hasActiveSession: true,
  }), [character]);

  const reloadPage = useCallback(async () => {
    router.refresh();
  }, [router]);

  const charActions = useCharacterActions(
    tPicker,
    reloadPage,
    () => true, // always has active session — we're in a chat
  );

  const toolEditor = useToolEditor(tPicker, tDeps, reloadPage);

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
      const date = parseAsUTC(getSessionActivityTimestamp(session));
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
      <FolderManagerDialog
        open={foldersOpen}
        onOpenChange={setFoldersOpen}
        folderManagerCharacter={character as any}
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

      {/* Agent overflow menu dialogs */}
      <ToolEditorDialog
        open={toolEditor.toolEditorOpen}
        onOpenChange={toolEditor.setToolEditorOpen}
        editingCharacter={toolEditor.editingCharacter}
        availableTools={toolEditor.availableTools}
        selectedTools={toolEditor.selectedTools}
        isSaving={toolEditor.isSaving}
        toolSearchQuery={toolEditor.toolSearchQuery}
        setToolSearchQuery={toolEditor.setToolSearchQuery}
        collapsedCategories={toolEditor.collapsedCategories}
        toolsByCategory={toolEditor.toolsByCategory}
        filteredToolsByCategory={toolEditor.filteredToolsByCategory}
        areDependenciesMet={toolEditor.areDependenciesMet}
        getDependencyWarning={toolEditor.getDependencyWarning}
        toggleCategory={toolEditor.toggleCategory}
        toggleAllInCategory={toolEditor.toggleAllInCategory}
        getSelectedCountInCategory={toolEditor.getSelectedCountInCategory}
        toggleTool={toolEditor.toggleTool}
        onSave={toolEditor.saveTools}
      />

      <PluginEditorDialog
        open={charActions.pluginEditorOpen}
        onOpenChange={charActions.setPluginEditorOpen}
        editingCharacter={charActions.pluginEditingCharacter}
        agentPlugins={charActions.agentPlugins}
        loadingAgentPlugins={charActions.loadingAgentPlugins}
        savingPluginId={charActions.savingPluginId}
        toggleAgentPlugin={charActions.toggleAgentPlugin}
      />

      <McpToolEditorDialog
        open={charActions.mcpToolEditorOpen}
        onOpenChange={charActions.setMcpToolEditorOpen}
        editingCharacter={charActions.mcpEditingCharacter}
        mcpServers={charActions.mcpServers}
        mcpTools={charActions.mcpTools}
        mcpToolPreferences={charActions.mcpToolPreferences}
        onUpdate={charActions.onUpdateMcp}
        onComplete={charActions.saveMcpTools}
      />

      <IdentityEditorDialog
        open={charActions.identityEditorOpen}
        onOpenChange={charActions.setIdentityEditorOpen}
        identityForm={charActions.identityForm}
        setIdentityForm={charActions.setIdentityForm}
        generatedPrompt={charActions.generatedPrompt}
        isSaving={charActions.isSavingIdentity}
        onSave={charActions.saveIdentity}
      />

      <McpRemovalWarningDialog
        open={charActions.mcpRemovalWarningOpen}
        onOpenChange={charActions.setMcpRemovalWarningOpen}
        mcpToolsBeingRemoved={charActions.mcpToolsBeingRemoved}
        isSaving={charActions.isSavingMcp}
        onConfirm={(e) => {
          e.preventDefault();
          charActions.performMcpToolSave();
        }}
      />

      {charActions.avatar3dSelectorCharacter && (
        <Avatar3DModelSelector
          open={charActions.avatar3dSelectorOpen}
          onOpenChange={charActions.setAvatar3dSelectorOpen}
          characterId={charActions.avatar3dSelectorCharacter.id}
          characterName={charActions.avatar3dSelectorCharacter.displayName || charActions.avatar3dSelectorCharacter.name}
          currentAvatarConfig={charActions.avatar3dSelectorCharacter.metadata?.avatarConfig as any}
          onAvatarConfigChange={(config) => { onAvatar3dConfigChange?.(config); void reloadPage(); }}
        />
      )}

      <DeleteAgentDialog
        open={charActions.deleteDialogOpen}
        onOpenChange={charActions.setDeleteDialogOpen}
        characterToDelete={charActions.characterToDelete}
        isDeleting={charActions.isDeleting}
        onConfirm={(e) => {
          e.preventDefault();
          void charActions.deleteCharacter().then(() => {
            router.push("/");
          });
        }}
      />

      <SidebarCharacterProfile
        character={character}
        avatarUrl={avatarUrl ?? undefined}
        initials={initials}
        channelConnections={channelConnections}
        channelsLoading={channelsLoading}
        onOpenAvatarDialog={() => setAvatarDialogOpen(true)}
        onOpenChannelsDialog={() => setChannelsOpen(true)}
        onOpenFoldersDialog={() => setFoldersOpen(true)}
        onEditIdentity={() => charActions.openIdentityEditor(characterSummary)}
        onEditTools={() => toolEditor.openToolEditor(characterSummary)}
        onEditMcp={() => charActions.openMcpToolEditor(characterSummary)}
        onEditPlugins={() => charActions.openPluginEditor(characterSummary)}
        onEditAvatar3d={() => charActions.openAvatar3dSelector(characterSummary)}
        onNavigateDashboard={() => router.push("/dashboard")}
        onDuplicate={() => charActions.handleDuplicate(character.id)}
        isDuplicating={charActions.isDuplicating}
        onDelete={() => charActions.openDeleteDialog(characterSummary)}
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
