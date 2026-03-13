"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Globe,
  History,
  Home,
  Library,
  MessageCircle,
  Minus as MinusIcon,
  PanelLeft,
  Plus,
  RefreshCcw,
  Settings,
  Square as SquareIcon,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";
import { BrowserWorkspaceLibrary } from "@/components/chat/browser-workspace-library";
import { BrowserAgentMenu } from "@/components/chat/browser-agent-menu";
import { BrowserShortcutGuide } from "@/components/chat/browser-shortcut-guide";
import type { ChatWorkspaceTab } from "@/lib/stores/chat-workspace-store";
import { useBrowserTabShortcuts } from "@/components/chat/use-browser-tab-shortcuts";
import {
  useSessionContextStatus,
  useSessionData,
  useSessionSyncStore,
} from "@/lib/stores/session-sync-store";
import { getElectronAPI } from "@/lib/electron/types";

interface BrowserChatWorkspaceProps {
  currentSessionId: string | null;
  currentSessionTitle: string | null;
  tabs: ChatWorkspaceTab[];
  activeSessionId: string | null;
  canReopenLastClosed: boolean;
  onActivateSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onNewSession: (characterId?: string) => void;
  agents?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  character: {
    id: string;
    name: string;
    displayName?: string | null;
    tagline?: string | null;
    status?: string;
    metadata?: Record<string, unknown> | null;
    images?: Array<{ url: string; isPrimary: boolean; imageType: string }>;
  };
  currentCharacterId: string;
  currentCharacterName: string;
  sessions: SessionInfo[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  archivedSessions: SessionInfo[];
  loadingArchived: boolean;
  onRestoreArchivedSession: (sessionId: string) => void;
  onDeleteSessionFromLibrary: (sessionId: string) => void;
  onReopenLastClosed: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onSwitchToSidebar: () => void;
  children: ReactNode;
}

function BrowserChatTab({
  tab,
  isActive,
  onActivate,
  onClose,
}: {
  tab: ChatWorkspaceTab;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const syncedSession = useSessionData(tab.sessionId);
  // Use in-memory activeRuns only — DB-derived hasActiveRun flag can be stale
  const hasActiveRun = useSessionSyncStore((state) => state.activeRuns.has(tab.sessionId));

  const effectiveTitle = syncedSession?.title ?? tab.title ?? t("session.untitled");

  return (
    <div
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onActivate();
      }}
      className={cn(
        "group/tab relative flex min-w-[120px] max-w-[240px] items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-left cursor-pointer select-none transition-colors",
        isActive
          ? "bg-background text-foreground shadow-[0_-1px_3px_rgba(0,0,0,0.08)]"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      title={effectiveTitle}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          hasActiveRun
            ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]"
            : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{effectiveTitle}</span>
      {tab.characterName ? (
        <span className="max-w-[28px] shrink truncate text-[9px] uppercase tracking-wide text-muted-foreground/60">
          {tab.characterName}
        </span>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isActive
            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
            : "text-muted-foreground/50 hover:bg-accent hover:text-foreground",
        )}
        aria-label={t("sidebar.delete")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function BrowserChatWorkspace({
  currentSessionId,
  currentSessionTitle,
  tabs,
  activeSessionId,
  canReopenLastClosed,
  onActivateSession,
  onCloseSession,
  onNewSession,
  agents,
  character,
  currentCharacterId,
  currentCharacterName,
  sessions,
  searchQuery,
  onSearchQueryChange,
  archivedSessions,
  loadingArchived,
  onRestoreArchivedSession,
  onDeleteSessionFromLibrary,
  onReopenLastClosed,
  onGoHome,
  onOpenSettings,
  onSwitchToSidebar,
  children,
}: BrowserChatWorkspaceProps) {
  const t = useTranslations("chat");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [electronPlatform, setElectronPlatform] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    setIsElectronApp(!!electronAPI);
    setElectronPlatform(electronAPI?.platform ?? null);

    // Query initial fullscreen state and subscribe to changes
    if (electronAPI) {
      electronAPI.window.isFullScreen().then(setIsFullScreen);
      const cleanup = electronAPI.window.onFullscreenChanged(setIsFullScreen);
      return cleanup;
    }
  }, []);

  // Refs for current popover state (avoids stale closures in keydown handler)
  const libraryOpenRef = useRef(libraryOpen);
  libraryOpenRef.current = libraryOpen;
  const newTabOpenRef = useRef(newTabOpen);
  newTabOpenRef.current = newTabOpen;

  // Keyboard shortcuts: Cmd/Ctrl+K to toggle library, Escape to close popovers
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts inside dialogs/modals
      if ((e.target as HTMLElement)?.closest("[role='dialog']")) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — toggle Library panel
      if (mod && e.key === "k") {
        e.preventDefault();
        setLibraryOpen((prev) => !prev);
        return;
      }

      // Escape — close library or new-tab popover
      if (e.key === "Escape") {
        if (libraryOpenRef.current) {
          e.preventDefault();
          setLibraryOpen(false);
          return;
        }
        if (newTabOpenRef.current) {
          e.preventDefault();
          setNewTabOpen(false);
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isMac = electronPlatform === "darwin";
  const isWindows = electronPlatform === "win32";

  const activeContextStatus = useSessionContextStatus(activeSessionId);
  const activeHasRun = useSessionSyncStore((state) =>
    activeSessionId ? state.activeRuns.has(activeSessionId) : false
  );
  const activeSessionData = useSessionData(activeSessionId);

  useBrowserTabShortcuts({
    enabled: true,
    tabs,
    activeSessionId,
    onActivateSession,
    onCloseSession: (id) => onCloseSession(id),
    onNewSession: () => onNewSession(),
    onReopenLastClosed,
  });

  const activeTab = tabs.find((tab) => tab.sessionId === activeSessionId);
  const activeCharacterName = activeTab?.characterName ?? null;

  const addressTitle =
    currentSessionTitle ?? activeSessionData?.title ?? activeTab?.title ?? t("session.untitled");

  const addressStatus = useMemo(() => {
    if (!activeSessionId) {
      return null;
    }
    if (tabs.find((tab) => tab.sessionId === activeSessionId)?.unavailable) {
      return { tone: "warning", label: t("browserWorkspace.unavailable") };
    }
    if (activeHasRun) {
      return { tone: "live", label: t("browserWorkspace.running") };
    }
    if (activeContextStatus?.status === "critical" || activeContextStatus?.status === "exceeded") {
      return {
        tone: "warning",
        label: t("browserWorkspace.contextWarning", {
          percentage: Math.round(activeContextStatus.percentage),
        }),
      };
    }
    return null;
  }, [activeContextStatus, activeHasRun, activeSessionId, t, tabs]);

  // macOS Electron: traffic lights are overlaid by the OS at {x:16, y:12}.
  // With hiddenInset, web content starts at y=0. The tab bar IS the title bar
  // area — traffic lights sit within it. Only need left padding to clear them
  // horizontally. No top padding — that creates dead space.
  // In fullscreen on macOS, traffic lights are hidden (auto-show on hover in
  // the system-managed area), so no padding needed — content aligns to left.
  const macTrafficLightStyle = isMac && !isFullScreen
    ? { paddingLeft: 80 }
    : undefined;

  const renderChrome = (
    <div className="flex shrink-0 flex-col overflow-hidden bg-muted/40">
      <div
        className={cn(
          "flex h-10 items-center gap-2 px-3 md:px-4",
          isElectronApp && "webkit-app-region-drag",
        )}
        style={macTrafficLightStyle}
      >
        {/* Navigation controls */}
        <div className={cn("flex items-center gap-1", isElectronApp && "webkit-app-region-no-drag")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onGoHome}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("browserWorkspace.home")}
            aria-label={t("browserWorkspace.home")}
          >
            <Home className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onSwitchToSidebar}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("browserWorkspace.sidebarMode")}
            aria-label={t("browserWorkspace.sidebarMode")}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("browserWorkspace.settings")}
            aria-label={t("browserWorkspace.settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t("browserWorkspace.library")}
                aria-label={t("browserWorkspace.library")}
              >
                <Library className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-auto overflow-hidden rounded-lg border border-border bg-card p-0 shadow-xl data-[state=closed]:animate-none data-[state=open]:animate-none"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              const container = e.currentTarget as HTMLElement | null;
              const input = container?.querySelector("input");
              input?.focus();
            }}
          >
            <BrowserWorkspaceLibrary
              currentCharacterName={currentCharacterName}
              sessions={sessions}
              currentSessionId={currentSessionId}
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              onActivateSession={onActivateSession}
              onDeleteSession={onDeleteSessionFromLibrary}
              onNewSession={onNewSession}
              archivedSessions={archivedSessions}
              loadingArchived={loadingArchived}
              onRestoreArchivedSession={onRestoreArchivedSession}
            />
          </PopoverContent>
          </Popover>
        </div>

        <div role="tablist" aria-label="Chat tabs" className={cn("flex min-w-0 flex-1 items-center gap-2 overflow-x-auto", isElectronApp && "webkit-app-region-no-drag")}>
          {tabs.map((tab) => (
            <BrowserChatTab
              key={tab.sessionId}
              tab={tab}
              isActive={tab.sessionId === activeSessionId}
              onActivate={() => onActivateSession(tab.sessionId)}
              onClose={() => onCloseSession(tab.sessionId)}
            />
          ))}
        </div>

        <div className={cn("flex items-center gap-1.5", isElectronApp && "webkit-app-region-no-drag")}>
          {canReopenLastClosed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onReopenLastClosed}
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t("browserWorkspace.reopen")}
            >
              <History className="h-4 w-4" />
            </Button>
          ) : null}
          {agents && agents.length > 1 ? (
            <Popover open={newTabOpen} onOpenChange={setNewTabOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  title={t("sidebar.newTitle")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={4}
                className="w-56 rounded-lg border border-border bg-popover p-1 shadow-xl data-[state=closed]:animate-none data-[state=open]:animate-none"
              >
                <div className="border-b border-border/50 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("browserWorkspace.newChatWith")}
                </div>
                <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        onNewSession(agent.id);
                        setNewTabOpen(false);
                      }}
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
                    >
                      {agent.avatarUrl ? (
                        <img src={agent.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{agent.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              variant="default"
              size="icon"
              onClick={() => onNewSession()}
              className="h-8 w-8 rounded-full"
              title={t("sidebar.newTitle")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Windows window controls — min/max/close at far right of tab bar */}
        {isWindows && (
          <div className="mb-1.5 flex items-center webkit-app-region-no-drag">
            <button
              type="button"
              onClick={() => window.electronAPI?.window.minimize()}
              className="flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Minimize"
            >
              <MinusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI?.window.maximize()}
              className="flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Maximize"
            >
              <SquareIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI?.window.close()}
              className="flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-red-500/90 hover:text-white"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 bg-background px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-background px-3 py-1.5 text-foreground shadow-sm">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <div className="min-w-0 flex-1">
              {currentSessionId ? (
                <div className="flex items-center gap-2 truncate text-xs">
                  {activeCharacterName ? (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {activeCharacterName}
                    </span>
                  ) : null}
                  <span className="truncate font-medium text-foreground">{addressTitle}</span>
                </div>
              ) : (
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {t("browserWorkspace.noTabAddress")}
                </div>
              )}
            </div>
            {addressStatus ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                  addressStatus.tone === "live" && "bg-emerald-500/15 text-emerald-500",
                  addressStatus.tone === "warning" && "bg-amber-500/15 text-amber-500",
                  addressStatus.tone === "info" && "bg-sky-500/15 text-sky-500",
                )}
              >
                {addressStatus.label}
              </span>
            ) : null}
          </div>
          <BrowserShortcutGuide />
          <BrowserAgentMenu character={character} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {renderChrome}
      {activeSessionId ? (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="flex min-h-[320px] flex-1 items-center justify-center bg-background px-6">
          <div className="max-w-xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-lg">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h2 className="font-mono text-xl font-semibold text-foreground">{t("browserWorkspace.emptyTitle")}</h2>
            <p className="mt-3 font-mono text-sm text-muted-foreground">{t("browserWorkspace.emptyDescription")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                onClick={() => onNewSession()}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("browserWorkspace.openNew")}
              </Button>
              {canReopenLastClosed ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReopenLastClosed}
                  className="gap-2 font-mono"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t("browserWorkspace.reopen")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLibraryOpen(true)}
                className="gap-2 font-mono"
              >
                <Library className="h-4 w-4" />
                {t("browserWorkspace.openLibrary")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onSwitchToSidebar}
                className="gap-2 font-mono"
              >
                <PanelLeft className="h-4 w-4" />
                {t("browserWorkspace.sidebarMode")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
