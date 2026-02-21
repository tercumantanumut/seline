"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  XIcon,
  Loader2Icon,
  FileIcon,
  FilePlusIcon,
  FileMinusIcon,
  FileEditIcon,
  FileSymlinkIcon,
  AlertCircleIcon,
  GitPullRequestIcon,
  DownloadIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { resilientFetch, resilientPost } from "@/lib/utils/resilient-fetch";
import { toast } from "sonner";
import type { WorkspaceInfo, WorkspaceStatus } from "@/lib/workspace/types";

interface DiffReviewPanelProps {
  sessionId: string;
  workspaceInfo: WorkspaceInfo;
  isOpen: boolean;
  onClose: () => void;
  onCreatePR?: () => void;
  onSyncToLocal?: () => void;
}

type FileStatus = "added" | "modified" | "deleted" | "renamed";

const FILE_STATUS_CONFIG: Record<FileStatus, { label: string; icon: typeof FileIcon; color: string; bgColor: string }> = {
  added: { label: "A", icon: FilePlusIcon, color: "text-green-600", bgColor: "bg-green-50" },
  modified: { label: "M", icon: FileEditIcon, color: "text-amber-600", bgColor: "bg-amber-50" },
  deleted: { label: "D", icon: FileMinusIcon, color: "text-red-600", bgColor: "bg-red-50" },
  renamed: { label: "R", icon: FileSymlinkIcon, color: "text-blue-600", bgColor: "bg-blue-50" },
};

/**
 * Renders a single diff line with appropriate coloring.
 */
function DiffLine({ line }: { line: string }) {
  const isAdded = line.startsWith("+") && !line.startsWith("+++");
  const isRemoved = line.startsWith("-") && !line.startsWith("---");
  const isHeader = line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");

  return (
    <div
      className={cn(
        "px-3 whitespace-pre font-[var(--font-jetbrains-mono)] text-xs leading-5",
        isAdded && "bg-green-50 text-green-800",
        isRemoved && "bg-red-50 text-red-800",
        isHeader && "bg-blue-50/50 text-blue-700 font-semibold",
        !isAdded && !isRemoved && !isHeader && "text-terminal-dark/80"
      )}
    >
      {line}
    </div>
  );
}

