"use client";

import { CheckSquare, Layers, Users } from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-terminal-border bg-terminal-cream p-0">
        <DialogHeader className="border-b border-terminal-border/60 px-6 py-5">
          <DialogTitle className="font-mono text-terminal-dark">{title}</DialogTitle>
          <DialogDescription className="font-mono text-xs leading-relaxed text-terminal-muted">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]">
          <div className="border-b border-terminal-border/60 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-6 py-4">
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

            <ScrollArea className="h-[420px] px-6 pb-6">
              <div className="space-y-2 pr-3">
                {skills.map((skill) => {
                  const checked = selectedSkillIds.has(skill.id);
                  return (
                    <label
                      key={skill.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
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
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-terminal-dark">
                            {skill.displayName}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide">
                            {skill.category}
                          </Badge>
                          {skill.isInstalled ? (
                            <Badge className="bg-terminal-green/15 font-mono text-[10px] text-terminal-green hover:bg-terminal-green/15">
                              {t("installedBadge")}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs leading-relaxed text-terminal-muted">
                          {skill.shortDescription}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

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
                <Button type="button" variant="outline" className="font-mono" onClick={() => onOpenChange(false)}>
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
