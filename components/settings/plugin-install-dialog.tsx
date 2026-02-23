"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { CharacterOption } from "@/components/settings/plugin-settings-types";

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

interface PluginInstallDialogProps {
  open: boolean;
  uploading: boolean;
  pendingUploadFiles: File[];
  characters: CharacterOption[];
  selectedTargetCharacterId: string;
  onOpenChange: (open: boolean) => void;
  onTargetCharacterChange: (id: string) => void;
  onCancel: () => void;
  onInstall: () => void;
  t: TranslateFn;
}

export function PluginInstallDialog({
  open,
  uploading,
  pendingUploadFiles,
  characters,
  selectedTargetCharacterId,
  onOpenChange,
  onTargetCharacterChange,
  onCancel,
  onInstall,
  t,
}: PluginInstallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-terminal-cream sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">{t("confirmInstallTitle")}</DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">{t("confirmInstallDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded border border-terminal-border/50 bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-3">
            <p className="font-mono text-xs text-terminal-muted uppercase tracking-wider">{t("filesLabel")}</p>
            <p className="mt-1 font-mono text-sm text-terminal-dark">{t("filesSelected", { count: pendingUploadFiles.length })}</p>
            <p className="mt-1 line-clamp-2 font-mono text-xs text-terminal-muted">
              {pendingUploadFiles.slice(0, 2).map((file) => file.name).join(", ")}
              {pendingUploadFiles.length > 2 ? t("moreFiles", { count: pendingUploadFiles.length - 2 }) : ""}
            </p>
          </div>

          <div className="space-y-1">
            <label className="font-mono text-xs text-terminal-muted uppercase tracking-wider">{t("mainAgentLabel")}</label>
            <select
              value={selectedTargetCharacterId}
              onChange={(event) => onTargetCharacterChange(event.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              disabled={uploading}
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.displayName || character.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="font-mono" onClick={onCancel} disabled={uploading}>
            {t("cancel")}
          </Button>
          <Button
            className="font-mono bg-terminal-green text-white hover:bg-terminal-green/90"
            onClick={onInstall}
            disabled={uploading || pendingUploadFiles.length === 0 || !selectedTargetCharacterId}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("installing")}
              </>
            ) : (
              t("installAndAssign")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
