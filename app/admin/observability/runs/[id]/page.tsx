"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  Loader2Icon,
  ClockIcon,
  WrenchIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayCircleIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  CoinsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AgentRun, AgentRunEvent, AgentRunStatus } from "@/lib/db/sqlite-schema";

interface RunDetailResponse {
  run: AgentRun;
  events: AgentRunEvent[];
}

const STATUS_COLORS: Record<AgentRunStatus, string> = {
  running: "bg-yellow-500",
  succeeded: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-500",
};

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  tool_started: {
    icon: <PlayCircleIcon className="size-4" />,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  tool_completed: {
    icon: <CheckCircleIcon className="size-4" />,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  tool_failed: {
    icon: <XCircleIcon className="size-4" />,
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  tool_retry: {
    icon: <ClockIcon className="size-4" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
};

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("admin.observability.details");
  const ts = useTranslations("admin.observability.status");

  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadRun() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/admin/runs/${id}`);
        if (!res.ok) throw new Error(res.status === 404 ? t("runNotFound") : t("failedToLoad"));
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : t("failedToLoad"));
      } finally {
        setLoading(false);
      }
    }
    loadRun();
  }, [id, t]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const exportAsJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyRunId = async () => {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center bg-terminal-cream">
          <Loader2Icon className="size-6 animate-spin text-terminal-muted" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-terminal-cream">
          <p className="font-mono text-red-500">{error || t("runNotFound")}</p>
          <Link href="/admin/observability">
            <Button variant="outline">
              <ArrowLeftIcon className="mr-2 size-4" />
              {t("backToDashboard")}
            </Button>
          </Link>
        </div>
      </Shell>
    );
  }

  const { run, events } = data;
  const metadata = run.metadata as {
    characterId?: string;
    messageCount?: number;
    stepCount?: number;
    toolCallCount?: number;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    cache?: { cacheReadTokens?: number; cacheWriteTokens?: number; estimatedSavingsUsd?: number };
  } | null;

  return (
    <Shell>
      <div className="flex h-full flex-col bg-terminal-cream">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-terminal-border p-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/observability">
              <Button variant="ghost" size="sm">
                <ArrowLeftIcon className="size-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-xl font-bold text-terminal-dark">{run.pipelineName}</h1>
                <span className={cn("rounded px-2 py-0.5 text-xs font-medium text-white", STATUS_COLORS[run.status])}>
                  {ts(run.status)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm text-terminal-muted">{t("runId")}: {run.id.slice(0, 12)}...</p>
                <button onClick={copyRunId} className="text-terminal-muted hover:text-terminal-dark">
                  {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                </button>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportAsJson}>
            <DownloadIcon className="mr-1 size-4" />
            {t("exportJson")}
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Run Details */}
            <div className="space-y-4">
              {/* Run Details Card */}
              <div className="rounded-lg border border-terminal-border bg-white p-4">
                <h2 className="mb-3 font-mono text-sm font-medium text-terminal-muted">{t("runDetails")}</h2>
                <dl className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <dt className="text-terminal-muted">{t("started")}</dt>
                    <dd className="text-terminal-dark">{formatDate(run.startedAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-terminal-muted">{t("completed")}</dt>
                    <dd className="text-terminal-dark">{run.completedAt ? formatDate(run.completedAt) : "-"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-terminal-muted">{t("duration")}</dt>
                    <dd className="text-terminal-dark">{formatDuration(run.durationMs)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-terminal-muted">{t("trigger")}</dt>
                    <dd className="text-terminal-dark">{run.triggerType}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-terminal-muted">{t("session")}</dt>
                    <dd className="text-terminal-dark text-xs" title={run.sessionId}>{run.sessionId.slice(0, 16)}...</dd>
                  </div>
                  {run.characterId && (
                    <div className="flex justify-between">
                      <dt className="text-terminal-muted">{t("character")}</dt>
                      <dd className="text-terminal-dark text-xs">{run.characterId.slice(0, 12)}...</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Token Usage Card */}
              {metadata?.usage && (
                <div className="rounded-lg border border-terminal-border bg-white p-4">
                  <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-muted">
                    <CoinsIcon className="size-4" />
                    {t("tokenUsage")}
                  </h2>
                  <dl className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between">
                      <dt className="text-terminal-muted">{t("inputTokens")}</dt>
                      <dd className="text-blue-600">{(metadata.usage.inputTokens || 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-terminal-muted">{t("outputTokens")}</dt>
                      <dd className="text-green-600">{(metadata.usage.outputTokens || 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between border-t border-terminal-border pt-2">
                      <dt className="text-terminal-muted font-medium">{t("total")}</dt>
                      <dd className="font-medium text-terminal-dark">{(metadata.usage.totalTokens || 0).toLocaleString()}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {metadata?.cache && (
                <div className="rounded-lg border border-terminal-border bg-white p-4">
                  <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-muted">
                    <CoinsIcon className="size-4" />
                    {t("cacheUsage")}
                  </h2>
                  <dl className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between">
                      <dt className="text-terminal-muted">{t("cacheReadTokens")}</dt>
                      <dd className="text-emerald-600">{(metadata.cache.cacheReadTokens || 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-terminal-muted">{t("cacheWriteTokens")}</dt>
                      <dd className="text-indigo-600">{(metadata.cache.cacheWriteTokens || 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between border-t border-terminal-border pt-2">
                      <dt className="text-terminal-muted font-medium">{t("cacheSavings")}</dt>
                      <dd className="font-medium text-terminal-dark">
                        ${Number(metadata.cache.estimatedSavingsUsd || 0).toFixed(4)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Execution Stats Card */}
              {metadata && (
                <div className="rounded-lg border border-terminal-border bg-white p-4">
                  <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-medium text-terminal-muted">
                    <WrenchIcon className="size-4" />
                    {t("executionStats")}
                  </h2>
                  <dl className="space-y-2 font-mono text-sm">
                    {metadata.messageCount !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-terminal-muted">{t("messages")}</dt>
                        <dd className="text-terminal-dark">{metadata.messageCount}</dd>
                      </div>
                    )}
                    {metadata.stepCount !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-terminal-muted">{t("steps")}</dt>
                        <dd className="text-terminal-dark">{metadata.stepCount}</dd>
                      </div>
                    )}
                    {metadata.toolCallCount !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-terminal-muted">{t("toolCalls")}</dt>
                        <dd className="text-purple-600">{metadata.toolCallCount}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>

            {/* Right Column - Event Timeline */}
            <div className="lg:col-span-2">
              <div className="rounded-lg border border-terminal-border bg-white p-4">
                <h2 className="mb-4 font-mono text-sm font-medium text-terminal-muted">
                  {t("toolEventsTimeline", { count: events.length })}
                </h2>
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-terminal-muted">
                    <WrenchIcon className="mb-2 size-8 opacity-50" />
                    <p className="font-mono text-sm">{t("noToolEvents")}</p>
                    <p className="font-mono text-xs">{t("toolEventsWillAppear")}</p>
                  </div>
                ) : (
                  <div className="max-h-[600px] space-y-2 overflow-auto pr-2">
                    {events.map((event) => {
                      const config = EVENT_CONFIG[event.eventType] || {
                        icon: <ClockIcon className="size-4" />,
                        color: "text-gray-600",
                        bgColor: "bg-gray-100",
                      };
                      const eventData = event.data as Record<string, unknown> | null;

                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "flex gap-3 rounded-lg border-l-4 p-3 transition-colors hover:bg-terminal-cream/50",
                            event.eventType === "tool_started" && "border-l-blue-400 bg-blue-50/30",
                            event.eventType === "tool_completed" && "border-l-green-400 bg-green-50/30",
                            event.eventType === "tool_failed" && "border-l-red-400 bg-red-50/30",
                            event.eventType === "tool_retry" && "border-l-yellow-400 bg-yellow-50/30"
                          )}
                        >
                          <div className={cn("flex size-8 flex-shrink-0 items-center justify-center rounded-full", config.bgColor, config.color)}>
                            {config.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn("font-mono text-sm font-medium", config.color)}>
                                  {event.toolName || event.eventType}
                                </span>
                                <span className="rounded bg-terminal-cream px-1.5 py-0.5 font-mono text-xs text-terminal-muted">
                                  {event.eventType.replace("tool_", "")}
                                </span>
                              </div>
                              <span className="font-mono text-xs text-terminal-muted">{formatTime(event.timestamp)}</span>
                            </div>
                            {event.durationMs && (
                              <p className="mt-1 font-mono text-xs text-terminal-muted">
                                {t("duration")}: <span className="text-terminal-dark">{formatDuration(event.durationMs)}</span>
                              </p>
                            )}
                            {eventData && Object.keys(eventData).length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer font-mono text-xs text-terminal-muted hover:text-terminal-dark">
                                  {t("viewData", { count: Object.keys(eventData).length })}
                                </summary>
                                <pre className="mt-1 max-h-32 overflow-auto rounded bg-terminal-cream p-2 font-mono text-xs text-terminal-muted">
                                  {JSON.stringify(eventData, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
