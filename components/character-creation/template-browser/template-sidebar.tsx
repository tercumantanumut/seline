"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { formatCategoryLabel } from "@/components/skills/catalog-display";

interface TemplateSidebarProps {
  categories: string[];
  categoryCounts: Record<string, number>;
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  totalCount: number;
}

export function TemplateSidebar({
  categories,
  categoryCounts,
  activeCategory,
  onCategoryChange,
  totalCount,
}: TemplateSidebarProps) {
  const t = useTranslations("characterCreation.intro");

  return (
    <nav className="flex flex-col gap-0.5 py-2" aria-label={t("templateCategory")}>
      {/* All category */}
      <button
        type="button"
        onClick={() => onCategoryChange(null)}
        aria-pressed={activeCategory === null}
        className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors",
          activeCategory === null
            ? "bg-terminal-green/10 text-terminal-green font-semibold"
            : "text-terminal-muted hover:bg-terminal-dark/5 hover:text-terminal-dark"
        )}
      >
        <span>{t("templateAll")}</span>
        <span className="tabular-nums text-[10px] opacity-60">{totalCount}</span>
      </button>

      <div className="mx-3 my-1.5 h-px bg-terminal-border/40" />

      {/* Category list */}
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onCategoryChange(activeCategory === cat ? null : cat)}
          aria-pressed={activeCategory === cat}
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors",
            activeCategory === cat
              ? "bg-terminal-green/10 text-terminal-green font-semibold"
              : "text-terminal-muted hover:bg-terminal-dark/5 hover:text-terminal-dark"
          )}
        >
          <span>{formatCategoryLabel(cat)}</span>
          <span className="tabular-nums text-[10px] opacity-60">{categoryCounts[cat] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}
