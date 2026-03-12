"use client";

import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CATEGORY_ORDER } from "@/components/skills/catalog-display";
import { TemplateSidebar } from "./template-sidebar";
import { TemplateCard } from "./template-card";
import { TemplatePreview } from "./template-preview";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import type { CatalogSkill } from "@/lib/skills/catalog/types";

interface AgentTemplateBrowserProps {
  templates: CatalogSkill[];
  onSelectTemplate: (template: CatalogSkill) => void;
}

export function AgentTemplateBrowser({
  templates,
  onSelectTemplate,
}: AgentTemplateBrowserProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CatalogSkill | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("characterCreation.intro");

  // Extract categories in display order
  const categories = useMemo(() => {
    const present = new Set(templates.map((t) => t.category));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    // Add any categories not in the predefined order
    for (const cat of present) {
      if (!ordered.includes(cat)) ordered.push(cat);
    }
    return ordered;
  }, [templates]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Filtered templates
  const filtered = useMemo(() => {
    let result = templates;

    if (activeCategory) {
      result = result.filter((t) => t.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.shortDescription.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }, [templates, activeCategory, search]);

  // Reset selected template when it's no longer in filtered results
  useEffect(() => {
    if (selectedTemplate && !filtered.some((t) => t.id === selectedTemplate.id)) {
      setSelectedTemplate(null);
    }
  }, [filtered, selectedTemplate]);

  const handleCardClick = (template: CatalogSkill) => {
    setSelectedTemplate((prev) => (prev?.id === template.id ? prev : template));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="flex h-full min-h-0 flex-col rounded-xl border border-terminal-border bg-white/50 overflow-hidden"
      role="region"
      aria-label={t("templateBrowserLabel")}
    >
      {/* Search bar */}
      <div className="shrink-0 border-b border-terminal-border/50 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-terminal-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("templateSearchPlaceholder")}
            aria-label={t("templateSearch")}
            className="w-full rounded-lg border border-terminal-border/60 bg-white py-2 pl-9 pr-3 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/60 focus:border-terminal-green/40 focus:outline-none focus:ring-1 focus:ring-terminal-green/20"
          />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: category sidebar */}
        <div className="hidden w-48 shrink-0 overflow-y-auto border-r border-terminal-border/40 md:block">
          <TemplateSidebar
            categories={categories}
            categoryCounts={categoryCounts}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            totalCount={templates.length}
          />
        </div>

        {/* Mobile category chips (shown on small screens) */}
        <div className="block md:hidden shrink-0 border-b border-terminal-border/40 px-3 py-2 overflow-x-auto" role="tablist" aria-label={t("templateCategory")}>
          <div className="flex gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === null}
              onClick={() => setActiveCategory(null)}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                activeCategory === null
                  ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green"
                  : "border-terminal-border bg-white text-terminal-muted hover:border-terminal-green/30"
              }`}
            >
              {t("templateAll")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  activeCategory === cat
                    ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green"
                    : "border-terminal-border bg-white text-terminal-muted hover:border-terminal-green/30"
                }`}
              >
                {cat.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Center: template grid */}
        <div className="flex-1 overflow-y-auto p-3" role="tabpanel">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="font-mono text-xs text-terminal-muted">{t("templateEmpty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="listbox" aria-label={t("templateSearch")}>
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onClick={() => handleCardClick(template)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: preview panel */}
        <div className="hidden w-72 shrink-0 border-l border-terminal-border/40 lg:block">
          <TemplatePreview
            template={selectedTemplate}
            onUseTemplate={onSelectTemplate}
          />
        </div>
      </div>

      {/* Mobile: bottom sheet preview (when template selected, on smaller screens) */}
      {selectedTemplate && (
        <div className="block lg:hidden shrink-0 border-t border-terminal-border/40">
          <TemplatePreview
            template={selectedTemplate}
            onUseTemplate={onSelectTemplate}
          />
        </div>
      )}
    </motion.div>
  );
}
