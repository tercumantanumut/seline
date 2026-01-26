"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Loader2Icon,
  RefreshCwIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  WrenchIcon,
  AlertTriangleIcon,
  BarChart3Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  overview: {
    totalRuns: number;
    succeeded: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
    periodDays: number;
  };
  cacheMetrics: {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedSavingsUsd: number;
  };
  runsByPipeline: Array<{ pipeline: string; count: number }>;
  toolStats: Array<{ toolName: string; callCount: number; avgDurationMs: number }>;
  errorStats: Array<{ toolName: string; errorCount: number }>;
  dailyTrends: Array<{ date: string; total: number; succeeded: number; failed: number }>;
}

export function AnalyticsView() {
  const t = useTranslations("admin.observability.analytics");

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(7);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/analytics?days=${periodDays}`);
      if (!res.ok) throw new Error(t("failedToLoad"));
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [periodDays, t]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-terminal-cream">
        <Loader2Icon className="size-6 animate-spin text-terminal-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-terminal-cream">
        <p className="font-mono text-red-500">{error || t("failedToLoad")}</p>
      </div>
    );
  }

  const { overview, cacheMetrics, runsByPipeline, toolStats, errorStats, dailyTrends } = data;

  return (
    <div className="h-full overflow-auto bg-terminal-cream p-4">
      {/* Period Selector & Refresh */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="font-mono text-sm text-terminal-muted">{t("period")}:</label>
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="rounded border border-terminal-border bg-white px-2 py-1 font-mono text-sm"
          >
            <option value={1}>{t("last24Hours")}</option>
            <option value={7}>{t("last7Days")}</option>
            <option value={30}>{t("last30Days")}</option>
            <option value={90}>{t("last90Days")}</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={loadAnalytics}>
          <RefreshCwIcon className="mr-1 size-4" />
          {t("refresh")}
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={<BarChart3Icon className="size-5 text-blue-500" />}
          label={t("totalRuns")}
          value={overview.totalRuns.toLocaleString()}
          subtext={t("lastNDays", { days: overview.periodDays })}
        />
        <MetricCard
          icon={<CheckCircleIcon className="size-5 text-green-500" />}
          label={t("successRate")}
          value={`${overview.successRate}%`}
          subtext={t("succeeded", { count: overview.succeeded })}
          valueClassName={overview.successRate >= 90 ? "text-green-600" : overview.successRate >= 70 ? "text-yellow-600" : "text-red-600"}
        />
        <MetricCard
          icon={<XCircleIcon className="size-5 text-red-500" />}
          label={t("failedRuns")}
          value={overview.failed.toLocaleString()}
          subtext={t("totalFailures")}
          valueClassName={overview.failed > 0 ? "text-red-600" : "text-terminal-dark"}
        />
        <MetricCard
          icon={<ClockIcon className="size-5 text-purple-500" />}
          label={t("avgDuration")}
          value={formatDuration(overview.avgDurationMs)}
          subtext={t("perSuccessfulRun")}
        />
        <MetricCard
          icon={<TrendingUpIcon className="size-5 text-emerald-500" />}
          label={t("cacheSavings")}
          value={`$${cacheMetrics.estimatedSavingsUsd.toFixed(4)}`}
          subtext={t("cacheReadTokens", { count: cacheMetrics.cacheReadTokens.toLocaleString() })}
          valueClassName={cacheMetrics.estimatedSavingsUsd > 0 ? "text-emerald-600" : "text-terminal-dark"}
        />
        <MetricCard
          icon={<BarChart3Icon className="size-5 text-indigo-500" />}
          label={t("cacheWrites")}
          value={cacheMetrics.cacheWriteTokens.toLocaleString()}
          subtext={t("tokens")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Runs by Pipeline */}
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-dark">
            <TrendingUpIcon className="size-4" />
            {t("runsByPipeline")}
          </h3>
          {runsByPipeline.length === 0 ? (
            <p className="font-mono text-sm text-terminal-muted">{t("noData")}</p>
          ) : (
            <div className="space-y-2">
              {runsByPipeline.map((item) => (
                <div key={item.pipeline} className="flex items-center justify-between">
                  <span className="font-mono text-sm text-terminal-dark">{item.pipeline}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-terminal-cream">
                      <div
                        className="h-full bg-terminal-green"
                        style={{ width: `${(item.count / overview.totalRuns) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-terminal-muted">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool Usage Stats */}
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-dark">
            <WrenchIcon className="size-4" />
            {t("toolUsage")}
          </h3>
          {toolStats.length === 0 ? (
            <p className="font-mono text-sm text-terminal-muted">{t("noToolCalls")}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto">
              {toolStats.slice(0, 10).map((tool) => (
                <div key={tool.toolName} className="flex items-center justify-between rounded bg-terminal-cream/50 px-2 py-1.5">
                  <span className="font-mono text-sm text-terminal-dark">{tool.toolName}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-purple-600">{t("calls", { count: tool.callCount })}</span>
                    <span className="font-mono text-xs text-terminal-muted">{t("avg", { duration: formatDuration(tool.avgDurationMs) })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error Stats */}
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-dark">
            <AlertTriangleIcon className="size-4 text-red-500" />
            {t("toolErrors")}
          </h3>
          {errorStats.length === 0 ? (
            <p className="font-mono text-sm text-green-600">{t("noErrors")}</p>
          ) : (
            <div className="space-y-2">
              {errorStats.map((err) => (
                <div key={err.toolName} className="flex items-center justify-between rounded bg-red-50 px-2 py-1.5">
                  <span className="font-mono text-sm text-terminal-dark">{err.toolName}</span>
                  <span className="font-mono text-xs text-red-600">{t("errors", { count: err.errorCount })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Trends */}
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-dark">
            <BarChart3Icon className="size-4" />
            {t("dailyTrends")}
          </h3>
          {dailyTrends.length === 0 ? (
            <p className="font-mono text-sm text-terminal-muted">{t("noData")}</p>
          ) : (
            <div className="space-y-1">
              {dailyTrends.slice(-7).map((day) => {
                const maxTotal = Math.max(...dailyTrends.map(d => d.total));
                const width = maxTotal > 0 ? (day.total / maxTotal) * 100 : 0;
                return (
                  <div key={day.date} className="flex items-center gap-2">
                    <span className="w-20 font-mono text-xs text-terminal-muted">
                      {new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1">
                      <div className="flex h-4 overflow-hidden rounded bg-terminal-cream">
                        <div className="bg-green-400" style={{ width: `${(day.succeeded / (day.total || 1)) * width}%` }} />
                        <div className="bg-red-400" style={{ width: `${(day.failed / (day.total || 1)) * width}%` }} />
                      </div>
                    </div>
                    <span className="w-8 font-mono text-xs text-terminal-muted text-right">{day.total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  icon,
  label,
  value,
  subtext,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-terminal-border bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-sm text-terminal-muted">{label}</span>
      </div>
      <p className={cn("mt-2 font-mono text-2xl font-bold text-terminal-dark", valueClassName)}>
        {value}
      </p>
      <p className="font-mono text-xs text-terminal-muted">{subtext}</p>
    </div>
  );
}
