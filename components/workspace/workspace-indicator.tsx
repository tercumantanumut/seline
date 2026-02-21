"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  GitBranchIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  Trash2Icon,
  Loader2Icon,
  ChevronDownIcon,
  EyeIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { resilientPost } from "@/lib/utils/resilient-fetch";
import { toast } from "sonner";
import type { WorkspaceInfo } from "@/lib/workspace/types";

interface WorkspaceIndicatorProps {
  sessionId: string;
  workspaceInfo: WorkspaceInfo;
  onOpenDiffPanel?: () => void;
}

const STATUS_STYLES: Record<WorkspaceInfo["status"], string> = {
  active: "bg-emerald-50 border-emerald-200 text-emerald-800",
  "changes-ready": "bg-amber-50 border-amber-200 text-amber-800",
  "pr-open": "bg-blue-50 border-blue-200 text-blue-800",
  merged: "bg-purple-50 border-purple-200 text-purple-800",
  "cleanup-pending": "bg-gray-100 border-gray-300 text-gray-600",
};

const PR_STATUS_STYLES: Record<NonNullable<WorkspaceInfo["prStatus"]>, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-100 text-green-700",
  merged: "bg-purple-100 text-purple-700",
  closed: "bg-red-100 text-red-700",
};

/**
 * Strip common branch prefixes for compact display.
 */
function formatBranchName(branch: string): string {
  return branch.replace(/^(feature|fix|chore|bugfix|hotfix)\//, "");
}

/**
 * Truncate a string to maxLen, adding ellipsis if needed.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\u2026";
}

export function WorkspaceIndicator({
  sessionId,
  workspaceInfo,
  onOpenDiffPanel,
}: WorkspaceIndicatorProps) {
  const t = useTranslations("workspace.indicator");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  const branch = workspaceInfo.branch || "unknown";
  const displayBranch = truncate(formatBranchName(branch), 25);
  const fullBranch = branch;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { error } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "refresh-status" }
      );
      if (error) {
        toast.error(t("refreshFailed"));
      } else {
        toast.success(t("refreshSuccess"));
        window.dispatchEvent(new CustomEvent("workspace-status-changed", { detail: { sessionId } }));
      }
    } catch {
      toast.error(t("refreshFailed"));
    } finally {
      setIsRefreshing(false);
    }
  }, [sessionId]);

  const handleCleanup = useCallback(async () => {
    setIsCleaning(true);
    try {
      const { error } = await resilientPost(
        `/api/sessions/${sessionId}/workspace`,
        { action: "cleanup" }
      );
      if (error) {
        toast.error(t("cleanupFailed"));
      } else {
        toast.success(t("cleanupSuccess"));
        window.dispatchEvent(new CustomEvent("workspace-status-changed", { detail: { sessionId } }));
      }
    } catch {
      toast.error(t("cleanupFailed"));
    } finally {
      setIsCleaning(false);
      setShowCleanupDialog(false);
    }
  }, [sessionId]);

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    "text-xs font-mono cursor-pointer transition-colors",
                    "hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                    STATUS_STYLES[workspaceInfo.status]
                  )}
                >
                  <GitBranchIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[160px]">{displayBranch}</span>

                  {typeof workspaceInfo.changedFiles === "number" && workspaceInfo.changedFiles > 0 && (
                    <>
                      <span className="opacity-50">&middot;</span>
                      <span>
                        {workspaceInfo.changedFiles} file{workspaceInfo.changedFiles !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}

                  {workspaceInfo.prNumber && workspaceInfo.prUrl && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                        PR_STATUS_STYLES[workspaceInfo.prStatus || "open"]
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(workspaceInfo.prUrl!, "_blank", "noopener,noreferrer");
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      PR #{workspaceInfo.prNumber}
                    </span>
                  )}

                  <ChevronDownIcon className="w-3 h-3 opacity-50 flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              <p>{fullBranch}</p>
              <p className="text-muted-foreground capitalize">{workspaceInfo.status.replace("-", " ")}</p>
              {workspaceInfo.worktreePath && (
                <p className="text-muted-foreground truncate max-w-[300px]">{workspaceInfo.worktreePath}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenuContent align="end" className="w-48 font-mono">
          {onOpenDiffPanel && (
            <DropdownMenuItem
              onClick={() => {
                onOpenDiffPanel();
                setDropdownOpen(false);
              }}
            >
              <EyeIcon className="w-3.5 h-3.5 mr-2" />
              View Changes
            </DropdownMenuItem>
          )}

          {workspaceInfo.prUrl && (
            <DropdownMenuItem
              onClick={() => {
                window.open(workspaceInfo.prUrl!, "_blank", "noopener,noreferrer");
                setDropdownOpen(false);
              }}
            >
              <ExternalLinkIcon className="w-3.5 h-3.5 mr-2" />
              Open PR
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => {
              handleRefresh();
              setDropdownOpen(false);
            }}
            disabled={isRefreshing}
          >
            <RefreshCwIcon className={cn("w-3.5 h-3.5 mr-2", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              setShowCleanupDialog(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="w-3.5 h-3.5 mr-2" />
            Cleanup Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cleanup Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the git worktree for branch <strong className="font-semibold">{branch}</strong> and
              discard any uncommitted changes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanup}
              disabled={isCleaning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCleaning ? (
                <>
                  <Loader2Icon className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Cleaning up...
                </>
              ) : (
                "Cleanup"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
