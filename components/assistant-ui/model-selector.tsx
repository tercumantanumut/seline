"use client";

import type { FC } from "react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ChevronDownIcon,
  SearchIcon,
  CheckIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModelBag } from "@/components/model-bag/use-model-bag";
import type { ModelItem } from "@/components/model-bag/model-bag.types";
import { resilientPut } from "@/lib/utils/resilient-fetch";
import { useTranslations } from "next-intl";
import type { ContextWindowStatus } from "@/lib/hooks/use-context-status";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  anthropic: { bg: "bg-amber-500/10", text: "text-amber-700", border: "border-amber-500/30" },
  openrouter: { bg: "bg-blue-500/10", text: "text-blue-700", border: "border-blue-500/30" },
  antigravity: { bg: "bg-purple-500/10", text: "text-purple-700", border: "border-purple-500/30" },
  codex: { bg: "bg-green-500/10", text: "text-green-700", border: "border-green-500/30" },
  claudecode: { bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-500/30" },
  kimi: { bg: "bg-cyan-500/10", text: "text-cyan-700", border: "border-cyan-500/30" },
  minimax: { bg: "bg-rose-500/10", text: "text-rose-700", border: "border-rose-500/30" },
  ollama: { bg: "bg-gray-500/10", text: "text-gray-700", border: "border-gray-500/30" },
};

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  antigravity: "Antigravity",
  codex: "Codex",
  claudecode: "Claude Code",
  kimi: "Kimi",
  minimax: "MiniMax",
  ollama: "Ollama",
};

// ---------------------------------------------------------------------------
// formatModelName — human-friendly model label from full model ID
// ---------------------------------------------------------------------------

function formatModelName(modelId: string): string {
  const stripped = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  const simplePatterns: [RegExp, string][] = [
    [/^kimi-k(\d[\d.]*)/i, "Kimi K$1"],
    [/^claude-opus-(\d[\d.-]*)/i, "Opus $1"],
    [/^claude-sonnet-(\d+)-(\d+)/i, "Sonnet $1.$2"],
    [/^claude-haiku-(\d+)-(\d+)/i, "Haiku $1.$2"],
    [/^claude-(\d[\d.]*)/i, "Claude $1"],
  ];

  for (const [regex, replacement] of simplePatterns) {
    if (regex.test(stripped)) {
      return stripped.replace(regex, replacement);
    }
  }

  const gptMatch = stripped.match(/^gpt-(\d[\d.]*)-?(.*)/i);
  if (gptMatch) {
    const [, ver, suffix] = gptMatch;
    return `GPT ${ver}${suffix ? ` ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}` : ""}`;
  }

  const geminiMatch = stripped.match(/^gemini-(\d[\d.]*)-?(.*)/i);
  if (geminiMatch) {
    const [, ver, suffix] = geminiMatch;
    return `Gemini ${ver}${suffix ? ` ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}` : ""}`;
  }

  return stripped
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModelSelectorProps {
  sessionId: string;
  status: ContextWindowStatus | null;
}

// ---------------------------------------------------------------------------
// ModelSelector component
// ---------------------------------------------------------------------------

