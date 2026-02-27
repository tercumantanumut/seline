"use client";

import { Button } from "@/components/ui/button";
import {
  FolderIcon,
  RefreshCwIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
  FileIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  StarIcon,
  XCircleIcon,
  TrashIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { SyncFolder } from "./folder-sync-types";
import { parseStringArray, parseObject, formatBytes } from "./folder-sync-utils";

interface FolderItemProps {
  folder: SyncFolder;
  compact: boolean;
  expandedFolderId: string | null;
  syncingFolderId: string | null;
  removingFolderId: string | null;
  updatingFolderId: string | null;
  onToggleExpand: (id: string) => void;
  onSync: (id: string) => void;
  onCancelSync: (id: string) => void;
  onRemove: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onToggleAutoUpdates: (folder: SyncFolder) => void;
  onApplySimpleDefaults: (folder: SyncFolder) => void;
}

function getStatusIcon(status: SyncFolder["status"]) {
  switch (status) {
    case "synced": return <CheckCircleIcon className="w-4 h-4 text-terminal-green" />;
    case "syncing": return <Loader2Icon className="w-4 h-4 text-terminal-green animate-spin" />;
    case "error": return <AlertCircleIcon className="w-4 h-4 text-destructive" />;
    case "paused": return <AlertCircleIcon className="w-4 h-4 text-terminal-amber" />;
    case "pending": return <FileIcon className="w-4 h-4 text-terminal-muted" />;
    default: return <FileIcon className="w-4 h-4 text-terminal-muted" />;
  }
}

export function FolderItem({
  folder,
  compact,
  expandedFolderId,
  syncingFolderId,
  removingFolderId,
  updatingFolderId,
  onToggleExpand,
  onSync,
  onCancelSync,
  onRemove,
  onSetPrimary,
  onToggleAutoUpdates,
  onApplySimpleDefaults,
}: FolderItemProps) {
  const t = useTranslations("folderSync");
  const syncMode = folder.syncMode ?? "auto";
  const includeExts = parseStringArray(folder.includeExtensions);
  const excludeGlobs = parseStringArray(folder.excludePatterns);
  const typeFilters = parseStringArray(folder.fileTypeFilters);
  const skipReasons = parseObject(folder.skipReasons) as Record<string, number>;
  const runMetadata = parseObject(folder.lastRunMetadata);

  const behaviorSummary = syncMode === "auto"
    ? t("behaviorHybrid")
    : syncMode === "triggered"
      ? t("behaviorEventDriven")
      : syncMode === "scheduled"
        ? t("behaviorScheduled")
        : t("behaviorManual");
  const indexingModeLabel = folder.indexingMode === "full"
    ? t("modeFull")
    : folder.indexingMode === "files-only"
      ? t("modeFilesOnly")
      : t("modeAuto");
  const syncModeLabel = syncMode === "manual"
    ? t("modeManual")
    : syncMode === "scheduled"
      ? t("modeScheduled")
      : syncMode === "triggered"
        ? t("modeTriggered")
        : t("modeAuto");
  const chunkPresetLabel = folder.chunkPreset === "small"
    ? t("chunkSmall")
    : folder.chunkPreset === "large"
      ? t("chunkLarge")
      : folder.chunkPreset === "custom"
        ? t("chunkCustom")
        : t("chunkBalanced");
  const reindexPolicyLabel = (folder.reindexPolicy ?? "smart") === "always"
    ? t("reindexAlways")
    : (folder.reindexPolicy ?? "smart") === "never"
      ? t("reindexNever")
      : t("reindexSmart");
  const isSimpleDefaults =
    folder.indexingMode === "auto" &&
    syncMode === "triggered" &&
    (folder.reindexPolicy ?? "smart") === "never" &&
    (folder.chunkPreset ?? "balanced") === "balanced" &&
    (folder.maxFileSizeBytes ?? 10 * 1024 * 1024) === 10 * 1024 * 1024;
  const forceReindex = runMetadata.forceReindex === true;
  const lastRunReason = folder.lastRunTrigger === "triggered"
    ? t("lastRunReasonFileChange")
    : folder.lastRunTrigger === "manual"
      ? t("lastRunReasonManual")
      : folder.lastRunTrigger === "auto"
        ? t("lastRunReasonInitial")
        : folder.lastRunTrigger === "scheduled" && forceReindex
          ? t("lastRunReasonScheduledFull")
          : folder.lastRunTrigger === "scheduled"
            ? t("lastRunReasonScheduledCheck")
            : null;

  return (
    <div
      key={folder.id}
      className="rounded border border-terminal-border bg-terminal-cream/50 p-3"
    >
      <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:items-center md:gap-3">
        <FolderIcon className="w-5 h-5 text-terminal-green flex-shrink-0" />
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-mono text-sm text-terminal-dark truncate">
              {folder.displayName || folder.folderPath.split(/[/\\]/).pop()}
            </p>
            {folder.isPrimary && (
              <span className="text-[10px] bg-terminal-green/10 text-terminal-green border border-terminal-green/20 px-1.5 py-0 rounded font-mono uppercase font-bold tracking-wider">
                {t("primaryBadge")}
              </span>
            )}
            {folder.inheritedFromWorkflowId && (
              <span
                className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0 rounded font-mono uppercase font-bold tracking-wider"
                title={t("sharedFromWorkflow")}
                aria-label={t("sharedFromWorkflow")}
              >
                {t("workflowBadge")}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-terminal-muted truncate" title={folder.folderPath}>
            {folder.folderPath}
          </p>
          <p className="font-mono text-[10px] text-terminal-muted mt-1">
            {behaviorSummary}
          </p>
        </div>
        <div className="w-full md:w-auto flex flex-wrap justify-end items-center gap-1.5">
          {getStatusIcon(folder.status)}
          {!compact && (
            <button
              onClick={() => onToggleExpand(folder.id)}
              className="p-1 hover:bg-terminal-dark/10 rounded"
            >
              {expandedFolderId === folder.id ? (
                <ChevronUpIcon className="w-4 h-4 text-terminal-muted" />
              ) : (
                <ChevronDownIcon className="w-4 h-4 text-terminal-muted" />
              )}
            </button>
          )}
          {!folder.isPrimary && !folder.inheritedFromWorkflowId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSetPrimary(folder.id)}
              title={t("setPrimaryFolder")}
              aria-label={t("setPrimaryFolder")}
              className="h-8 w-8 shrink-0 text-terminal-muted hover:text-terminal-amber hover:bg-terminal-amber/10"
            >
              <StarIcon className="w-4 h-4" />
            </Button>
          )}
          {folder.status === "syncing" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCancelSync(folder.id)}
              title={t("cancelSync")}
              aria-label={t("cancelSync")}
              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
            >
              <XCircleIcon className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSync(folder.id)}
              disabled={syncingFolderId === folder.id}
              className="h-8 w-8 shrink-0"
            >
              <RefreshCwIcon className={cn("w-4 h-4", syncingFolderId === folder.id && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleAutoUpdates(folder)}
            disabled={updatingFolderId === folder.id}
            className="h-8 px-2 font-mono text-[10px] whitespace-nowrap"
          >
            {updatingFolderId === folder.id ? <Loader2Icon className="w-3 h-3 animate-spin" /> : (syncMode === "manual" ? t("resumeUpdatesShort") : t("pauseUpdatesShort"))}
          </Button>
          {!isSimpleDefaults && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApplySimpleDefaults(folder)}
              disabled={updatingFolderId === folder.id}
              className="h-8 px-2 font-mono text-[10px] whitespace-nowrap"
            >
              {updatingFolderId === folder.id ? <Loader2Icon className="w-3 h-3 animate-spin" /> : t("applySimpleDefaultsShort")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(folder.id)}
            disabled={removingFolderId === folder.id}
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
          >
            {removingFolderId === folder.id ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {expandedFolderId === folder.id && !compact && (
        <div className="mt-3 pt-3 border-t border-terminal-border space-y-2">
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-terminal-muted">{t("files")}</span>{" "}
              <span className="text-terminal-dark">{folder.fileCount ?? 0}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("chunks")}</span>{" "}
              <span className="text-terminal-dark">{folder.chunkCount ?? 0}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("recursive")}</span>{" "}
              <span className="text-terminal-dark">{folder.recursive ? t("yes") : t("no")}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("lastSynced")}</span>{" "}
              <span className="text-terminal-dark">
                {folder.lastSyncedAt ? new Date(folder.lastSyncedAt).toLocaleString() : t("never")}
              </span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("indexingBehavior")}</span>{" "}
              <span className={cn(
                "text-xs font-mono px-2 py-0.5 rounded",
                folder.indexingMode === "full" && "bg-terminal-green/20 text-terminal-green",
                folder.indexingMode === "files-only" && "bg-terminal-blue/20 text-terminal-blue",
                folder.indexingMode === "auto" && "bg-terminal-muted/20 text-terminal-muted"
              )}>
                {indexingModeLabel}
              </span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("updatesMode")}</span>{" "}
              <Badge variant="outline" className="font-mono text-[10px]">
                {syncModeLabel}
              </Badge>
            </div>
            <div>
              <span className="text-terminal-muted">{t("checkEveryMinutes")}</span>{" "}
              <span className="text-terminal-dark">{folder.syncCadenceMinutes ?? 60}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("largestFileSize")}</span>{" "}
              <span className="text-terminal-dark">{formatBytes(folder.maxFileSizeBytes ?? 10 * 1024 * 1024)}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("searchDetailLevel")}</span>{" "}
              <span className="text-terminal-dark">{chunkPresetLabel}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("fullRescanPolicy")}</span>{" "}
              <span className="text-terminal-dark">{reindexPolicyLabel}</span>
            </div>
            <div>
              <span className="text-terminal-muted">{t("skipped")}</span>{" "}
              <span className="text-terminal-dark">{folder.skippedCount ?? 0}</span>
            </div>
            {folder.lastRunTrigger && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("lastRunReason")}</span>{" "}
                <span className="text-terminal-dark">{lastRunReason ?? folder.lastRunTrigger}</span>
              </div>
            )}
            {folder.embeddingModel && (
              <div className="col-span-2">
                <span className="text-terminal-muted">Model:</span>{" "}
                <span className="text-terminal-dark">{folder.embeddingModel}</span>
              </div>
            )}
            {typeFilters.length > 0 && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("fileTypeFilters")}</span>{" "}
                <span className="text-terminal-dark">{typeFilters.join(", ")}</span>
              </div>
            )}
            {includeExts.length > 0 && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("fileExtensions")}</span>{" "}
                <span className="text-terminal-dark">{includeExts.join(", ")}</span>
              </div>
            )}
            {excludeGlobs.length > 0 && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("excludePatterns")}</span>{" "}
                <span className="text-terminal-dark">{excludeGlobs.join(", ")}</span>
              </div>
            )}
            {Object.keys(skipReasons).length > 0 && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("skipReasons")}</span>{" "}
                <span className="text-terminal-dark">
                  {Object.entries(skipReasons).map(([reason, count]) => `${reason}: ${count}`).join(", ")}
                </span>
              </div>
            )}
            {Object.keys(runMetadata).length > 0 && (
              <div className="col-span-2">
                <span className="text-terminal-muted">{t("lastRunMetadata")}</span>{" "}
                <span className="text-terminal-dark">{JSON.stringify(runMetadata)}</span>
              </div>
            )}
            {syncMode === "auto" && (
              <div className="col-span-2 rounded border border-terminal-amber/30 bg-terminal-amber/10 px-2 py-1 text-[10px] font-mono text-terminal-amber">
                {t("autoModeWarning")}
              </div>
            )}
          </div>
          {folder.lastError && (
            <p className="text-xs font-mono text-destructive">{t("error")} {folder.lastError}</p>
          )}
        </div>
      )}
    </div>
  );
}
