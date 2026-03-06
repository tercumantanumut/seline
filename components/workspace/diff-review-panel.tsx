"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  GitCommitIcon,
  CheckSquareIcon,
  SquareIcon,
  CopyIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import type {
  WorkspaceInfo,
  WorkspaceStatus,
  GitDiffResult,
  GitDiffFile,
  GitDiffHunk,
  GitStatusResult,
} from "@/lib/workspace/types";

interface DiffReviewPanelProps {
  sessionId: string;
  workspaceInfo: WorkspaceInfo;
  isOpen: boolean;
  onClose: () => void;
  onCreatePR?: () => void;
  onSyncToLocal?: () => void;
}

type FileStatusType = "added" | "modified" | "deleted" | "renamed" | "copied";
type DiffViewTab = "unstaged" | "staged" | "branch";

const FILE_STATUS_CONFIG: Record<
  FileStatusType,
  { label: string; icon: typeof FileIcon; color: string; bgColor: string }
> = {
  added: {
    label: "A",
    icon: FilePlusIcon,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  modified: {
    label: "M",
    icon: FileEditIcon,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  deleted: {
    label: "D",
    icon: FileMinusIcon,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  renamed: {
    label: "R",
    icon: FileSymlinkIcon,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  copied: {
    label: "C",
    icon: CopyIcon,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
};

/**
 * Renders a structured hunk with line numbers and proper coloring.
 */
function HunkView({ hunk }: { hunk: GitDiffHunk }) {
  return (
    <div className="border-b border-terminal-border/30 last:border-b-0">
      {/* Hunk header */}
      <div className="px-3 py-1 bg-blue-50/70 text-blue-700 text-xs font-mono font-semibold sticky top-0">
        {hunk.header}
      </div>

      {/* Hunk lines */}
      {hunk.lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex font-[var(--font-jetbrains-mono)] text-xs leading-5 group",
            line.type === "add" && "bg-green-50 text-green-900",
            line.type === "delete" && "bg-red-50 text-red-900",
            line.type === "normal" && "text-terminal-dark/80"
          )}
        >
          {/* Old line number gutter */}
          <span
            className={cn(
              "w-10 flex-shrink-0 text-right pr-1 select-none text-terminal-muted/50 border-r border-terminal-border/20",
              line.type === "add" && "bg-green-100/50 text-green-600/50",
              line.type === "delete" && "bg-red-100/50 text-red-600/50"
            )}
          >
            {line.oldLineNumber ?? ""}
          </span>

          {/* New line number gutter */}
          <span
            className={cn(
              "w-10 flex-shrink-0 text-right pr-1 select-none text-terminal-muted/50 border-r border-terminal-border/20",
              line.type === "add" && "bg-green-100/50 text-green-600/50",
              line.type === "delete" && "bg-red-100/50 text-red-600/50"
            )}
          >
            {line.newLineNumber ?? ""}
          </span>

          {/* Line content */}
          <span className="px-2 whitespace-pre flex-1 overflow-x-auto">
            {line.type === "add" && "+"}
            {line.type === "delete" && "-"}
            {line.type === "normal" && " "}
            {line.content}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders the diff for a single file using structured hunk data.
 */
function FileDiffView({ file }: { file: GitDiffFile }) {
  if (file.isBinary) {
    return (
      <div className="flex items-center justify-center py-8 text-terminal-muted">
        <p className="text-sm font-mono">Binary file — diff not available</p>
      </div>
    );
  }

  if (file.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-terminal-muted">
        <p className="text-sm font-mono">No diff content</p>
      </div>
    );
  }

  return (
    <div>
      {file.hunks.map((hunk, i) => (
        <HunkView key={i} hunk={hunk} />
      ))}
    </div>
  );
}

// ─── Response types for the workspace API ───────────────────────────────────

interface WorkspaceDiffResponse {
  workspace: WorkspaceStatus;
  diff: GitDiffResult;
  status: GitStatusResult;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function DiffReviewPanel({
  sessionId,
  workspaceInfo,
  isOpen,
  onClose,
  onCreatePR,
  onSyncToLocal,
}: DiffReviewPanelProps) {
  const t = useTranslations("workspace.diff");

  // Core state
  const [workspaceStatus, setWorkspaceStatus] =
    useState<WorkspaceStatus | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DiffViewTab>("unstaged");
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Action state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isStaging, setIsStaging] = useState<string | null>(null); // filePath or "all"
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  const branch = workspaceInfo.branch || "unknown";

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchDiffData = useCallback(
    async (tab?: DiffViewTab) => {
      const diffType = tab ?? activeTab;
      setIsLoading(true);
      setError(null);

      try {
        let url = `/api/sessions/${sessionId}/workspace?diff=true&type=${diffType}`;
        if (diffType === "branch" && workspaceInfo.baseBranch) {
          url += `&base=${encodeURIComponent(workspaceInfo.baseBranch)}`;
        }

        const { data, error: fetchError } =
          await resilientFetch<WorkspaceDiffResponse>(url, { timeout: 30_000 });

        if (fetchError) {
          setError(fetchError);
          return;
        }

        if (data) {
          setWorkspaceStatus(data.workspace);
          setDiffResult(data.diff);
          setGitStatus(data.status);

          // Auto-select first file if nothing selected
          if (data.diff?.files?.length > 0) {
            setSelectedFile((prev) => {
              // Keep current selection if the file still exists in the new diff
              if (
                prev &&
                data.diff.files.some((f) => f.path === prev)
              ) {
                return prev;
              }
              return data.diff.files[0]?.path ?? null;
            });
          } else {
            setSelectedFile(null);
          }
        }
      } catch {
        setError(t("fetchFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, activeTab, workspaceInfo.baseBranch, t]
  );

  useEffect(() => {
    if (isOpen) {
      fetchDiffData();
    }
  }, [isOpen, fetchDiffData]);

  // ─── Staging actions ────────────────────────────────────────────────────

  const handleStageFile = useCallback(
    async (filePath: string) => {
      setIsStaging(filePath);
      try {
        const { error: stageError } = await resilientPost(
          `/api/sessions/${sessionId}/workspace`,
          { action: "stage", filePath }
        );
        if (stageError) {
          toast.error("Failed to stage file");
        } else {
          await fetchDiffData();
        }
      } catch {
        toast.error("Failed to stage file");
      } finally {
        setIsStaging(null);
      }
    },
    [sessionId, fetchDiffData]
  );

  const handleUnstageFile = useCallback(
    async (filePath: string) => {
      setIsStaging(filePath);
      try {
        const { error: unstageError } = await resilientPost(
          `/api/sessions/${sessionId}/workspace`,
          { action: "unstage", filePath }
        );
        if (unstageError) {
          toast.error("Failed to unstage file");
        } else {
          await fetchDiffData();
        }
      } catch {
        toast.error("Failed to unstage file");
      } finally {
        setIsStaging(null);
      }
    },
    [sessionId, fetchDiffData]
  );

  const handleStageAll = useCallback(async () => {
    setIsStaging("all");
    try {
      const { error: stageError } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "stage-all" }
      );
      if (stageError) {
        toast.error("Failed to stage all files");
      } else {
        await fetchDiffData();
      }
    } catch {
      toast.error("Failed to stage all files");
    } finally {
      setIsStaging(null);
    }
  }, [sessionId, fetchDiffData]);

  const handleUnstageAll = useCallback(async () => {
    setIsStaging("all");
    try {
      const { error: unstageError } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "unstage-all" }
      );
      if (unstageError) {
        toast.error("Failed to unstage all files");
      } else {
        await fetchDiffData();
      }
    } catch {
      toast.error("Failed to unstage all files");
    } finally {
      setIsStaging(null);
    }
  }, [sessionId, fetchDiffData]);

  // ─── Commit ─────────────────────────────────────────────────────────────

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      toast.error("Commit message is required");
      return;
    }
    setIsCommitting(true);
    try {
      const { error: commitError } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "commit", message: commitMessage.trim() }
      );
      if (commitError) {
        toast.error("Commit failed");
      } else {
        toast.success("Changes committed");
        setCommitMessage("");
        await fetchDiffData();
      }
    } catch {
      toast.error("Commit failed");
    } finally {
      setIsCommitting(false);
    }
  }, [sessionId, commitMessage, fetchDiffData]);

  // ─── Existing actions ───────────────────────────────────────────────────

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
        window.dispatchEvent(
          new CustomEvent("workspace-status-changed", { detail: { sessionId } })
        );
        onClose();
      }
    } catch {
      toast.error(t("discardFailed"));
    } finally {
      setIsDiscarding(false);
      setShowDiscardDialog(false);
    }
  }, [sessionId, onClose, t]);

  // ─── Tab change ─────────────────────────────────────────────────────────

  const handleTabChange = useCallback(
    (tab: DiffViewTab) => {
      setActiveTab(tab);
      fetchDiffData(tab);
    },
    [fetchDiffData]
  );

  // ─── Derived data ──────────────────────────────────────────────────────

  const stagedPaths = useMemo(
    () => new Set(gitStatus?.staged?.map((f) => f.path) ?? []),
    [gitStatus]
  );

  const unstagedPaths = useMemo(
    () => new Set(gitStatus?.unstaged?.map((f) => f.path) ?? []),
    [gitStatus]
  );

  const diffFiles = diffResult?.files ?? [];
  const hasStagedFiles = (gitStatus?.staged?.length ?? 0) > 0;
  const hasUnstagedFiles = (gitStatus?.unstaged?.length ?? 0) > 0;

  // Build a combined file list from diff files + status
  const allFiles = useMemo(() => {
    const fileMap = new Map<
      string,
      { path: string; status: FileStatusType; staged: boolean; unstaged: boolean }
    >();

    // Add files from diff result
    for (const f of diffFiles) {
      fileMap.set(f.path, {
        path: f.path,
        status: f.status,
        staged: stagedPaths.has(f.path),
        unstaged: unstagedPaths.has(f.path),
      });
    }

    // Add staged files not in diff (could happen if viewing unstaged diff only)
    for (const f of gitStatus?.staged ?? []) {
      if (!fileMap.has(f.path)) {
        fileMap.set(f.path, {
          path: f.path,
          status: f.status,
          staged: true,
          unstaged: unstagedPaths.has(f.path),
        });
      }
    }

    // Add unstaged files not in diff
    for (const f of gitStatus?.unstaged ?? []) {
      if (!fileMap.has(f.path)) {
        fileMap.set(f.path, {
          path: f.path,
          status: f.status,
          staged: stagedPaths.has(f.path),
          unstaged: true,
        });
      }
    }

    return Array.from(fileMap.values());
  }, [diffFiles, gitStatus, stagedPaths, unstagedPaths]);

  const selectedDiffFile = useMemo(
    () => diffFiles.find((f) => f.path === selectedFile) ?? null,
    [diffFiles, selectedFile]
  );

  const totalChangedFiles = allFiles.length;

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
                "w-full sm:w-[70vw] sm:max-w-[1100px] sm:min-w-[500px]",
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
                  {totalChangedFiles > 0 && (
                    <span className="text-xs font-mono text-terminal-muted flex-shrink-0">
                      ({totalChangedFiles} file
                      {totalChangedFiles !== 1 ? "s" : ""})
                    </span>
                  )}
                  {diffResult?.stats && (
                    <span className="text-xs font-mono flex-shrink-0 flex items-center gap-1.5">
                      <span className="text-green-600">
                        +{diffResult.stats.additions}
                      </span>
                      <span className="text-red-600">
                        -{diffResult.stats.deletions}
                      </span>
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

              {/* Diff type tabs */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-terminal-border bg-terminal-cream/50">
                {(
                  [
                    { key: "unstaged", label: "Unstaged" },
                    { key: "staged", label: "Staged" },
                    { key: "branch", label: "Branch" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors",
                      activeTab === tab.key
                        ? "bg-terminal-dark text-terminal-cream"
                        : "text-terminal-dark/60 hover:text-terminal-dark hover:bg-terminal-dark/5"
                    )}
                  >
                    {tab.label}
                    {tab.key === "staged" && hasStagedFiles && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-4 rounded-full bg-emerald-600 text-white text-[10px] px-1">
                        {gitStatus!.staged.length}
                      </span>
                    )}
                    {tab.key === "unstaged" && hasUnstagedFiles && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-4 rounded-full bg-amber-600 text-white text-[10px] px-1">
                        {gitStatus!.unstaged.length}
                      </span>
                    )}
                  </button>
                ))}
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
                      <p className="text-sm font-mono text-destructive">
                        {error}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchDiffData()}
                      >
                        {t("retry")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* File list + Diff view */}
                {!isLoading && !error && (
                  <div className="flex-1 overflow-hidden flex">
                    {/* File list sidebar */}
                    <div className="w-64 flex-shrink-0 border-r border-terminal-border flex flex-col">
                      {/* Bulk staging controls */}
                      <div className="flex items-center gap-1 px-2 py-2 border-b border-terminal-border/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 font-mono"
                          onClick={handleStageAll}
                          disabled={isStaging !== null || !hasUnstagedFiles}
                        >
                          <CheckSquareIcon className="w-3 h-3" />
                          Stage All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 font-mono"
                          onClick={handleUnstageAll}
                          disabled={isStaging !== null || !hasStagedFiles}
                        >
                          <SquareIcon className="w-3 h-3" />
                          Unstage All
                        </Button>
                      </div>

                      {/* File list */}
                      <ScrollArea className="flex-1">
                        <div className="px-1 py-1">
                          {allFiles.length === 0 && (
                            <div className="flex items-center justify-center py-8 text-terminal-muted">
                              <p className="text-xs font-mono">
                                {t("noChanges")}
                              </p>
                            </div>
                          )}

                          {allFiles.map((file) => {
                            const config =
                              FILE_STATUS_CONFIG[file.status] ??
                              FILE_STATUS_CONFIG.modified;
                            const isSelected = selectedFile === file.path;
                            const isFileStaging = isStaging === file.path;

                            return (
                              <div
                                key={file.path}
                                className={cn(
                                  "flex items-center gap-1.5 px-1.5 py-1.5 rounded text-left group",
                                  "text-xs font-mono transition-colors",
                                  isSelected
                                    ? "bg-terminal-dark/10 text-terminal-dark"
                                    : "hover:bg-terminal-dark/5 text-terminal-dark/70"
                                )}
                              >
                                {/* Stage/Unstage checkbox */}
                                <div
                                  className="flex-shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {isFileStaging ? (
                                    <Loader2Icon className="w-3.5 h-3.5 animate-spin text-terminal-muted" />
                                  ) : (
                                    <Checkbox
                                      checked={file.staged}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          handleStageFile(file.path);
                                        } else {
                                          handleUnstageFile(file.path);
                                        }
                                      }}
                                      className="h-3.5 w-3.5"
                                    />
                                  )}
                                </div>

                                {/* File status badge */}
                                <span
                                  className={cn(
                                    "inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold flex-shrink-0",
                                    config.bgColor,
                                    config.color
                                  )}
                                >
                                  {config.label}
                                </span>

                                {/* File path — clickable to select */}
                                <button
                                  onClick={() => setSelectedFile(file.path)}
                                  className="truncate flex-1 text-left hover:underline"
                                  title={file.path}
                                >
                                  {file.path}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Diff content area */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                      {/* Selected file header */}
                      {selectedDiffFile && (
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-terminal-border/50 bg-terminal-dark/[0.03]">
                          <span className="text-xs font-mono font-medium text-terminal-dark truncate">
                            {selectedDiffFile.path}
                          </span>
                          <span className="text-xs font-mono flex-shrink-0 flex items-center gap-1.5 text-terminal-muted">
                            <span className="text-green-600">
                              +{selectedDiffFile.additions}
                            </span>
                            <span className="text-red-600">
                              -{selectedDiffFile.deletions}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Diff content */}
                      <ScrollArea className="flex-1">
                        {!selectedDiffFile && diffFiles.length === 0 && (
                          <div className="flex items-center justify-center py-12 text-terminal-muted">
                            <p className="text-sm font-mono">
                              {activeTab === "staged"
                                ? "No staged changes"
                                : activeTab === "unstaged"
                                  ? "No unstaged changes"
                                  : t("noChanges")}
                            </p>
                          </div>
                        )}

                        {!selectedDiffFile && diffFiles.length > 0 && (
                          <div className="flex items-center justify-center py-12 text-terminal-muted">
                            <p className="text-sm font-mono">
                              Select a file to view diff
                            </p>
                          </div>
                        )}

                        {selectedDiffFile && (
                          <div className="overflow-x-auto">
                            <FileDiffView file={selectedDiffFile} />
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </div>

              {/* Commit section — shown when there are staged files */}
              {hasStagedFiles && !isLoading && !error && (
                <div className="border-t border-terminal-border px-4 py-3 bg-terminal-cream/80">
                  <div className="flex items-start gap-2">
                    <GitCommitIcon className="w-4 h-4 mt-2 text-terminal-muted flex-shrink-0" />
                    <div className="flex-1 flex flex-col gap-2">
                      <Textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message..."
                        className="min-h-[60px] max-h-[120px] text-xs font-mono bg-white/60 border border-terminal-border/50 resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleCommit();
                          }
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={handleCommit}
                          disabled={
                            isCommitting || !commitMessage.trim()
                          }
                        >
                          {isCommitting ? (
                            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <GitCommitIcon className="w-3.5 h-3.5" />
                          )}
                          {isCommitting ? "Committing..." : "Commit"}
                        </Button>
                        <span className="text-[10px] font-mono text-terminal-muted">
                          {gitStatus!.staged.length} staged file
                          {gitStatus!.staged.length !== 1 ? "s" : ""}
                          {" · "}
                          <kbd className="px-1 py-0.5 rounded bg-terminal-dark/5 text-[9px]">
                            {typeof navigator !== "undefined" &&
                            navigator.platform?.includes("Mac")
                              ? "Cmd"
                              : "Ctrl"}
                            +Enter
                          </kbd>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                strong: (chunks) => (
                  <strong className="font-semibold">{chunks}</strong>
                ),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscarding}>
              {t("cancel")}
            </AlertDialogCancel>
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
