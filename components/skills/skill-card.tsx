"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkillIcon } from "@/components/skills/skill-icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SkillCardModel {
  id: string;
  displayName: string;
  shortDescription: string;
  icon: string | null;
  category: string;
}

interface SkillCardProps {
  skill: SkillCardModel;
  variant: "installed" | "catalog";
  isEnabled?: boolean;
  isBusy?: boolean;
  onToggle?: (enabled: boolean) => void;
  onInstall?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

export function SkillCard({
  skill,
  variant,
  isEnabled = true,
  isBusy = false,
  onToggle,
  onInstall,
  onDelete,
  onClick,
}: SkillCardProps) {
  const isInstalled = variant === "installed";

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all",
        "border-terminal-border bg-white/50 hover:border-terminal-green/30",
        isInstalled && isEnabled ? "border-terminal-green/20 bg-terminal-green/[0.02]" : ""
      )}
      onClick={onClick}
    >
      <SkillIcon icon={skill.icon} displayName={skill.displayName} size={32} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold text-terminal-dark">{skill.displayName}</p>
        <p className="mt-1 line-clamp-2 text-xs text-terminal-muted">{skill.shortDescription}</p>
      </div>

      {isInstalled ? (
        <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-terminal-muted" /> : null}
          {onToggle && (
            <Switch
              checked={isEnabled}
              onCheckedChange={(enabled) => onToggle(enabled)}
              disabled={isBusy}
              aria-label={`Toggle ${skill.displayName}`}
              className="data-[state=checked]:bg-terminal-green"
            />
          )}
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-terminal-muted hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete ${skill.displayName}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={isBusy}
          onClick={(event) => {
            event.stopPropagation();
            onInstall?.();
          }}
          aria-label={`Install ${skill.displayName}`}
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      )}
    </button>
  );
}
