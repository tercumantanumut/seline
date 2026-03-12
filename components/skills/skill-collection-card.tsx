"use client";

import { Check, ExternalLink, Layers, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CatalogCollectionSummary } from "@/components/skills/catalog-display";
import { formatCategoryLabel } from "@/components/skills/catalog-display";

interface SkillCollectionCardProps {
  collection: CatalogCollectionSummary;
  isBusy?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  secondaryBusy?: boolean;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
}

export function SkillCollectionCard({
  collection,
  isBusy = false,
  primaryLabel,
  secondaryLabel,
  onPrimaryAction,
  onSecondaryAction,
  secondaryBusy = false,
  primaryDisabled = false,
  secondaryDisabled = false,
}: SkillCollectionCardProps) {
  const t = useTranslations("skills.catalog.collectionCard");
  const fullyInstalled = collection.count > 0 && collection.installedCount >= collection.count;
  const resolvedPrimaryLabel = primaryLabel || (fullyInstalled ? t("installed") : t("install", { count: collection.count }));

  return (
    <Card
      className={cn(
        "border-terminal-border bg-white/70 shadow-sm transition-colors",
        fullyInstalled ? "border-terminal-green/30 bg-terminal-green/[0.04]" : "hover:border-terminal-green/30"
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-terminal-dark text-terminal-green">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-terminal-dark">{collection.label}</p>
                <p className="text-xs text-terminal-muted">
                  {t("skillsCount", { count: collection.count, installed: collection.installedCount })}
                </p>
              </div>
            </div>
            {collection.description ? (
              <p className="max-w-xl text-sm leading-relaxed text-terminal-muted">{collection.description}</p>
            ) : null}
          </div>

          {collection.url ? (
            <a
              href={collection.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-terminal-muted transition-colors hover:text-terminal-green"
            >
              {t("source")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {collection.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {collection.categories.map((category) => (
              <Badge key={category} variant="outline" className="border-accent/30 font-mono text-[10px] uppercase tracking-wide text-accent/80">
                {formatCategoryLabel(category)}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {secondaryLabel && onSecondaryAction ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 font-mono"
              disabled={secondaryDisabled || secondaryBusy}
              onClick={onSecondaryAction}
            >
              {secondaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {secondaryLabel}
            </Button>
          ) : null}

          <Button
            type="button"
            className="gap-2 font-mono"
            variant={fullyInstalled && !primaryLabel ? "outline" : "default"}
            disabled={primaryDisabled || isBusy || !onPrimaryAction}
            onClick={onPrimaryAction}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : fullyInstalled && !primaryLabel ? <Check className="h-4 w-4" /> : null}
            {isBusy ? t("installing") : resolvedPrimaryLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
