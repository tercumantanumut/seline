"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Filter, Loader2, Pin, PlusCircle, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useContextStatus } from "@/lib/hooks/use-context-status";
import { useSessionSyncStore } from "@/lib/stores/session-sync-store";
import { cn } from "@/lib/utils";
import { SessionItem } from "./session-item";
import type { SessionInfo, SessionChannelType } from "./types";

type DateRangeFilter = "all" | "today" | "week" | "month";
type ChannelFilter = "all" | SessionChannelType;

interface GroupedSessions {
  today: SessionInfo[];
  week: SessionInfo[];
  older: SessionInfo[];
}

interface SessionListProps {
  sessions: SessionInfo[];
  pinnedSessions: SessionInfo[];
  groupedSessions: GroupedSessions;
  orderedSessions: SessionInfo[];
  currentSessionId: string | null;
  loadingSessions: boolean;
  hasMore: boolean;
  totalCount: number;
  searchQuery: string;
  channelFilter: ChannelFilter;
  dateRange: DateRangeFilter;
  filtersOpen: boolean;
  connectedCount: number;
  editingSessionId: string | null;
  editTitle: string;
  setEditTitle: (value: string) => void;
  onSearchChange: (value: string) => void;
  onChannelFilterChange: (value: ChannelFilter) => void;
  onDateRangeChange: (value: DateRangeFilter) => void;
  onToggleFilters: () => void;
  onLoadMore: () => void;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteRequest: (session: SessionInfo) => void;
  onArchiveSession: (sessionId: string) => Promise<void>;
  onExportSession: (sessionId: string, format: "markdown" | "json" | "text") => Promise<void>;
  onResetChannelSession: (sessionId: string) => void;
  onPinSession: (sessionId: string) => Promise<void>;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (session: SessionInfo) => void;
}

export function SessionList({
  sessions,
  pinnedSessions,
  groupedSessions,
  orderedSessions,
  currentSessionId,
  loadingSessions,
  hasMore,
  totalCount,
  searchQuery,
  channelFilter,
  dateRange,
  filtersOpen,
  connectedCount,
  editingSessionId,
  editTitle,
  setEditTitle,
  onSearchChange,
  onChannelFilterChange,
  onDateRangeChange,
  onToggleFilters,
  onLoadMore,
  onNewSession,
  onSwitchSession,
  onDeleteRequest,
  onArchiveSession,
  onExportSession,
  onResetChannelSession,
  onPinSession,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
}: SessionListProps) {
  const t = useTranslations("chat");
  const tChannels = useTranslations("channels");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadedCount = sessions.length;
  const hasNoResults = !loadingSessions && loadedCount === 0;
  const shouldGroupSessions = sessions.length > 5 && !searchQuery.trim();
  const pinnedIds = new Set(pinnedSessions.map((s) => s.id));
  const activeFilterCount =
    Number(channelFilter !== "all") + Number(dateRange !== "all");

  const { status: contextStatus } = useContextStatus({ sessionId: currentSessionId });
  const setSessionContextStatus = useSessionSyncStore((state) => state.setSessionContextStatus);

  useEffect(() => {
    if (!currentSessionId) return;

    if (!contextStatus || contextStatus.status === "safe") {
      setSessionContextStatus(currentSessionId, null);
      return;
    }

    setSessionContextStatus(currentSessionId, {
      status: contextStatus.status,
      percentage: contextStatus.percentage,
      updatedAt: Date.now(),
    });
  }, [
    currentSessionId,
    contextStatus?.status,
    contextStatus?.percentage,
    setSessionContextStatus,
  ]);

  const renderSessionGroup = (values: SessionInfo[], label?: string) => {
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
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={() => onStartEdit(session)}
              onDelete={() => onDeleteRequest(session)}
              onArchive={() => void onArchiveSession(session.id)}
              onExport={(format) => void onExportSession(session.id, format)}
              onResetChannel={() => onResetChannelSession(session.id)}
              isPinned={session.metadata?.pinned === true}
              onPin={() => void onPinSession(session.id)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-4 pb-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold font-mono text-terminal-dark uppercase tracking-wider">
            {t("sidebar.history")}
          </h3>
          {totalCount > 0 ? (
            <span className="text-[10px] font-mono text-terminal-muted/70 tabular-nums">
              {totalCount.toLocaleString()}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-terminal-muted" />
            <Input
              ref={searchInputRef}
              className={cn("pl-8 h-9 font-mono text-sm", searchQuery ? "pr-8" : "")}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("sidebar.searchPlaceholder")}
              aria-label={t("sidebar.searchPlaceholder")}
              title={t("sidebar.searchShortcutHint")}
            />
            {searchQuery ? (
              <button
                className="absolute right-2 top-2.5 text-terminal-muted hover:text-terminal-dark transition-colors"
                onClick={() => onSearchChange("")}
                aria-label={t("sidebar.clearSearch")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewSession}
            title={t("sidebar.newTitle")}
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
          onClick={onToggleFilters}
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
                      variant={channelFilter === option ? "default" : "outline"}
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
                  <p className="px-1 pt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-terminal-amber/80 flex items-center gap-1.5">
                    <Pin className="h-2.5 w-2.5" />
                    {t("sidebar.pinnedSection")}
                    <span className="ml-auto tabular-nums text-terminal-amber/60 normal-case">{pinnedSessions.length}</span>
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
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                        onStartEdit={() => onStartEdit(session)}
                        onDelete={() => onDeleteRequest(session)}
                        onArchive={() => void onArchiveSession(session.id)}
                        onExport={(format) => void onExportSession(session.id, format)}
                        onResetChannel={() => onResetChannelSession(session.id)}
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
                  {renderSessionGroup(groupedSessions.today.filter((s) => !pinnedIds.has(s.id)), t("sidebar.groups.today"))}
                  {renderSessionGroup(groupedSessions.week.filter((s) => !pinnedIds.has(s.id)), t("sidebar.groups.week"))}
                  {renderSessionGroup(groupedSessions.older.filter((s) => !pinnedIds.has(s.id)), t("sidebar.groups.older"))}
                </>
              ) : (
                renderSessionGroup(orderedSessions.filter((s) => !pinnedIds.has(s.id)))
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
    </div>
  );
}
