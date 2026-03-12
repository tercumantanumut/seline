"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatCategoryLabel } from "@/components/skills/catalog-display";
import type { CatalogSkill } from "@/lib/skills/catalog/types";

interface TemplatePreviewProps {
  template: CatalogSkill | null;
  onUseTemplate: (template: CatalogSkill) => void;
}

export function TemplatePreview({ template, onUseTemplate }: TemplatePreviewProps) {
  const t = useTranslations("characterCreation.intro");

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="font-mono text-xs text-terminal-muted/60 text-center">
          {t("templateSelectToPreview")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" role="region" aria-label={template.displayName}>
      {/* Header */}
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-mono text-base font-bold text-terminal-dark">
            {template.displayName}
          </h3>
          <Badge
            variant="outline"
            className="shrink-0 border-accent/30 font-mono text-[10px] uppercase tracking-wide text-accent/80"
          >
            {formatCategoryLabel(template.category)}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-terminal-muted">
          {template.shortDescription}
        </p>

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {template.tags
              .filter((tag) => tag !== "agency-agents")
              .map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-terminal-dark/5 px-2 py-0.5 font-mono text-[10px] text-terminal-muted"
                >
                  {tag}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Overview */}
      {template.overview && (
        <div className="flex-1 overflow-y-auto border-t border-terminal-border/40 px-5 py-4">
          <p className="font-mono text-xs leading-relaxed text-terminal-dark/70 whitespace-pre-line">
            {template.overview}
          </p>
        </div>
      )}

      {/* Action */}
      <div className="border-t border-terminal-border/40 p-4">
        <button
          type="button"
          onClick={() => onUseTemplate(template)}
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-terminal-dark px-4 py-2.5 font-mono text-sm text-terminal-cream transition-colors hover:bg-terminal-dark/90"
        >
          <span className="text-terminal-green" aria-hidden="true">{">"}</span>
          <span>{t("templateUse")}</span>
          <ArrowRight className="h-4 w-4 opacity-50 transition-all group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
