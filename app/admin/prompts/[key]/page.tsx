"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, Loader2Icon, TrendingUpIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { PromptVersion } from "@/lib/db/sqlite-schema";
import type { PromptVersionMetrics } from "@/lib/observability";

interface PromptDetailResponse {
  templateKey: string;
  versions: PromptVersion[];
  metrics: PromptVersionMetrics[];
  timeline: Array<{ date: string; versionId: string; version: number; count: number }>;
}

export default function PromptDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const decodedKey = decodeURIComponent(key);
  const t = useTranslations("admin.prompts.detail");
  const [data, setData] = useState<PromptDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  useEffect(() => {
    async function loadPrompt() {
      try {
        setLoading(true); setError(null);
        const res = await fetch(`/api/admin/prompts/${encodeURIComponent(decodedKey)}`);
        if (!res.ok) throw new Error(res.status === 404 ? t("templateNotFound") : t("loadFailed"));
        const result = await res.json();
        setData(result);
        if (result.versions.length > 0) setSelectedVersions([result.versions[0].id]);
      } catch (err) { setError(err instanceof Error ? err.message : t("loadFailed")); } finally { setLoading(false); }
    }
    loadPrompt();
  }, [decodedKey]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
  const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`;
  const formatDuration = (ms: number) => { if (ms < 1000) return `${Math.round(ms)}ms`; return `${(ms / 1000).toFixed(1)}s`; };

  const toggleVersion = (versionId: string) => {
    setSelectedVersions(prev => prev.includes(versionId) ? prev.filter(v => v !== versionId) : [...prev, versionId]);
  };

  if (loading) return <Shell><div className="flex h-full items-center justify-center bg-terminal-cream"><Loader2Icon className="size-6 animate-spin text-terminal-muted" /></div></Shell>;
  if (error || !data) return <Shell><div className="flex h-full flex-col items-center justify-center bg-terminal-cream gap-4"><p className="font-mono text-red-500">{error || t("templateNotFound")}</p><Link href="/admin/prompts"><Button variant="outline"><ArrowLeftIcon className="mr-2 size-4" />{t("backToPrompts")}</Button></Link></div></Shell>;

  const { versions, metrics } = data;
  const metricsMap = new Map(metrics.map(m => [m.versionId, m]));

  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/prompts"><Button variant="ghost" size="sm"><ArrowLeftIcon className="size-4" /></Button></Link>
            <div>
              <h1 className="font-mono text-xl font-bold text-terminal-dark">{decodedKey}</h1>
              <p className="font-mono text-sm text-terminal-muted">{t("versionCount", { count: versions.length })}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-terminal-cream p-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-lg border border-terminal-border bg-white p-4">
                <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("versions")}</h2>
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {versions.map((version) => {
                    const m = metricsMap.get(version.id);
                    const isSelected = selectedVersions.includes(version.id);
                    return (
                      <button key={version.id} onClick={() => toggleVersion(version.id)} className={cn("w-full text-left rounded-lg border p-3 transition-all", isSelected ? "border-terminal-green bg-terminal-green/5" : "border-terminal-border hover:border-terminal-green/50")}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-medium text-terminal-dark">v{version.version}</span>
                          {m && m.runCount > 0 && <span className={cn("text-xs font-medium", m.successRate >= 0.9 ? "text-green-600" : m.successRate >= 0.7 ? "text-yellow-600" : "text-red-600")}>{formatPercent(m.successRate)}</span>}
                        </div>
                        <p className="font-mono text-xs text-terminal-muted mt-1">{formatDate(version.createdAt)}</p>
                        {m && <p className="font-mono text-xs text-terminal-muted">{t("runs", { count: m.runCount })}</p>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              {selectedVersions.length === 0 ? <div className="rounded-lg border border-terminal-border bg-white p-8 text-center"><p className="font-mono text-sm text-terminal-muted">{t("selectVersions")}</p></div> : (
                <>
                  <div className="rounded-lg border border-terminal-border bg-white p-4">
                    <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("metricsComparison")}</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-sm">
                        <thead><tr className="border-b border-terminal-border text-left"><th className="p-2 font-medium text-terminal-muted">{t("table.version")}</th><th className="p-2 font-medium text-terminal-muted">{t("table.runs")}</th><th className="p-2 font-medium text-terminal-muted">{t("table.success")}</th><th className="p-2 font-medium text-terminal-muted">{t("table.failed")}</th><th className="p-2 font-medium text-terminal-muted">{t("table.rate")}</th><th className="p-2 font-medium text-terminal-muted">{t("table.avgDuration")}</th></tr></thead>
                        <tbody>
                          {selectedVersions.map(vId => {
                            const version = versions.find(v => v.id === vId);
                            const m = metricsMap.get(vId);
                            if (!version) return null;
                            return (
                              <tr key={vId} className="border-b border-terminal-border/50">
                                <td className="p-2 text-terminal-dark">v{version.version}</td>
                                <td className="p-2 text-terminal-muted">{m?.runCount || 0}</td>
                                <td className="p-2"><span className="flex items-center gap-1 text-green-600"><CheckCircleIcon className="size-3" />{m?.successCount || 0}</span></td>
                                <td className="p-2"><span className="flex items-center gap-1 text-red-600"><XCircleIcon className="size-3" />{m?.failedCount || 0}</span></td>
                                <td className="p-2"><span className={cn("font-medium", (m?.successRate || 0) >= 0.9 ? "text-green-600" : (m?.successRate || 0) >= 0.7 ? "text-yellow-600" : "text-red-600")}>{m ? formatPercent(m.successRate) : "-"}</span></td>
                                <td className="p-2"><span className="flex items-center gap-1 text-terminal-muted"><ClockIcon className="size-3" />{m?.avgDurationMs ? formatDuration(m.avgDurationMs) : "-"}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="rounded-lg border border-terminal-border bg-white p-4">
                    <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("promptContent")}</h2>
                    <div className="space-y-4 max-h-[400px] overflow-auto">
                      {selectedVersions.map(vId => {
                        const version = versions.find(v => v.id === vId);
                        if (!version) return null;
                        return (
                          <div key={vId} className="border border-terminal-border rounded p-3">
                            <div className="flex items-center justify-between mb-2"><span className="font-mono text-sm font-medium text-terminal-dark">v{version.version}</span><span className="font-mono text-xs text-terminal-muted">{formatDate(version.createdAt)}</span></div>
                            <pre className="font-mono text-xs text-terminal-dark whitespace-pre-wrap bg-terminal-cream/50 p-2 rounded max-h-48 overflow-auto">{version.content}</pre>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
