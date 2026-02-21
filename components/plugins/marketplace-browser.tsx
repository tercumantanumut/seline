/**
 * Marketplace Browser — Plugin Discovery & Installation
 *
 * Displays available plugins from registered marketplaces with
 * search, filtering, and one-click install.
 *
 * Step 7: Marketplace Browser UI
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Search,
  Download,
  CheckCircle,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Package,
  XIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MarketplaceEntry {
  id: string;
  name: string;
  source: string;
  catalog: {
    name: string;
    owner: { name: string };
    metadata?: { description?: string };
    plugins: MarketplacePlugin[];
  } | null;
  lastFetchedAt: string | null;
  lastError: string | null;
}

interface MarketplacePlugin {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  tags?: string[];
  source: string | { source: string; repo?: string; url?: string };
}

interface MarketplaceBrowserProps {
  onInstallComplete?: () => void;
}

export function MarketplaceBrowser({ onInstallComplete }: MarketplaceBrowserProps) {
  const t = useTranslations("plugins.marketplace");
  const [marketplaces, setMarketplaces] = useState<MarketplaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [installing, setInstalling] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("");
  const [adding, setAdding] = useState(false);

  const loadMarketplaces = useCallback(async () => {
    try {
      const res = await fetch("/api/plugins/marketplaces");
      if (!res.ok) return;
      const data = await res.json();
      setMarketplaces(data.marketplaces || []);
    } catch {
      console.error("[MarketplaceBrowser] Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarketplaces();
  }, [loadMarketplaces]);

  // Flatten all plugins from all marketplaces
  const allPlugins = useMemo(() => {
    const plugins: Array<MarketplacePlugin & { marketplaceName: string }> = [];
    for (const mp of marketplaces) {
      if (mp.catalog?.plugins) {
        for (const plugin of mp.catalog.plugins) {
          plugins.push({ ...plugin, marketplaceName: mp.name });
        }
      }
    }
    return plugins;
  }, [marketplaces]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of allPlugins) {
      if (p.category) cats.add(p.category);
    }
    return Array.from(cats).sort();
  }, [allPlugins]);

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    let result = allPlugins;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (categoryFilter !== "all") {
      result = result.filter((p) => p.category === categoryFilter);
    }
    return result;
  }, [allPlugins, search, categoryFilter]);

  const addMarketplace = async () => {
    if (!newName.trim() || !newSource.trim()) {
      toast.error(t("nameAndSourceRequired"));
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/plugins/marketplaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), source: newSource.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("addFailed"));
      }
      toast.success(t("added", { name: newName }));
      setNewName("");
      setNewSource("");
      setShowAddForm(false);
      loadMarketplaces();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("addFailed"));
    } finally {
      setAdding(false);
    }
  };

  const removeMarketplace = async (id: string, name: string) => {
    if (!confirm(t("removeConfirm", { name }))) return;
    try {
      const res = await fetch(`/api/plugins/marketplaces?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("removeFailed"));
      toast.success(t("removed", { name }));
      loadMarketplaces();
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  const installFromMarketplace = async (
    plugin: MarketplacePlugin & { marketplaceName: string }
  ) => {
    setInstalling(plugin.name);
    try {
      // For now, marketplace install shows guidance since actual download
      // from source requires additional infrastructure (GitHub ZIP download, etc.)
      toast.info(
        `To install "${plugin.name}", download the .zip from the source and upload it via the Install Plugin button.`,
        { duration: 6000 }
      );
    } finally {
      setInstalling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-terminal-green" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-terminal-green" />
            <h3 className="font-mono text-sm font-bold text-terminal-dark">
              Plugin Marketplace
            </h3>
            <Badge variant="secondary" className="font-mono text-[9px]">
              {allPlugins.length} available
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? (
                <XIcon className="mr-1 size-3" />
              ) : (
                <Plus className="mr-1 size-3" />
              )}
              {showAddForm ? t("cancel") : t("addSource")}
            </Button>
          </div>
        </div>

        {/* Add marketplace form */}
        {showAddForm && (
          <div className="flex items-end gap-2 p-3 rounded-lg bg-terminal-cream/50 border border-terminal-border/20">
            <div className="flex-1 space-y-1">
              <label className="font-mono text-[10px] text-terminal-muted">
                {t("nameLabel")}
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-marketplace"
                className="w-full rounded border border-terminal-border/30 bg-white px-2 py-1 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none"
              />
            </div>
            <div className="flex-[2] space-y-1">
              <label className="font-mono text-[10px] text-terminal-muted">
                {t("sourceUrlLabel")}
              </label>
              <input
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="https://github.com/user/marketplace"
                className="w-full rounded border border-terminal-border/30 bg-white px-2 py-1 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none"
              />
            </div>
            <Button
              size="sm"
              className="font-mono text-xs bg-terminal-green text-white hover:bg-terminal-green/90"
              onClick={addMarketplace}
              disabled={adding}
            >
              {adding ? <Loader2 className="size-3 animate-spin" /> : t("add")}
            </Button>
          </div>
        )}

        {/* Registered marketplaces */}
        {marketplaces.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {marketplaces.map((mp) => (
              <div
                key={mp.id}
                className="flex items-center gap-1.5 rounded-full border border-terminal-border/30 bg-white px-2.5 py-1"
              >
                <Globe className="size-3 text-terminal-green" />
                <span className="font-mono text-[10px] font-medium text-terminal-dark">
                  {mp.name}
                </span>
                <span className="font-mono text-[9px] text-terminal-muted">
                  ({mp.catalog?.plugins?.length || 0})
                </span>
                {mp.lastError && (
                  <AlertCircle className="size-3 text-amber-500" />
                )}
                <button
                  onClick={() => removeMarketplace(mp.id, mp.name)}
                  className="text-terminal-muted hover:text-red-500 transition-colors ml-0.5"
                >
                  <Trash2 className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search & Filters */}
        {allPlugins.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-terminal-muted/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-lg border border-terminal-border/30 bg-white py-1.5 pl-8 pr-3 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green/30"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={cn(
                    "rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-all",
                    categoryFilter === "all"
                      ? "bg-terminal-dark text-terminal-cream"
                      : "text-terminal-muted hover:bg-terminal-dark/5"
                  )}
                >
                  {t("allCategories")}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setCategoryFilter(categoryFilter === cat ? "all" : cat)
                    }
                    className={cn(
                      "rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-all",
                      categoryFilter === cat
                        ? "bg-terminal-dark text-terminal-cream"
                        : "text-terminal-muted hover:bg-terminal-dark/5"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Plugin list */}
        {allPlugins.length === 0 && marketplaces.length === 0 && (
          <div className="py-8 text-center">
            <Package className="mx-auto size-8 text-terminal-muted/30 mb-2" />
            <p className="font-mono text-xs text-terminal-muted">
              {t("noSources")}
            </p>
            <p className="font-mono text-[10px] text-terminal-muted/60 mt-1">
              {t("noSourcesHint")}
            </p>
          </div>
        )}

        {allPlugins.length > 0 && filteredPlugins.length === 0 && (
          <div className="py-6 text-center">
            <Search className="mx-auto size-6 text-terminal-muted/30 mb-2" />
            <p className="font-mono text-xs text-terminal-muted">
              {t("noResults")}
            </p>
          </div>
        )}

        {filteredPlugins.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPlugins.map((plugin) => (
              <div
                key={`${plugin.marketplaceName}:${plugin.name}`}
                className="flex items-start gap-3 rounded-lg border border-terminal-border/20 bg-white p-3 hover:border-terminal-green/30 transition-colors"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-terminal-green/10">
                  <Package className="size-4 text-terminal-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-terminal-dark truncate">
                      {plugin.name}
                    </span>
                    {plugin.version && (
                      <span className="font-mono text-[9px] text-terminal-muted">
                        v{plugin.version}
                      </span>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="font-mono text-[10px] text-terminal-muted mt-0.5 line-clamp-2">
                      {plugin.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {plugin.category && (
                      <Badge
                        variant="outline"
                        className="font-mono text-[8px] px-1 py-0"
                      >
                        {plugin.category}
                      </Badge>
                    )}
                    {plugin.tags?.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="font-mono text-[8px] px-1 py-0 text-terminal-muted"
                      >
                        {tag}
                      </Badge>
                    ))}
                    <span className="font-mono text-[8px] text-terminal-muted/60">
                      from {plugin.marketplaceName}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 font-mono text-[10px] h-7 px-2"
                  onClick={() => installFromMarketplace(plugin)}
                  disabled={installing === plugin.name}
                >
                  {installing === plugin.name ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3 mr-1" />
                  )}
                  Install
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
