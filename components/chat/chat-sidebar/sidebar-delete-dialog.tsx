"use client";

import { useTranslations } from "next-intl";
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
import type { SessionInfo } from "./types";

interface SidebarDeleteDialogProps {
  open: boolean;
  pendingSession: SessionInfo | null;
  onOpenChange: (open: boolean) => void;
  onArchiveAndReset: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
}

export function SidebarDeleteDialog({
  open,
  pendingSession,
  onOpenChange,
  onArchiveAndReset,
  onConfirmDelete,
}: SidebarDeleteDialogProps) {
  const t = useTranslations("chat");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="font-mono">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-terminal-dark uppercase tracking-tight">
            {t("channelSession.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-terminal-muted">
            {t("channelSession.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-mono">
            {t("sidebar.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="font-mono bg-terminal-green text-terminal-cream hover:bg-terminal-green/90"
            onClick={() => void onArchiveAndReset()}
          >
            {t("channelSession.archiveReset")}
          </AlertDialogAction>
          <AlertDialogAction
            className="font-mono bg-red-600 text-white hover:bg-red-600/90"
            onClick={() => void onConfirmDelete()}
          >
            {t("channelSession.deleteAnyway")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
