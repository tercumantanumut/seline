"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  PackageIcon,
  SearchIcon,
  XIcon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelBag } from "@/components/model-bag/use-model-bag";
import { PROVIDER_THEME } from "@/components/model-bag/model-bag.constants";
import { getModelIcon } from "@/components/model-bag/model-bag.utils";
import type { ModelItem } from "@/components/model-bag/model-bag.types";
import { resilientPut } from "@/lib/utils/resilient-fetch";
import { useTranslations } from "next-intl";

/**
 * ModelBagPopover — "Bag of Models" inventory near the prompt input.
 *
 * List-based design: full model names, provider sections, capability badges.
 * Click a model → instantly switch. Icon placeholder ready for custom PNGs.
 */
export const ModelBagPopover: FC<{ sessionId: string }> = ({ sessionId }) => {
  const tBag = useTranslations("modelBag");
  const [open, setOpen] = useState(false);
  const bag = useModelBag();
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState<string | "all">("all");
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Only authenticated providers with models
  const authProviders = useMemo(
    () => bag.providers.filter((p) => p.isAuthenticated && p.modelCount > 0),
    [bag.providers]
  );

  // Filter + search
  const visibleModels = useMemo(() => {
    let result = bag.models.filter((m) => m.isAvailable);
    if (filterProvider !== "all") {
      result = result.filter((m) => m.provider === filterProvider);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [bag.models, filterProvider, search]);

  // Group by provider for list view
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof visibleModels> = {};
    for (const m of visibleModels) {
      (groups[m.provider] ??= []).push(m);
    }
    return groups;
  }, [visibleModels]);

  const activeModelId = bag.roleAssignments.chat;
  const activeModel = bag.models.find((m) => m.id === activeModelId);

  const handleSelectModel = useCallback(
    async (model: ModelItem) => {
      setSaving(true);
      try {
        const { error: putError } = await resilientPut(
          `/api/sessions/${sessionId}/model-config`,
          { sessionChatModel: model.id, sessionProvider: model.provider },
        );
        if (putError) {
          toast.error(putError);
          return;
        }
        // NOTE: We intentionally do NOT write to global settings here.
        // The model bag selection is a per-session override stored in session.metadata.
        // Writing to global settings would cause getConfiguredProvider() / getConfiguredModel()
        // to return the session override as if it were the global default, creating
        // inconsistency between the session model and what logs/temperature/caching use.
        // The session override takes precedence via session-model-resolver.ts.
        toast.success(tBag("switched", { name: model.name }));
        setOpen(false);
      } catch {
        toast.error(tBag("switchFailed"));
      } finally {
        setSaving(false);
      }
    },
    [sessionId, tBag]
  );

  // Tier badge colors
  const tierColors: Record<string, string> = {
    flagship: "bg-yellow-400/20 text-yellow-700",
    standard: "bg-blue-400/15 text-blue-600",
    utility: "bg-emerald-400/15 text-emerald-600",
    legacy: "bg-gray-400/15 text-gray-500",
  };

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            className={cn(
              "size-8",
              open
                ? "text-terminal-green bg-terminal-green/10 hover:bg-terminal-green/20"
                : "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
            )}
          >
            <PackageIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
          Model Bag
        </TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-[480px] max-h-[520px] flex flex-col rounded-2xl border border-terminal-border/60 bg-white shadow-2xl overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-terminal-dark to-terminal-dark/95">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-terminal-green/20">
                <PackageIcon className="size-4 text-terminal-green" />
              </div>
              <div>
                <h3 className="font-mono text-sm font-bold text-terminal-cream leading-none">{tBag("title")}</h3>
                <p className="font-mono text-[10px] text-terminal-cream/50 mt-0.5">
                  {tBag("modelCount", { count: visibleModels.length })}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-terminal-cream/40 hover:text-terminal-cream hover:bg-white/10 transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          {/* ── Active model banner ── */}
          {activeModel && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-terminal-green/5 border-b border-terminal-border/20">
              <div className="flex size-8 items-center justify-center rounded-lg bg-terminal-green/15 font-mono text-sm font-bold text-terminal-green">
                {getModelIcon(activeModel)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] text-terminal-muted uppercase tracking-wider">{tBag("currentlyActive")}</p>
                <p className="font-mono text-xs font-semibold text-terminal-dark truncate">{activeModel.name}</p>
              </div>
              <span className={cn(
                "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold",
                PROVIDER_THEME[activeModel.provider]?.badgeColor, "text-terminal-dark"
              )}>
                {activeModel.providerDisplayName}
              </span>
            </div>
          )}

          {/* ── Filters row ── */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-terminal-border/20 bg-terminal-cream/40">
            {/* Provider pills */}
            <div className="flex items-center gap-1 flex-1 overflow-x-auto">
              <button
                onClick={() => setFilterProvider("all")}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-all",
                  filterProvider === "all"
                    ? "bg-terminal-dark text-terminal-cream shadow-sm"
                    : "text-terminal-muted hover:bg-terminal-dark/5"
                )}
              >
                All
              </button>
              {authProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFilterProvider(filterProvider === p.id ? "all" : p.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-all",
                    filterProvider === p.id
                      ? "bg-terminal-dark text-terminal-cream shadow-sm"
                      : "text-terminal-muted hover:bg-terminal-dark/5",
                    p.isActive && filterProvider !== p.id && "ring-1 ring-terminal-green/40"
                  )}
                >
                  <span className="text-xs">{p.iconEmoji}</span>
                  <span>{p.displayName}</span>
                  <span className={cn(
                    "rounded-full px-1 text-[8px] font-bold",
                    filterProvider === p.id ? "bg-terminal-cream/20" : "bg-terminal-dark/5"
                  )}>
                    {p.modelCount}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-36">
              <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-terminal-muted/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tBag("bagSearchPlaceholder")}
                className="w-full rounded-lg border border-terminal-border/30 bg-white py-1 pl-7 pr-2 font-mono text-[11px] text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green/30"
              />
            </div>
          </div>

          {/* ── Model list (scrollable) ── */}
          {bag.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-terminal-muted" />
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="py-12 text-center">
              <PackageIcon className="mx-auto size-8 text-terminal-muted/30 mb-2" />
              <p className="font-mono text-xs text-terminal-muted">{tBag("noModels")}</p>
              <p className="font-mono text-[10px] text-terminal-muted/60 mt-1">{tBag("connectProviders")}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {Object.entries(groupedModels).map(([provider, models]) => {
                const theme = PROVIDER_THEME[provider as keyof typeof PROVIDER_THEME];
                const providerInfo = authProviders.find((p) => p.id === provider);
                return (
                  <div key={provider}>
                    {/* Provider section header (only if showing "all") */}
                    {filterProvider === "all" && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-terminal-cream/95 backdrop-blur-sm border-b border-terminal-border/10">
                        <span className="text-xs">{theme?.iconEmoji}</span>
                        <span className="font-mono text-[10px] font-bold text-terminal-dark uppercase tracking-wider">
                          {providerInfo?.displayName || provider}
                        </span>
                        <span className="font-mono text-[9px] text-terminal-muted">{models.length}</span>
                        <div className="flex-1 h-px bg-terminal-border/20" />
                      </div>
                    )}

                    {/* Model rows */}
                    {models.map((model) => {
                      const isActive = model.id === activeModelId;
                      return (
                        <button
                          key={`${model.provider}:${model.id}`}
                          onClick={() => handleSelectModel(model)}
                          disabled={saving}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2 transition-all duration-100",
                            "hover:bg-terminal-green/5",
                            isActive && "bg-terminal-green/8",
                            saving && "opacity-50 pointer-events-none",
                          )}
                        >
                          {/* Icon slot — placeholder for custom PNGs */}
                          <div className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                            isActive
                              ? "bg-terminal-green/15 text-terminal-green border border-terminal-green/30"
                              : "bg-terminal-dark/5 text-terminal-dark/50 border border-transparent",
                            "font-mono text-sm font-bold",
                          )}>
                            {getModelIcon(model)}
                          </div>

                          {/* Name + ID */}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "font-mono text-xs font-semibold truncate",
                                isActive ? "text-terminal-green" : "text-terminal-dark"
                              )}>
                                {model.name}
                              </span>
                              {isActive && (
                                <CheckIcon className="size-3 shrink-0 text-terminal-green" />
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-terminal-muted/60 truncate">
                              {model.id}
                            </p>
                          </div>

                          {/* Capability badges */}
                          <div className="flex items-center gap-1 shrink-0">
                            {model.capabilities.contextWindow && (
                              <span className="rounded px-1.5 py-0.5 bg-terminal-dark/5 font-mono text-[9px] text-terminal-muted">
                                {model.capabilities.contextWindow}
                              </span>
                            )}
                            {model.capabilities.thinking && (
                              <span className="rounded px-1 py-0.5 bg-purple-100 font-mono text-[9px] text-purple-600" title={tBag("capabilityThinking")} aria-label={tBag("capabilityThinking")}>
                                🧠
                              </span>
                            )}
                            {model.capabilities.speed === "fast" && (
                              <span className="rounded px-1 py-0.5 bg-amber-50 font-mono text-[9px] text-amber-600" title={tBag("capabilityFast")} aria-label={tBag("capabilityFast")}>
                                ⚡
                              </span>
                            )}
                            {model.capabilities.vision && (
                              <span className="rounded px-1 py-0.5 bg-blue-50 font-mono text-[9px] text-blue-500" title={tBag("capabilityVision")} aria-label={tBag("capabilityVision")}>
                                👁
                              </span>
                            )}
                          </div>

                          {/* Tier badge */}
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase",
                            tierColors[model.tier] || tierColors.standard
                          )}>
                            {model.tier === "flagship" ? "★" : model.tier === "utility" ? "⚡" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="shrink-0 border-t border-terminal-border/20 px-4 py-2 bg-terminal-cream/60">
            <p className="font-mono text-[10px] text-terminal-muted text-center">
              {tBag.rich("footerHint", { settings: (chunks) => <span className="text-terminal-green font-semibold">{chunks}</span> })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
