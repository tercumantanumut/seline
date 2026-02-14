"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  DatabaseIcon,
  FolderSyncIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVectorSyncStatus } from "@/hooks/use-vector-sync-status";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { resilientPost } from "@/lib/utils/resilient-fetch";

/**
 * GlobalSyncIndicator - Shows vector database sync status globally
 * 
 * Displays a persistent indicator when sync is active.
 * Can be expanded to show detailed progress information.
 */
export function GlobalSyncIndicator() {
  const { status, isLoading, isExpanded, setIsExpanded, refresh } = useVectorSyncStatus();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const t = useTranslations("syncIndicator");

  // Reset dismissed state when a new sync starts
  if (isDismissed && status.isSyncing) {
    setIsDismissed(false);
  }

  const handleCleanup = useCallback(async () => {
    setIsCleaningUp(true);
    try {
      const { data: result, error } = await resilientPost("/api/vector-sync", { action: "cleanup" });
      if (error) {
        console.error("[SyncIndicator] Cleanup failed:", error);
      } else {
        console.log("[SyncIndicator] Cleanup result:", result);
      }
      // Refresh status after cleanup
      refresh();
      // Dismiss the indicator since we just cleaned up
      setIsDismissed(true);
    } catch (error) {
      console.error("[SyncIndicator] Cleanup failed:", error);
    } finally {
      setIsCleaningUp(false);
    }
  }, [refresh]);

  // Don't show if not enabled, not syncing, or dismissed
  if (!status.isEnabled || (!status.isSyncing && status.pendingSyncs.length === 0) || isDismissed) {
    return null;
  }

  const activeSyncCount = status.activeSyncs.length;
  const pendingSyncCount = status.pendingSyncs.length;
  const totalActive = activeSyncCount + pendingSyncCount;

  // Get the first active sync for display
  const primarySync = status.activeSyncs[0] || status.pendingSyncs[0];
  const folderName = primarySync?.displayName || primarySync?.folderPath?.split(/[/\\]/).pop() || "Unknown";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 500 }}
        className={cn(
          "fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)]",
          "bg-terminal-cream border border-terminal-border rounded-lg shadow-lg",
          "font-mono text-sm",
          isExpanded ? "w-[min(20rem,calc(100vw-2rem))]" : "w-auto"
        )}
      >
        {/* Header - Always visible */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer",
            "hover:bg-terminal-dark/5 transition-colors rounded-t-lg",
            !isExpanded && "rounded-b-lg"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Loader2Icon className="w-4 h-4 text-terminal-green animate-spin flex-shrink-0" />
            <span className="text-terminal-dark truncate">
              {t("syncing")}
              {totalActive > 1 && ` (${totalActive})`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-terminal-muted hover:text-terminal-dark"
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
            >
              <XIcon className="w-3 h-3" />
            </Button>
            {isExpanded ? (
              <ChevronDownIcon className="w-4 h-4 text-terminal-muted" />
            ) : (
              <ChevronUpIcon className="w-4 h-4 text-terminal-muted" />
            )}
          </div>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2 border-t border-terminal-border/50">
                {/* Active syncs */}
                {status.activeSyncs.map((sync) => (
                  <SyncFolderItem key={sync.id} sync={sync} status="syncing" />
                ))}

                {/* Pending syncs */}
                {status.pendingSyncs.map((sync) => (
                  <SyncFolderItem key={sync.id} sync={sync} status="pending" />
                ))}

                {/* Recent errors */}
                {status.recentErrors.length > 0 && (
                  <div className="pt-2 border-t border-terminal-border/30">
                    <span className="text-xs text-destructive">{t("recentErrors")}</span>
                    {status.recentErrors.slice(0, 2).map((sync) => (
                      <SyncFolderItem key={sync.id} sync={sync} status="error" />
                    ))}
                  </div>
                )}

                {/* Clear stuck syncs button */}
                <div className="pt-2 border-t border-terminal-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-terminal-muted hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCleanup();
                    }}
                    disabled={isCleaningUp}
                  >
                    {isCleaningUp ? (
                      <>
                        <Loader2Icon className="w-3 h-3 mr-1 animate-spin" />
                        {t("clearing")}
                      </>
                    ) : (
                      <>
                        <Trash2Icon className="w-3 h-3 mr-1" />
                        {t("clearStuck")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

interface SyncFolderItemProps {
  sync: {
    id: string;
    characterName: string | null;
    displayName: string | null;
    folderPath: string;
    fileCount: number | null;
    chunkCount: number | null;
    lastError: string | null;
  };
  status: "syncing" | "pending" | "error";
}

function SyncFolderItem({ sync, status }: SyncFolderItemProps) {
  const t = useTranslations("syncIndicator");
  const folderName = sync.displayName || sync.folderPath?.split(/[/\\]/).pop() || "Unknown";

  return (
    <div className="pt-2 first:pt-2">
      <div className="flex items-start gap-2">
        {status === "syncing" && (
          <Loader2Icon className="w-3 h-3 text-terminal-green animate-spin mt-0.5 flex-shrink-0" />
        )}
        {status === "pending" && (
          <DatabaseIcon className="w-3 h-3 text-terminal-muted mt-0.5 flex-shrink-0" />
        )}
        {status === "error" && (
          <AlertCircleIcon className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs text-terminal-dark truncate font-medium">
              {folderName}
            </span>
            {sync.characterName && (
              <span className="text-xs text-terminal-muted truncate">
                ({sync.characterName})
              </span>
            )}
          </div>
          {status === "syncing" && sync.fileCount !== null && (
            <div className="text-xs text-terminal-muted">
              {sync.fileCount} {t("filesIndexed")}
              {sync.chunkCount !== null && ` • ${sync.chunkCount} ${t("chunks")}`}
            </div>
          )}
          {status === "error" && sync.lastError && (
            <div className="text-xs text-destructive truncate" title={sync.lastError}>
              {sync.lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