export function DiffReviewPanel({
  sessionId,
  workspaceInfo,
  isOpen,
  onClose,
  onCreatePR,
  onSyncToLocal,
}: DiffReviewPanelProps) {
  const t = useTranslations("workspace.diff");
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const branch = workspaceInfo.branch || "unknown";

  const fetchWorkspaceStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await resilientFetch<{ workspace: WorkspaceStatus }>(
        `/api/sessions/${sessionId}/workspace`
      );
      if (fetchError) {
        setError(fetchError);
      } else if (data?.workspace) {
        setWorkspaceStatus(data.workspace);
        // Auto-select first file
        if (data.workspace.changedFileList && data.workspace.changedFileList.length > 0) {
          const firstPath = data.workspace.changedFileList[0]?.path;
          if (firstPath) {
            setSelectedFile((prev) => prev ?? firstPath);
          }
        }
      }
    } catch {
      setError("Failed to fetch workspace status");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen) {
      fetchWorkspaceStatus();
    }
  }, [isOpen, fetchWorkspaceStatus]);

  const handleSyncToLocal = useCallback(async () => {
    if (onSyncToLocal) {
      onSyncToLocal();
      return;
    }
    setIsSyncing(true);
    try {
      const { error: syncError } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "sync-to-local" }
      );
      if (syncError) {
        toast.error(t("syncFailed"));
      } else {
        toast.success(t("syncSuccess"));
      }
    } catch {
      toast.error(t("syncFailed"));
    } finally {
      setIsSyncing(false);
    }
  }, [sessionId, onSyncToLocal, t]);

  const handleDiscard = useCallback(async () => {
    setIsDiscarding(true);
    try {
      const { error: cleanupError } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "cleanup" }
      );
      if (cleanupError) {
        toast.error(t("discardFailed"));
      } else {
        toast.success(t("discardSuccess"));
        window.dispatchEvent(new CustomEvent("workspace-status-changed", { detail: { sessionId } }));
        onClose();
      }
    } catch {
      toast.error(t("discardFailed"));
    } finally {
      setIsDiscarding(false);
      setShowDiscardDialog(false);
    }
  }, [sessionId, onClose]);

  const diffLines = workspaceStatus?.diffStat?.split("\n") || [];
  const changedFiles = workspaceStatus?.changedFileList || [];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className={cn(
                "fixed top-0 right-0 z-50 h-full",
                "w-full sm:w-[60vw] sm:max-w-[900px] sm:min-w-[400px]",
                "bg-terminal-cream border-l border-terminal-border shadow-2xl",
                "flex flex-col"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="font-mono text-sm font-medium text-terminal-dark truncate">
                    Changes in{" "}
                    <span className="text-emerald-700">{branch}</span>
                  </h2>
                  {changedFiles.length > 0 && (
                    <span className="text-xs font-mono text-terminal-muted flex-shrink-0">
                      ({changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={onClose}
                >
                  <XIcon className="w-4 h-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Loading state */}
                {isLoading && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-terminal-muted">
                      <Loader2Icon className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-mono">{t("loading")}</span>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {error && !isLoading && (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-3 text-center max-w-sm">
                      <AlertCircleIcon className="w-8 h-8 text-destructive" />
                      <p className="text-sm font-mono text-destructive">{error}</p>
                      <Button variant="outline" size="sm" onClick={fetchWorkspaceStatus}>
                        {t("retry")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* File list + Diff view */}
                {!isLoading && !error && (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    {/* File list */}
                    {changedFiles.length > 0 && (
                      <div className="border-b border-terminal-border">
                        <ScrollArea className="max-h-[200px]">
                          <div className="px-2 py-1">
                            {changedFiles.map((file) => {
                              const config = FILE_STATUS_CONFIG[file.status];
                              const isSelected = selectedFile === file.path;
                              return (
                                <button
                                  key={file.path}
                                  onClick={() => setSelectedFile(file.path)}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left",
                                    "text-xs font-mono transition-colors",
                                    isSelected
                                      ? "bg-terminal-dark/10 text-terminal-dark"
                                      : "hover:bg-terminal-dark/5 text-terminal-dark/70"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold flex-shrink-0",
                                      config.bgColor,
                                      config.color
                                    )}
                                  >
                                    {config.label}
                                  </span>
                                  <span className="truncate flex-1">{file.path}</span>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    {/* Diff view */}
                    <ScrollArea className="flex-1">
                      <div className="py-2">
                        {changedFiles.length === 0 && !workspaceStatus?.diffStat && (
                          <div className="flex items-center justify-center py-12 text-terminal-muted">
                            <p className="text-sm font-mono">{t("noChanges")}</p>
                          </div>
                        )}

                        {diffLines.length > 0 && (
                          <div className="overflow-x-auto">
                            {diffLines.map((line, i) => (
                              <DiffLine key={i} line={line} />
                            ))}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Actions footer */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-terminal-border bg-terminal-cream">
                {onCreatePR && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={onCreatePR}
                  >
                    <GitPullRequestIcon className="w-3.5 h-3.5" />
                    {t("createPR")}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSyncToLocal}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DownloadIcon className="w-3.5 h-3.5" />
                  )}
                  {isSyncing ? t("syncing") : t("syncToLocal")}
                </Button>

                <div className="flex-1" />

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDiscardDialog(true)}
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                  {t("discard")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("discardDescription", {
                branch,
                strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscarding}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              disabled={isDiscarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDiscarding ? (
                <>
                  <Loader2Icon className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t("discarding")}
                </>
              ) : (
                t("discardChanges")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
