"use client";

import { useState, useMemo } from "react";
import { CheckSquare, Layers, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCategoryLabel } from "@/components/skills/catalog-display";
import type { CatalogSkillWithStatus } from "@/lib/skills/catalog/types";

export interface CatalogSelectionAgentOption {
  id: string;
  name: string;
  displayName?: string | null;
}

interface CatalogSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  skills: CatalogSkillWithStatus[];
  selectedSkillIds: Set<string>;
  onToggleSkill: (skillId: string) => void;
  onSelectAllSkills: () => void;
  onClearSkills: () => void;
  agents?: CatalogSelectionAgentOption[];
  selectedAgentIds?: Set<string>;
  onToggleAgent?: (agentId: string) => void;
  onSelectAllAgents?: () => void;
  onClearAgents?: () => void;
  applyLabel: string;
  applyDisabled?: boolean;
  isApplying?: boolean;
  onApply: () => void;
}

type SkillFilter = "all" | "not-installed" | "installed" | "selected";

export function CatalogSelectionDialog({
  open,
  onOpenChange,
  title,
  description,
  skills,
  selectedSkillIds,
  onToggleSkill,
  onSelectAllSkills,
  onClearSkills,
  agents = [],
  selectedAgentIds,
  onToggleAgent,
  onSelectAllAgents,
  onClearAgents,
  applyLabel,
  applyDisabled = false,
  isApplying = false,
  onApply,
}: CatalogSelectionDialogProps) {
  const t = useTranslations("skills.catalog.selectionDialog");
  const tc = useTranslations("common");
  const hasAgentPicker = agents.length > 0 && selectedAgentIds && onToggleAgent;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SkillFilter>("all");

  // Extract unique categories from skills
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const skill of skills) {
      cats.add(skill.category);
    }
    return Array.from(cats).sort((a, b) =>
      formatCategoryLabel(a).localeCompare(formatCategoryLabel(b))
    );
  }, [skills]);

  // Filter skills based on search, category, and status filter
  const filteredSkills = useMemo(() => {
    let result = skills;

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.displayName.toLowerCase().includes(query) ||
          skill.shortDescription.toLowerCase().includes(query) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    if (activeCategory) {
      result = result.filter((skill) => skill.category === activeCategory);
    }

    if (activeFilter === "not-installed") {
      result = result.filter((skill) => !skill.isInstalled);
    } else if (activeFilter === "installed") {
      result = result.filter((skill) => skill.isInstalled);
    } else if (activeFilter === "selected") {
      result = result.filter((skill) => selectedSkillIds.has(skill.id));
    }

    return result;
  }, [skills, search, activeCategory, activeFilter, selectedSkillIds]);

  // Reset filters when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
      setActiveCategory(null);
      setActiveFilter("all");
    }
    onOpenChange(nextOpen);
  };

  const filterOptions: { key: SkillFilter; label: string }[] = [
    { key: "all", label: t("filterAll") },
    { key: "not-installed", label: t("filterNotInstalled") },
    { key: "installed", label: t("filterInstalled") },
    { key: "selected", label: t("filterSelected") },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl border-terminal-border bg-terminal-cream p-0">
        <DialogHeader className="border-b border-terminal-border/60 px-6 py-5">
          <DialogTitle className="font-mono text-terminal-dark">{title}</DialogTitle>
          <DialogDescription className="font-mono text-xs leading-relaxed text-terminal-muted">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]">
          <div className="border-b border-terminal-border/60 lg:border-b-0 lg:border-r">
            {/* Search + header */}
            <div className="space-y-3 px-6 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-terminal-green" />
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-terminal-muted">
                    {t("skillsTitle")}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedSkillIds.size}/{skills.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={onSelectAllSkills}>
                    {t("selectAll")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={onClearSkills}>
                    {t("clear")}
                  </Button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-terminal-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border border-terminal-border bg-white py-1.5 pl-9 pr-3 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/60 focus:border-terminal-green/40 focus:outline-none focus:ring-1 focus:ring-terminal-green/20"
                />
              </div>

              {/* Category chips */}
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                        activeCategory === cat
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-muted/50 text-muted-foreground hover:border-accent/30 hover:text-accent"
                      }`}
                    >
                      {formatCategoryLabel(cat)}
                    </button>
                  ))}
                </div>
              )}

              {/* Status filter tabs */}
              <div className="flex gap-1 border-b border-terminal-border/40">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setActiveFilter(opt.key)}
                    className={`border-b-2 px-2 pb-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                      activeFilter === opt.key
                        ? "border-accent text-accent"
                        : "border-transparent text-terminal-muted hover:text-terminal-dark"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Skill list */}
            <ScrollArea className="h-[350px] px-6 pb-4">
              <div className="space-y-1.5 pr-3">
                {filteredSkills.length === 0 ? (
                  <p className="py-8 text-center font-mono text-xs text-terminal-muted">
                    {t("noMatch")}
                  </p>
                ) : (
                  filteredSkills.map((skill) => {
                    const checked = selectedSkillIds.has(skill.id);
                    return (
                      <label
                        key={skill.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          checked
                            ? "border-terminal-green/40 bg-terminal-green/[0.06]"
                            : "border-terminal-border/60 bg-white/80 hover:border-terminal-green/25"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onToggleSkill(skill.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-sm font-semibold text-terminal-dark">
                              {skill.displayName}
                            </span>
                            <Badge variant="outline" className="border-accent/30 font-mono text-[10px] uppercase tracking-wide text-accent/80">
                              {formatCategoryLabel(skill.category)}
                            </Badge>
                            {skill.isInstalled ? (
                              <Badge className="bg-accent/15 font-mono text-[10px] text-accent hover:bg-accent/15">
                                {t("installedBadge")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-terminal-muted line-clamp-1">
                            {skill.shortDescription}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel — agents or selection summary */}
          <div className="flex flex-col">
            <div className="px-6 py-4">
              {hasAgentPicker ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-terminal-green" />
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-terminal-muted">
                        {t("agentsTitle")}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {selectedAgentIds.size}/{agents.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {onSelectAllAgents ? (
                        <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={onSelectAllAgents}>
                          {t("selectAll")}
                        </Button>
                      ) : null}
                      {onClearAgents ? (
                        <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={onClearAgents}>
                          {t("clear")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-terminal-muted">
                    {t("agentsHelp")}
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-terminal-border/60 bg-white/70 p-4">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-terminal-green" />
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-terminal-muted">
                      {t("selectionSummary")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-mono text-terminal-dark">
                    {t("selectedSkills", { count: selectedSkillIds.size })}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-terminal-muted">
                    {t("singleAgentHelp")}
                  </p>
                </div>
              )}
            </div>

            {hasAgentPicker ? (
              <ScrollArea className="h-[320px] px-6 pb-6">
                <div className="space-y-2 pr-3">
                  {agents.map((agent) => {
                    const checked = selectedAgentIds.has(agent.id);
                    return (
                      <label
                        key={agent.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          checked
                            ? "border-terminal-green/40 bg-terminal-green/[0.06]"
                            : "border-terminal-border/60 bg-white/80 hover:border-terminal-green/25"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onToggleAgent(agent.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-semibold text-terminal-dark">
                            {agent.displayName || agent.name}
                          </p>
                          {agent.displayName && agent.displayName !== agent.name ? (
                            <p className="mt-1 text-xs text-terminal-muted">{agent.name}</p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1" />
            )}

            <div className="border-t border-terminal-border/60 px-6 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="outline" className="font-mono" onClick={() => handleOpenChange(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-terminal-green font-mono text-white hover:bg-terminal-green/90"
                  disabled={applyDisabled || isApplying}
                  onClick={onApply}
                >
                  {isApplying ? t("applying") : applyLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
