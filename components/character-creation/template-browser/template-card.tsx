"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatCategoryLabel } from "@/components/skills/catalog-display";
import type { CatalogSkill } from "@/lib/skills/catalog/types";

interface TemplateCardProps {
  template: CatalogSkill;
  isSelected: boolean;
  onClick: () => void;
}

export function TemplateCard({ template, isSelected, onClick }: TemplateCardProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition-all",
        "hover:shadow-sm",
        isSelected
          ? "border-terminal-green bg-terminal-green/[0.06] shadow-sm ring-1 ring-terminal-green/20"
          : "border-terminal-border/60 bg-white/80 hover:border-terminal-green/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold text-terminal-dark leading-tight">
          {template.displayName}
        </h3>
        <Badge
          variant="outline"
          className="shrink-0 border-accent/30 font-mono text-[9px] uppercase tracking-wide text-accent/80"
        >
          {formatCategoryLabel(template.category)}
        </Badge>
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-terminal-muted">
        {template.shortDescription}
      </p>
    </button>
  );
}
