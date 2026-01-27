"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Loader2Icon,
  RefreshCwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  XIcon,
  SearchIcon,
  WrenchIcon,
  CoinsIcon,
  TrendingUpIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AgentRun, AgentRunStatus } from "@/lib/db/sqlite-schema";
import { formatUsd } from "@/lib/analytics/cost";

interface RunsResponse {
  runs: AgentRun[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_COLORS: Record<AgentRunStatus, string> = {
  running: "bg-yellow-500",
  succeeded: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-500",
};

export function RunsListView() {
  const t = useTranslations("admin.observability");
  const ts = useTranslations("admin.observability.status");
  const tr = useTranslations("admin.observability.runs");

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [pipelineFilter, setPipelineFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<AgentRunStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadRuns = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (pipelineFilter) params.set("pipelineName", pipelineFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);

      const res = await fetch(`/api/admin/runs?${params}`);
      if (!res.ok) throw new Error("Failed to load runs");
      const data = (await res.json()) as RunsResponse;
      setRuns(data.runs);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [pipelineFilter, statusFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getToolCount = (run: AgentRun) => {
    const metadata = run.metadata as { toolCallCount?: number } | null;
    return metadata?.toolCallCount || 0;
  };

  const getTokenUsage = (run: AgentRun) => {
    const metadata = run.metadata as { usage?: { totalTokens?: number } } | null;
    return metadata?.usage?.totalTokens || 0;
  };

  const getCacheSavings = (run: AgentRun) => {
    const metadata = run.metadata as { cache?: { estimatedSavingsUsd?: number } } | null;
    return metadata?.cache?.estimatedSavingsUsd || 0;
  };

  const clearFilters = () => {
    setPipelineFilter("");
    setStatusFilter("");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = pipelineFilter || statusFilter || searchQuery || dateFrom || dateTo;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-terminal-border bg-terminal-cream/50 p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "bg-terminal-green/10")}
          >
            <FilterIcon className="mr-1 size-4" />
            {tr("filters")}
            {hasActiveFilters && (
              <span className="ml-1 size-2 rounded-full bg-terminal-green" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadRuns(pagination.page)}>
            <RefreshCwIcon className="mr-1 size-4" />
            {tr("refresh")}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-terminal-muted" />
            <input
              type="text"
              placeholder={tr("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-64 rounded border border-terminal-border bg-white pl-8 pr-3 font-mono text-sm focus:border-terminal-green focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-4 border-b border-terminal-border bg-terminal-cream/30 p-3">
          <div className="flex items-center gap-2">
            <label className="font-mono text-sm text-terminal-muted">{tr("pipeline")}:</label>
            <select
              value={pipelineFilter}
              onChange={(e) => setPipelineFilter(e.target.value)}
              className="rounded border border-terminal-border bg-white px-2 py-1 font-mono text-sm"
            >
              <option value="">{tr("all")}</option>
              <option value="chat">chat</option>
              <option value="enhance-prompt">enhance-prompt</option>
              <option value="deep-research">deep-research</option>
              <option value="web-browse">web-browse</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-mono text-sm text-terminal-muted">{tr("status")}:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AgentRunStatus | "")}
              className="rounded border border-terminal-border bg-white px-2 py-1 font-mono text-sm"
            >
              <option value="">{tr("all")}</option>
              <option value="running">{ts("running")}</option>
              <option value="succeeded">{ts("succeeded")}</option>
              <option value="failed">{ts("failed")}</option>
              <option value="cancelled">{ts("cancelled")}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-mono text-sm text-terminal-muted">{tr("from")}:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-terminal-border bg-white px-2 py-1 font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-mono text-sm text-terminal-muted">{tr("to")}:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-terminal-border bg-white px-2 py-1 font-mono text-sm"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <XIcon className="mr-1 size-4" />
              {tr("clear")}
            </Button>
          )}
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2Icon className="size-6 animate-spin text-terminal-muted" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-red-500">{error}</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-terminal-muted">{tr("noRunsFound")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-terminal-border bg-white">
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-cream/50 text-left">
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.status")}</th>
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.pipeline")}</th>
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.started")}</th>
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.duration")}</th>
                  <th className="p-3 font-medium text-terminal-muted">
                    <div className="flex items-center gap-1">
                      <WrenchIcon className="size-3" />
                      {tr("table.tools")}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-terminal-muted">
                    <div className="flex items-center gap-1">
                      <CoinsIcon className="size-3" />
                      {tr("table.tokens")}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-terminal-muted">
                    <div className="flex items-center gap-1">
                      <TrendingUpIcon className="size-3" />
                      {tr("table.cache")}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.session")}</th>
                  <th className="p-3 font-medium text-terminal-muted">{tr("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-terminal-border/50 transition-colors hover:bg-terminal-green/5"
                  >
                    <td className="p-3">
                      <span className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", STATUS_COLORS[run.status])} />
                        <span className="text-terminal-dark">{ts(run.status)}</span>
                      </span>
                    </td>
                    <td className="p-3 text-terminal-dark">{run.pipelineName}</td>
                    <td className="p-3 text-terminal-muted">{formatDate(run.startedAt)}</td>
                    <td className="p-3 text-terminal-muted">{formatDuration(run.durationMs)}</td>
                    <td className="p-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                        getToolCount(run) > 0 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {getToolCount(run)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-terminal-muted">
                        {getTokenUsage(run).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-terminal-muted">
                        {getCacheSavings(run) > 0 ? formatUsd(getCacheSavings(run), 4) : "-"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-terminal-muted" title={run.sessionId}>
                        {run.sessionId.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/observability/runs/${run.id}`}
                        className="text-terminal-green hover:underline"
                      >
                        {tr("viewDetails")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-terminal-border bg-terminal-cream/50 p-3">
          <p className="font-mono text-sm text-terminal-muted">
            {tr("showing", { count: runs.length, total: pagination.total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => loadRuns(pagination.page - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="font-mono text-sm text-terminal-muted">
              {tr("page", { current: pagination.page, total: pagination.totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadRuns(pagination.page + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
