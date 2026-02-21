"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { ActivityIcon, BarChart2Icon, ClockIcon, ExternalLinkIcon, Loader2Icon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSessionAnalytics } from "@/lib/analytics/use-session-analytics";
import { formatUsd } from "@/lib/analytics/cost";
import { useTranslations, useFormatter } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

interface SessionInfo {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: { characterId?: string; characterName?: string } & Record<string, unknown>;
}

function UsagePageFallback() {
  const t = useTranslations("usage");
  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-3">
            <BarChart2Icon className="size-6 text-terminal-green" />
            <div>
              <h1 className="font-mono text-xl font-bold text-terminal-dark">{t("title")}</h1>
              <p className="font-mono text-sm text-terminal-muted">{t("subtitle")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-terminal-cream">
          <Loader2Icon className="size-6 animate-spin text-terminal-muted" aria-label={t("loading")} />
        </div>
      </div>
    </Shell>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={<UsagePageFallback />}>
      <UsagePageContent />
    </Suspense>
  );
}

function UsagePageContent() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("sessionId");
  const t = useTranslations("usage");
  const te = useTranslations("errors");
  const formatter = useFormatter();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId);

  useEffect(() => {
    async function loadSessions() {
      try {
        setLoadingSessions(true);
        setSessionsError(null);
        const res = await fetch("/api/sessions");
        if (!res.ok) {
          throw new Error(t("errors.loadSessions"));
        }
        const data = (await res.json()) as { sessions?: SessionInfo[] };
        const sortedList = (data.sessions || []).sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setSessions(sortedList);

        if (!selectedSessionId && !initialSessionId && sortedList.length > 0) {
          setSelectedSessionId(sortedList[0].id);
        }
      } catch (err) {
        setSessionsError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingSessions(false);
      }
    }

    loadSessions();
  }, [selectedSessionId, initialSessionId, t]);

  const { analytics, loading: loadingAnalytics, error: analyticsError } = useSessionAnalytics(selectedSessionId);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  const formatSessionTimestamp = (dateStr: string) => {
    const normalized =
      dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
        ? dateStr
        : dateStr.replace(" ", "T") + "Z";
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return t("sessions.invalidDate");
    return formatter.dateTime(date, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-3">
            <BarChart2Icon className="size-6 text-terminal-green" />
            <div>
              <h1 className="font-mono text-xl font-bold text-terminal-dark">{t("title")}</h1>
              <p className="font-mono text-sm text-terminal-muted">{t("subtitle")}</p>
            </div>
          </div>
          <Link
            href="/admin/observability"
            className="flex items-center gap-2 rounded-md border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark transition-colors hover:bg-terminal-cream hover:border-terminal-green"
          >
            <ActivityIcon className="size-4" />
            <span>{t("cta.observability")}</span>
            <ExternalLinkIcon className="size-3 text-terminal-muted" />
          </Link>
        </div>

        <div className="flex flex-1 bg-terminal-cream">
          <aside className="flex w-72 flex-col border-r border-terminal-border bg-terminal-cream/80">
            <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2">
              <span className="font-mono text-xs uppercase tracking-wide text-terminal-muted">
                {t("sessions.title")}
              </span>
              {loadingSessions && <Loader2Icon className="size-3 animate-spin text-terminal-muted" />}
            </div>
            <div className="flex-1 overflow-y-auto">
              {sessionsError && (
                <div className="p-3 text-xs font-mono text-red-600">
                  {sessionsError}
                </div>
              )}
              {loadingSessions && sessions.length === 0 && (
                <div className="space-y-0.5 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-1.5 border-l-2 border-transparent px-3 py-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-2/3" />
                    </div>
                  ))}
                </div>
              )}
              {!sessionsError && sessions.length === 0 && !loadingSessions && (
                <div className="p-3 text-xs font-mono text-terminal-muted">
                  {t("sessions.empty")}
                </div>
              )}
              {sessions.map((session) => {
                const label = session.title || session.metadata?.characterName || t("sessions.untitled");
                const updated = formatSessionTimestamp(session.updatedAt);
                const isActive = session.id === selectedSessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left transition-colors",
                      isActive
                        ? "border-terminal-green bg-terminal-dark/5"
                        : "border-transparent hover:border-terminal-dark/20 hover:bg-terminal-dark/5"
                    )}
                  >
                    <span className="line-clamp-1 font-mono text-xs text-terminal-dark">{label}</span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
                      <ClockIcon className="size-3" />
                      <span>{updated}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex-1 overflow-y-auto p-4 md:p-6">
            {!selectedSession && !loadingSessions && (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-xl rounded-lg border border-dashed border-terminal-border bg-terminal-cream/60 p-6 text-center">
                  <p className="font-mono text-sm text-terminal-muted">{t("sessions.select")}</p>
                </div>
              </div>
            )}

            {selectedSession && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <h2 className="font-mono text-sm font-semibold text-terminal-dark truncate">
                      {selectedSession.title || selectedSession.metadata?.characterName || t("sessions.untitled")}
                    </h2>
                    <p className="font-mono text-xs text-terminal-muted">
                      {t("sessions.started", {
                        date: formatter.dateTime(new Date(selectedSession.createdAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </p>
                  </div>
                  {selectedSession.metadata?.characterId ? (
                    <Link
                      href={`/chat/${selectedSession.metadata.characterId}?sessionId=${selectedSession.id}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-terminal-border bg-white px-2.5 py-1.5 font-mono text-xs text-terminal-dark transition-colors hover:bg-terminal-cream hover:border-terminal-green"
                    >
                      <MessageSquareIcon className="size-3 text-terminal-green" />
                      {t("sessions.openInChat")}
                    </Link>
                  ) : null}
                </div>

                {loadingAnalytics && (
                  <div className="flex items-center gap-2 rounded-lg border border-terminal-border bg-terminal-cream/60 px-3 py-2 font-mono text-xs text-terminal-muted">
                    <Loader2Icon className="size-3 animate-spin" />
                    {t("analytics.loading")}
                  </div>
                )}

                {analyticsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700">
                    {analyticsError || te("generic")}
                  </div>
                )}

                {analytics && !loadingAnalytics && !analyticsError && (
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-lg border border-terminal-border bg-terminal-cream/80 p-3">
                        <p className="font-mono text-[11px] text-terminal-muted">{t("analytics.cards.tokens.title")}</p>
                        <div className="mt-2 flex items-baseline gap-2 font-mono">
                          <span className="text-lg font-semibold text-terminal-dark">
                            {analytics.tokenUsage.totalTokens.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-terminal-muted">{t("analytics.cards.tokens.unit")}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-mono text-terminal-muted/80">
                          {t("analytics.cards.tokens.detail", {
                            input: analytics.tokenUsage.totalInputTokens.toLocaleString(),
                            output: analytics.tokenUsage.totalOutputTokens.toLocaleString(),
                          })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-terminal-border bg-terminal-cream/80 p-3">
                        <p className="font-mono text-[11px] text-terminal-muted">{t("analytics.cards.cost.title")}</p>
                        <div className="mt-2 flex items-baseline gap-2 font-mono">
                          <span className="text-lg font-semibold text-terminal-dark">
                            {formatUsd(analytics.cost.totalCostUsd, 4)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-mono text-terminal-muted/80">
                          {t("analytics.cards.cost.detail", {
                            input: formatUsd(analytics.cost.inputCostUsd, 4),
                            output: formatUsd(analytics.cost.outputCostUsd, 4),
                          })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-terminal-border bg-terminal-cream/80 p-3">
                        <p className="font-mono text-[11px] text-terminal-muted">{t("analytics.cards.stats.title")}</p>
                        <p className="mt-2 text-sm font-mono text-terminal-dark">
                          {t("analytics.cards.stats.messages", { count: analytics.stats.messageCount })}
                        </p>
                        <p className="text-[11px] font-mono text-terminal-muted/80">
                          {t("analytics.cards.stats.breakdown", {
                            assistant: analytics.stats.assistantMessageCount,
                            user: analytics.stats.userMessageCount,
                          })}
                        </p>
                        {analytics.stats.durationMs != null && (
                          <p className="mt-1 text-[11px] font-mono text-terminal-muted/80">
                            {t("analytics.cards.stats.duration", {
                              seconds: Math.round(analytics.stats.durationMs / 1000),
                            })}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-terminal-border bg-terminal-cream/80 p-3">
                        <p className="font-mono text-[11px] text-terminal-muted">{t("analytics.cards.cache.title")}</p>
                        <div className="mt-2 flex items-baseline gap-2 font-mono">
                          <span className="text-lg font-semibold text-terminal-dark">
                            {formatUsd(analytics.cache.estimatedSavingsUsd, 4)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-mono text-terminal-muted/80">
                          {t("analytics.cards.cache.detail", {
                            read: analytics.cache.cacheReadTokens.toLocaleString(),
                            write: analytics.cache.cacheWriteTokens.toLocaleString(),
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-terminal-border bg-terminal-cream/80">
                      <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2">
                        <p className="font-mono text-xs text-terminal-muted">{t("analytics.tools.title")}</p>
                        <p className="font-mono text-[11px] text-terminal-muted">
                          {t("analytics.tools.total", { count: analytics.tools.totalToolCalls })}
                        </p>
                      </div>
                      {analytics.tools.tools.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] font-mono text-terminal-muted">
                          {t("analytics.tools.empty")}
                        </p>
                      ) : (
                        <div className="divide-y divide-terminal-border/80">
                          {analytics.tools.tools.map((tool) => (
                            <div
                              key={tool.toolName}
                              className="flex items-center justify-between px-3 py-2"
                            >
                              <div>
                                <p className="font-mono text-xs text-terminal-dark">{tool.toolName}</p>
                                <p className="text-[11px] font-mono text-terminal-muted/80">
                                  {t("analytics.tools.calls", { count: tool.callCount })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-mono text-terminal-muted/80">
                                  {t("analytics.tools.avg", { ms: Math.round(tool.averageTimeMs) })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-terminal-border bg-terminal-cream/80">
                      <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2">
                        <p className="font-mono text-xs text-terminal-muted">{t("analytics.media.title")}</p>
                        <p className="font-mono text-[11px] text-terminal-muted">
                          {t("analytics.media.total", {
                            images: analytics.media.totalImages,
                            videos: analytics.media.totalVideos,
                          })}
                        </p>
                      </div>
                      {analytics.media.byService.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] font-mono text-terminal-muted">
                          {t("analytics.media.empty")}
                        </p>
                      ) : (
                        <div className="divide-y divide-terminal-border/80">
                          {analytics.media.byService.map((svc) => (
                            <div
                              key={svc.service}
                              className="flex items-center justify-between px-3 py-2"
                            >
                              <p className="font-mono text-xs text-terminal-dark">{svc.service}</p>
                              <p className="font-mono text-[11px] text-terminal-muted/80">
                                {t("analytics.media.service", {
                                  images: svc.imageCount,
                                  videos: svc.videoCount,
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