export const ModelSelector: FC<ModelSelectorProps> = ({ sessionId, status }) => {
  const t = useTranslations("modelBag");
  const [open, setOpen] = useState(false);
  const bag = useModelBag();
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState<string | "all">("all");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Close on Escape ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // ── Focus search input when popover opens ──────────────────────────────
  useEffect(() => {
    if (open) {
      // Small delay to let the DOM render
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else {
      // Reset search and filter when closing
      setSearch("");
      setFilterProvider("all");
    }
  }, [open]);

  // ── Authenticated providers with models ────────────────────────────────
  const authProviders = useMemo(
    () => bag.providers.filter((p) => p.isAuthenticated && p.modelCount > 0),
    [bag.providers],
  );

  // ── Filter + search ───────────────────────────────────────────────────
  const visibleModels = useMemo(() => {
    let result = bag.models.filter((m) => m.isAvailable);
    if (filterProvider !== "all") {
      result = result.filter((m) => m.provider === filterProvider);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [bag.models, filterProvider, search]);

  // ── Group by provider ─────────────────────────────────────────────────
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof visibleModels> = {};
    for (const m of visibleModels) {
      (groups[m.provider] ??= []).push(m);
    }
    return groups;
  }, [visibleModels]);

  // ── Active model from context status ──────────────────────────────────
  const activeModelId = status?.model?.id ?? null;
  const activeProvider = status?.model?.provider ?? null;

  // ── Select a model ────────────────────────────────────────────────────
  const handleSelectModel = useCallback(
    async (model: ModelItem) => {
      // Skip if already the active model
      if (model.id === activeModelId && model.provider === activeProvider) {
        setOpen(false);
        return;
      }
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
        toast.success(t("switched", { name: model.name }));
        setOpen(false);
        // Notify context-status to refresh immediately
        window.dispatchEvent(new Event("seline:model-config-changed"));
      } catch {
        toast.error(t("switchFailed"));
      } finally {
        setSaving(false);
      }
    },
    [sessionId, t],
  );

  // ── Trigger: derive display values from status ────────────────────────
  if (!status?.model) return null;

  const triggerModelName = formatModelName(status.model.id);
  const triggerProvider = status.model.provider;
  const triggerColors = PROVIDER_COLORS[triggerProvider] ?? PROVIDER_COLORS.anthropic;
  const triggerProviderName = PROVIDER_NAMES[triggerProvider] ?? triggerProvider;

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Trigger badge ── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border",
          "text-[10px] font-mono select-none transition-colors cursor-pointer",
          "hover:opacity-80 active:opacity-70",
          triggerColors.bg,
          triggerColors.text,
          triggerColors.border,
        )}
      >
        <span className="truncate max-w-[120px]">{triggerModelName}</span>
        <span className="opacity-60">·</span>
        <span className="opacity-60 truncate max-w-[60px]">{triggerProviderName}</span>
        <ChevronDownIcon
          className={cn(
            "size-2.5 shrink-0 opacity-50 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-[380px] max-h-[420px] flex flex-col rounded-xl border border-terminal-border/60 bg-white shadow-xl overflow-hidden">

          {/* ── Search ── */}
          <div className="shrink-0 px-3 pt-3 pb-2">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-terminal-muted/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("bagSearchPlaceholder")}
                className="w-full rounded-lg border border-terminal-border/30 bg-terminal-cream/30 py-1.5 pl-8 pr-8 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green/50 focus:outline-none focus:ring-1 focus:ring-terminal-green/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-terminal-muted/50 hover:text-terminal-dark transition-colors"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* ── Provider filter tabs ── */}
          <div className="shrink-0 flex items-center gap-1 px-3 pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFilterProvider("all")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors",
                filterProvider === "all"
                  ? "bg-terminal-dark text-terminal-cream"
                  : "text-terminal-muted hover:bg-terminal-dark/5",
              )}
            >
              All
            </button>
            {authProviders.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setFilterProvider(filterProvider === p.id ? "all" : p.id)}
                className={cn(
                  "shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-colors",
                  filterProvider === p.id
                    ? "bg-terminal-dark text-terminal-cream"
                    : "text-terminal-muted hover:bg-terminal-dark/5",
                )}
              >
                <span>{PROVIDER_NAMES[p.id] ?? p.displayName}</span>
                <span
                  className={cn(
                    "rounded-full px-1 text-[8px] font-bold",
                    filterProvider === p.id ? "bg-terminal-cream/20" : "bg-terminal-dark/5",
                  )}
                >
                  {p.modelCount}
                </span>
              </button>
            ))}
          </div>

          {/* ── Separator ── */}
          <div className="shrink-0 h-px bg-terminal-border/20" />

          {/* ── Model list ── */}
          {bag.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-terminal-muted" />
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-mono text-xs text-terminal-muted">{t("noModels")}</p>
              <p className="font-mono text-[10px] text-terminal-muted/60 mt-1">
                {t("connectProviders")}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {Object.entries(groupedModels).map(([provider, models]) => (
                <div key={provider}>
                  {/* Provider section header (only when showing all) */}
                  {filterProvider === "all" && (
                    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-terminal-cream/95 backdrop-blur-sm border-b border-terminal-border/10">
                      <span className="font-mono text-[10px] font-bold text-terminal-dark/70 uppercase tracking-wider">
                        {PROVIDER_NAMES[provider] ?? provider}
                      </span>
                      <span className="font-mono text-[9px] text-terminal-muted">
                        {models.length}
                      </span>
                      <div className="flex-1 h-px bg-terminal-border/15" />
                    </div>
                  )}

                  {/* Model rows */}
                  {models.map((model) => {
                    const isActive = model.id === activeModelId && model.provider === activeProvider;
                    return (
                      <button
                        type="button"
                        key={`${model.provider}:${model.id}`}
                        onClick={() => handleSelectModel(model)}
                        disabled={saving}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 transition-colors duration-75",
                          "hover:bg-terminal-green/5",
                          isActive && "bg-terminal-green/8",
                          saving && "opacity-50 pointer-events-none",
                        )}
                      >
                        {/* Name + ID */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "font-mono text-xs font-semibold truncate",
                                isActive ? "text-terminal-green" : "text-terminal-dark",
                              )}
                            >
                              {model.name}
                            </span>
                            {isActive && (
                              <CheckIcon className="size-3 shrink-0 text-terminal-green" />
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-terminal-muted/50 truncate mt-0.5">
                            {model.id}
                          </p>
                        </div>

                        {/* Context window badge */}
                        {model.capabilities.contextWindow && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 bg-terminal-dark/5 font-mono text-[9px] text-terminal-muted">
                            {model.capabilities.contextWindow}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="shrink-0 border-t border-terminal-border/20 px-3 py-2 bg-terminal-cream/40">
            <p className="font-mono text-[10px] text-terminal-muted text-center">
              {t.rich("footerHint", {
                settings: (chunks) => (
                  <span className="text-terminal-green font-semibold">{chunks}</span>
                ),
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
