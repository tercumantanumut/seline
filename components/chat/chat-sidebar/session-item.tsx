"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Clock,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Loader2,
  Trash2,
  Download,
  RotateCcw,
  GitBranch,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionData, useSessionHasActiveRun } from "@/lib/stores/session-sync-store";
import { CHANNEL_TYPE_ICONS } from "./constants";
import type { SessionInfo } from "./types";

interface SessionItemProps {
  session: SessionInfo;
  isCurrent: boolean;
  isEditing: boolean;
  editTitle: string;
  setEditTitle: (title: string) => void;
  onSwitch: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onExport: (format: "markdown" | "json" | "text") => void;
  onResetChannel: () => void;
}

function parseAsUTC(dateStr: string): Date {
  const normalized =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
      ? dateStr
      : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

export function SessionItem({
  session: initialSession,
  isCurrent,
  isEditing,
  editTitle,
  setEditTitle,
  onSwitch,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onExport,
  onResetChannel,
}: SessionItemProps) {
  const t = useTranslations("chat");
  const tChannels = useTranslations("channels");
  const formatter = useFormatter();
  const editInputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  // Sync with global store for real-time updates
  const syncedSession = useSessionData(initialSession.id);
  const hasActiveRun = useSessionHasActiveRun(initialSession.id);

  // Merge initial session with synced data
  // Only override fields that are present in syncedSession and relevant for display
  const session = {
    ...initialSession,
    ...(syncedSession
      ? {
          title: syncedSession.title,
          updatedAt: syncedSession.updatedAt,
          messageCount: syncedSession.messageCount,
          channelType: syncedSession.channelType,
        }
      : {}),
  };

  const effectiveChannel = session.channelType ?? session.metadata?.channelType;
  const messageCount = session.messageCount ?? 0;

  const formatSessionDate = useCallback(
    (dateStr: string): string => {
      const date = parseAsUTC(dateStr);
      if (isNaN(date.getTime())) {
        return t("session.invalid");
      }
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) {
        return formatter.dateTime(date, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
      if (days === 1) {
        return t("session.yesterday");
      }
      if (days < 7) {
        return formatter.dateTime(date, { weekday: "short" });
      }
      return formatter.dateTime(date, { month: "short", day: "numeric" });
    },
    [formatter, t]
  );

  const handleInputBlur = useCallback(() => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    onSaveEdit();
  }, [onSaveEdit]);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSaveEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancelEdit();
      }
    },
    [onSaveEdit, onCancelEdit]
  );

  const handleActionMouseDown = useCallback(() => {
    skipBlurRef.current = true;
  }, []);

  const handleSaveClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSaveEdit();
    },
    [onSaveEdit]
  );

  const handleCancelClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onCancelEdit();
    },
    [onCancelEdit]
  );

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer",
        "transition-all duration-200 ease-out",
        isCurrent
          ? "bg-terminal-green/15 border-l-2 border-terminal-green shadow-sm"
          : "hover:bg-terminal-dark/8 border-l-2 border-transparent"
      )}
      onClick={() => {
        if (!isEditing) {
          onSwitch();
        }
      }}
    >
      {hasActiveRun ? (
        <Loader2
          className={cn(
            "h-4 w-4 flex-shrink-0 animate-spin text-terminal-green transition-colors duration-200"
          )}
        />
      ) : (
        <MessageCircle
          className={cn(
            "h-4 w-4 flex-shrink-0 transition-colors duration-200",
            isCurrent ? "text-terminal-green" : "text-terminal-muted"
          )}
        />
      )}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
            <Input
              ref={editInputRef}
              type="text"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              onClick={(event) => event.stopPropagation()}
              placeholder={t("sidebar.edit")}
              className="h-8 text-sm font-mono"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs font-mono"
                onMouseDown={handleActionMouseDown}
                onClick={handleSaveClick}
              >
                {t("sidebar.save")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-3 text-xs font-mono"
                onMouseDown={handleActionMouseDown}
                onClick={handleCancelClick}
              >
                {t("sidebar.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p
              className={cn(
                "text-sm font-mono truncate transition-colors duration-200",
                isCurrent ? "text-terminal-dark font-medium" : "text-terminal-muted"
              )}
            >
              {session.title || t("session.untitled")}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-mono text-terminal-muted/70">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatSessionDate(session.updatedAt)}
              </span>
              {messageCount > 0 ? (
                <span>{t("sidebar.messageCount", { count: messageCount })}</span>
              ) : null}
              {effectiveChannel ? (
                <Badge className="border border-terminal-dark/10 bg-terminal-cream/80 px-2 py-0.5 text-[10px] font-mono text-terminal-dark">
                  {(() => {
                    const Icon = CHANNEL_TYPE_ICONS[effectiveChannel];
                    return (
                      <>
                        <Icon className="mr-1 h-3 w-3" />
                        {tChannels(`types.${effectiveChannel}`)}
                      </>
                    );
                  })()}
                </Badge>
              ) : null}
              {session.metadata?.workspaceInfo?.branch && (
                <Badge
                  className="border border-terminal-dark/10 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-mono text-emerald-700 gap-1 cursor-default"
                >
                  <GitBranch className="h-2.5 w-2.5" />
                  {session.metadata.workspaceInfo.branch.replace(/^(feature|fix|chore|bugfix|hotfix)\//, "").slice(0, 20)}
                </Badge>
              )}
              {session.metadata?.workspaceInfo?.prNumber && session.metadata?.workspaceInfo?.prUrl && (
                <Badge
                  className="border border-blue-200 bg-blue-50/80 px-2 py-0.5 text-[10px] font-mono text-blue-700 gap-1 cursor-pointer hover:bg-blue-100/80"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    window.open(session.metadata.workspaceInfo!.prUrl!, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  PR #{session.metadata.workspaceInfo.prNumber}
                </Badge>
              )}
            </div>
          </>
        )}
      </div>
      {!isEditing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem onSelect={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
              {t("sidebar.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("markdown")}>
              <Download className="h-3.5 w-3.5" />
              {t("sidebar.exportMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("json")}>
              <Download className="h-3.5 w-3.5" />
              {t("sidebar.exportJson")}
            </DropdownMenuItem>
            {effectiveChannel ? (
              <DropdownMenuItem onSelect={onResetChannel}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("sidebar.resetChannel")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 hover:!text-red-600"
              onSelect={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("sidebar.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
