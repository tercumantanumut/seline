"use client";

import { Archive, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SessionInfo } from "./types";

interface SidebarArchivedProps {
  archivedOpen: boolean;
  onToggle: () => void;
  archivedSessions: SessionInfo[];
  loadingArchived: boolean;
  onRestoreSession: (sessionId: string) => Promise<void>;
  onArchivedRestored: (sessionId: string) => void;
}

export function SidebarArchived({
  archivedOpen,
  onToggle,
  archivedSessions,
  loadingArchived,
  onRestoreSession,
  onArchivedRestored,
}: SidebarArchivedProps) {
  const t = useTranslations("chat");

  return (
    <div className="shrink-0 px-4 pb-1">
      <button
        className="flex w-full items-center justify-between rounded-md border border-terminal-border/40 bg-terminal-cream/40 px-2.5 py-1.5 text-left hover:bg-terminal-cream/70 transition-colors"
        onClick={onToggle}
        aria-expanded={archivedOpen}
      >
        <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted">
          <Archive className="h-3 w-3" />
          {t("sidebar.archived")}
          {archivedSessions.length > 0 && archivedOpen ? (
            <span className="ml-1 text-[10px] text-terminal-muted/60">({archivedSessions.length})</span>
          ) : null}
        </span>
        {archivedOpen ? (
          <ChevronDown className="h-3 w-3 text-terminal-muted/60" />
        ) : (
          <ChevronRight className="h-3 w-3 text-terminal-muted/60" />
        )}
      </button>
      {archivedOpen && (
        <div className="mt-1 space-y-1 rounded-md border border-terminal-border/30 bg-terminal-cream/30 p-1.5">
          {loadingArchived ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-terminal-muted" />
            </div>
          ) : archivedSessions.length === 0 ? (
            <p className="py-3 text-center text-xs font-mono text-terminal-muted/60">
              {t("sidebar.noArchived")}
            </p>
          ) : (
            archivedSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-terminal-cream/60 transition-colors group"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-terminal-muted/80">
                  {session.title || t("session.untitled")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1.5 h-6 shrink-0 px-2 text-[10px] font-mono text-terminal-green opacity-0 group-hover:opacity-100 hover:bg-terminal-green/10"
                  onClick={() => {
                    void onRestoreSession(session.id).then(() => {
                      onArchivedRestored(session.id);
                    });
                  }}
                >
                  {t("sidebar.restore")}
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
