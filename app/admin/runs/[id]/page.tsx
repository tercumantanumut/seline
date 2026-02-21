"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, Loader2Icon, ClockIcon, WrenchIcon, BrainIcon, AlertCircleIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { AgentRun, AgentRunEvent, AgentRunStatus } from "@/lib/db/sqlite-schema";

interface RunDetailResponse { run: AgentRun; events: AgentRunEvent[]; }

const STATUS_COLORS: Record<AgentRunStatus, string> = { running: "bg-yellow-500", succeeded: "bg-green-500", failed: "bg-red-500", cancelled: "bg-gray-500" };
const EVENT_ICONS: Record<string, React.ReactNode> = {
  step_started: <ClockIcon className="size-4 text-blue-500" />, step_completed: <CheckCircleIcon className="size-4 text-green-500" />,
  tool_call_started: <WrenchIcon className="size-4 text-purple-500" />, tool_call_completed: <WrenchIcon className="size-4 text-purple-600" />,
  llm_request_started: <BrainIcon className="size-4 text-orange-500" />, llm_request_completed: <BrainIcon className="size-4 text-orange-600" />,
  error: <AlertCircleIcon className="size-4 text-red-500" />, warning: <AlertCircleIcon className="size-4 text-yellow-500" />,
};

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("admin.observability.details");
  const tStatus = useTranslations("admin.observability.status");
  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun() {
      try {
        setLoading(true); setError(null);
        const res = await fetch(`/api/admin/runs/${id}`);
        if (!res.ok) throw new Error(res.status === 404 ? t("runNotFound") : t("failedToLoad"));
        setData(await res.json());
      } catch (err) { setError(err instanceof Error ? err.message : t("failedToLoad")); } finally { setLoading(false); }
    }
    loadRun();
  }, [id]);

  const formatDuration = (ms: number | null) => { if (!ms) return "-"; if (ms < 1000) return `${ms}ms`; if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`; return `${(ms / 60000).toFixed(1)}m`; };
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString();

  if (loading) return <Shell><div className="flex h-full items-center justify-center bg-terminal-cream"><Loader2Icon className="size-6 animate-spin text-terminal-muted" /></div></Shell>;
  if (error || !data) return <Shell><div className="flex h-full flex-col items-center justify-center bg-terminal-cream gap-4"><p className="font-mono text-red-500">{error || t("runNotFound")}</p><Link href="/admin/runs"><Button variant="outline"><ArrowLeftIcon className="mr-2 size-4" />{t("backToRuns")}</Button></Link></div></Shell>;

  const { run, events } = data;

  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/runs"><Button variant="ghost" size="sm"><ArrowLeftIcon className="size-4" /></Button></Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-xl font-bold text-terminal-dark">{run.pipelineName}</h1>
                <span className={cn("flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white", STATUS_COLORS[run.status])}>{tStatus(run.status)}</span>
              </div>
              <p className="font-mono text-sm text-terminal-muted">{t("runId")}: {run.id}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-terminal-cream p-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-lg border border-terminal-border bg-white p-4">
                <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("runDetails")}</h2>
                <dl className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between"><dt className="text-terminal-muted">{t("started")}</dt><dd className="text-terminal-dark">{formatDate(run.startedAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-terminal-muted">{t("completed")}</dt><dd className="text-terminal-dark">{run.completedAt ? formatDate(run.completedAt) : "-"}</dd></div>
                  <div className="flex justify-between"><dt className="text-terminal-muted">{t("duration")}</dt><dd className="text-terminal-dark">{formatDuration(run.durationMs)}</dd></div>
                  <div className="flex justify-between"><dt className="text-terminal-muted">{t("trigger")}</dt><dd className="text-terminal-dark">{run.triggerType}</dd></div>
                  <div className="flex justify-between"><dt className="text-terminal-muted">{t("session")}</dt><dd className="text-terminal-dark text-xs">{run.sessionId.slice(0, 12)}...</dd></div>
                </dl>
              </div>
              {(() => {
                const meta = run.metadata;
                if (meta && typeof meta === "object" && Object.keys(meta as Record<string, unknown>).length > 0) {
                  return (
                    <div className="rounded-lg border border-terminal-border bg-white p-4">
                      <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("metadata")}</h2>
                      <pre className="font-mono text-xs text-terminal-dark overflow-auto max-h-48">{JSON.stringify(meta, null, 2)}</pre>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-lg border border-terminal-border bg-white p-4">
                <h2 className="font-mono text-sm font-medium text-terminal-muted mb-3">{t("eventTimeline", { count: events.length })}</h2>
                {events.length === 0 ? <p className="font-mono text-sm text-terminal-muted">{t("noEventsRecorded")}</p> : (
                  <div className="space-y-2 max-h-[600px] overflow-auto">
                    {events.map((event, idx) => (
                      <div key={event.id} className="flex gap-3 border-l-2 border-terminal-border pl-3 py-2 hover:bg-terminal-cream/50">
                        <div className="flex-shrink-0 mt-0.5">{EVENT_ICONS[event.eventType] || <ClockIcon className="size-4 text-gray-400" />}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-terminal-dark">{event.eventType}</span>
                            {event.stepName && <span className="font-mono text-xs text-terminal-muted">({event.stepName})</span>}
                            <span className="font-mono text-xs text-terminal-muted ml-auto">{formatTime(event.timestamp)}</span>
                          </div>
                          {event.durationMs && <p className="font-mono text-xs text-terminal-muted">{t("durationLabel")} {formatDuration(event.durationMs)}</p>}
                          {(() => {
                            const eventData = event.data;
                            if (eventData && typeof eventData === "object" && Object.keys(eventData as Record<string, unknown>).length > 0) {
                              return <pre className="font-mono text-xs text-terminal-muted mt-1 overflow-auto max-h-24">{JSON.stringify(eventData, null, 2)}</pre>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    ))}
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
