"use client";

import {
  Archive,
  Clock3,
  MessageCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";
import { CHANNEL_TYPE_ICONS } from "@/components/chat/chat-sidebar/constants";
import { cn } from "@/lib/utils";

interface BrowserWorkspaceLibraryProps {
  currentCharacterName: string;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onActivateSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: (characterId?: string) => void;
  archivedSessions: SessionInfo[];
  loadingArchived: boolean;
  onRestoreArchivedSession: (sessionId: string) => void;
}

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export function BrowserWorkspaceLibrary({
  currentCharacterName,
  sessions,
  currentSessionId,
  searchQuery,
  onSearchQueryChange,
  onActivateSession,
  onDeleteSession,
  onNewSession,
  archivedSessions,
  loadingArchived,
  onRestoreArchivedSession,
}: BrowserWorkspaceLibraryProps) {
  const t = useTranslations("chat");

  return (
    <div className="flex max-h-[72vh] min-h-0 w-[380px] overflow-hidden bg-card text-card-foreground">
      <div className="flex min-h-0 w-full flex-col">
        <div className="border-b border-border/50 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("browserWorkspace.library")}
              </p>
              <h3 className="font-mono text-sm font-semibold text-card-foreground">
                {currentCharacterName}
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onNewSession()}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("sidebar.new")}
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={t("sidebar.searchPlaceholder")}
              className="h-9 pl-9 font-mono text-sm"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-4">
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("sidebar.history")}
                </p>
              </div>
              <div className="space-y-1.5">
                {sessions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-center font-mono text-xs text-muted-foreground">
                    {t("browserWorkspace.emptyDescription")}
                  </div>
                ) : (
                  sessions.map((session) => {
                    const isActive = session.id === currentSessionId;
                    const ChannelIcon = session.channelType ? CHANNEL_TYPE_ICONS[session.channelType] : null;
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2",
                          isActive
                            ? "bg-primary/8"
                            : "hover:bg-muted/60",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onActivateSession(session.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {ChannelIcon ? (
                            <ChannelIcon className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          ) : (
                            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-card-foreground">
                              {session.title || t("session.untitled")}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                              <Clock3 className="h-3 w-3" />
                              <span>{formatRelativeDate(session.updatedAt)}</span>
                              {session.hasActiveRun ? (
                                <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
                                  {t("browserWorkspace.running")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteSession(session.id)}
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={t("sidebar.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-muted-foreground" />
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("sidebar.archived")}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-2">
                {loadingArchived ? (
                  <div className="px-2 py-4 text-center font-mono text-xs text-muted-foreground">
                    {t("loading")}
                  </div>
                ) : archivedSessions.length === 0 ? (
                  <div className="px-2 py-4 text-center font-mono text-xs text-muted-foreground">
                    {t("sidebar.noArchived")}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {archivedSessions.slice(0, 8).map((session) => (
                      <div key={session.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                          {session.title || t("session.untitled")}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestoreArchivedSession(session.id)}
                          className="h-6 px-2 font-mono text-[10px] text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                        >
                          {t("sidebar.restore")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
