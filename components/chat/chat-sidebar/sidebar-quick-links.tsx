"use client";

import { BookText, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DocumentsPanel } from "@/components/documents/documents-panel";

interface SidebarQuickLinksProps {
  characterId: string;
  characterName: string;
  resourcesOpen: boolean;
  docsOpen: boolean;
  onToggleResources: () => void;
  onToggleDocs: () => void;
}

function storeReturnUrl() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("seline-return-url", window.location.href);
  }
}

export function SidebarQuickLinks({
  characterId,
  characterName,
  resourcesOpen,
  docsOpen,
  onToggleResources,
  onToggleDocs,
}: SidebarQuickLinksProps) {
  const t = useTranslations("chat");

  const quickLinks = [
    { href: `/agents/${characterId}/memory`, label: t("sidebar.agentMemoryShort") },
    { href: `/agents/${characterId}/schedules`, label: t("sidebar.schedulesShort") },
    { href: `/agents/${characterId}/skills`, label: t("sidebar.skillsShort") },
    { href: "/dashboard", label: t("sidebar.dashboardShort") },
    { href: "/usage", label: t("sidebar.usageShort") },
  ];

  return (
    <div className="shrink-0 space-y-1.5 px-4 pb-4">
      <button
        className="flex w-full items-center justify-between rounded-md border border-terminal-border/50 bg-terminal-cream/60 px-2.5 py-2 text-left"
        onClick={onToggleResources}
        aria-expanded={resourcesOpen}
      >
        <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-dark">
          <Link2 className="h-3.5 w-3.5" />
          {t("sidebar.quickLinks")}
        </span>
        {resourcesOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-terminal-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-terminal-muted" />
        )}
      </button>
      {resourcesOpen ? (
        <div className="grid grid-cols-3 gap-1.5">
          {quickLinks.map(({ href, label }) => (
            <Button
              key={href}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] font-mono"
              asChild
            >
              <Link href={href} onClick={storeReturnUrl}>
                {label}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <button
        className="flex w-full items-center justify-between rounded-md border border-terminal-border/50 bg-terminal-cream/60 px-2.5 py-2 text-left"
        onClick={onToggleDocs}
        aria-expanded={docsOpen}
      >
        <span className="flex items-center gap-1.5 text-xs font-mono text-terminal-dark">
          <BookText className="h-3.5 w-3.5" />
          {t("sidebar.knowledgeBase")}
        </span>
        {docsOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-terminal-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-terminal-muted" />
        )}
      </button>
      {docsOpen ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-terminal-border/40 bg-terminal-cream/30 p-2">
          <DocumentsPanel
            agentId={characterId}
            agentName={characterName}
          />
        </div>
      ) : null}
    </div>
  );
}
