"use client";

import { useState, useEffect } from "react";
import { Loader2, Download, Check, ExternalLink, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SkillIcon } from "@/components/skills/skill-icon";
import type { CatalogSkillWithStatus } from "@/lib/skills/catalog/types";

interface SkillDetailDialogProps {
  skill: CatalogSkillWithStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: string | null;
  onInstall: (catalogSkillId: string) => Promise<void>;
  onToggle?: (catalogSkillId: string, installedSkillId: string, enabled: boolean) => Promise<void>;
  onUninstall?: (catalogSkillId: string, installedSkillId: string) => Promise<void>;
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  characterId,
  onInstall,
  onToggle,
  onUninstall,
}: SkillDetailDialogProps) {
  const [installing, setInstalling] = useState(false);

  // Reset installing state when dialog closes or skill changes
  useEffect(() => {
    if (!open) setInstalling(false);
  }, [open]);

  if (!skill) return null;

  const handleInstall = async () => {
    if (!characterId) return;
    setInstalling(true);
    try {
      await onInstall(skill.id);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <SkillIcon icon={skill.icon} displayName={skill.displayName} size={48} />
            <div className="min-w-0">
              <DialogTitle className="font-mono text-terminal-dark">{skill.displayName}</DialogTitle>
              <DialogDescription className="mt-1 text-terminal-muted">
                {skill.shortDescription}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Category & Tags */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-mono text-xs capitalize">
              {skill.category}
            </Badge>
            {skill.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-mono text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>

          {/* Overview */}
          {skill.overview && (
            <p className="text-sm text-terminal-muted leading-relaxed">{skill.overview}</p>
          )}

          {/* Dependencies */}
          {skill.dependencies && skill.dependencies.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-terminal-muted">
                Requirements
              </h3>
              <div className="space-y-1.5">
                {skill.dependencies.map((dep) => (
                  <div
                    key={dep.value}
                    className="flex items-center justify-between rounded-md border border-terminal-border/60 px-3 py-2"
                  >
                    <div>
                      <span className="font-mono text-xs text-terminal-dark">{dep.description}</span>
                      <Badge variant="outline" className="ml-2 font-mono text-[10px]">
                        {dep.type}
                      </Badge>
                    </div>
                    {dep.url && (
                      <a href={dep.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 text-terminal-muted hover:text-terminal-green" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source info */}
          <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
            <span>Source:</span>
            {skill.installSource.type === "bundled" ? (
              <Badge variant="outline" className="text-[10px]">Bundled</Badge>
            ) : (
              <span className="truncate">{skill.installSource.repo}/{skill.installSource.path}</span>
            )}
          </div>

          {/* Platform restrictions */}
          {skill.platforms && skill.platforms.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
              <span>Platforms:</span>
              {skill.platforms.map((p) => (
                <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
              ))}
            </div>
          )}

          {/* Install / Status */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {skill.isInstalled ? (
              <>
                {onToggle && skill.installedSkillId && (
                  <div className="flex items-center gap-2 mr-auto" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={skill.isEnabled ?? false}
                      onCheckedChange={(enabled) => onToggle(skill.id, skill.installedSkillId!, enabled)}
                      className="data-[state=checked]:bg-terminal-green"
                    />
                    <span className="text-xs font-mono text-terminal-muted">
                      {skill.isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                )}
                {onUninstall && skill.installedSkillId && (
                  <Button
                    variant="outline"
                    onClick={() => onUninstall(skill.id, skill.installedSkillId!)}
                    className="gap-2 font-mono text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Uninstall
                  </Button>
                )}
                {!onToggle && !onUninstall && (
                  <Button disabled variant="outline" className="gap-2 font-mono">
                    <Check className="h-4 w-4 text-terminal-green" />
                    Installed
                  </Button>
                )}
              </>
            ) : (
              <Button
                onClick={handleInstall}
                disabled={installing || !characterId}
                className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
              >
                {installing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {installing ? "Installing..." : "Install"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
