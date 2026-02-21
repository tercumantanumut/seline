"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  RefreshCw,
  MessageSquare,
  Hash,
  Calendar,
  TrendingUp,
  Pin,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type SessionInfo = {
  id: string;
  title: string | null;
  characterId: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  metadata: Record<string, unknown>;
};

type AgentStat = {
  id: string;
  name: string;
  avatarUrl: string | null;
  sessionCount: number;
  totalMessages: number;
};

type ChatStats = {
  totalSessions: number;
  totalMessages: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  pinnedSessions: SessionInfo[];
  recentSessions: SessionInfo[];
  topAgents: AgentStat[];
  agentMap: Record<string, { name: string; avatarUrl: string | null }>;
};

// Skill telemetry types (kept for the collapsed section)
type WindowPreset = "24h" | "7d" | "30d";
type SkillSummary = {
  asOf: string;
  window: WindowPreset;
  totalRuns: number;
  successRate: number | null;
  topSkills: Array<{ skillId: string; name: string; runs: number; successRate: number | null }>;
  trend: Array<{ day: string; runs: number; failures: number }>;
  upcomingRuns: Array<{ taskId: string; taskName: string; nextRunAt: string | null }>;
  telemetrySummary: {
    autoTriggerRate: number | null;
    manualRunCount: number;
    autoTriggeredCount: number;
    copySuccessRate: number | null;
    copyFailureRate: number | null;
    copySuccessCount: number;
    copyFailureCount: number;
    staleUpdateRate: number | null;
    updateSuccessCount: number;
    updateStaleCount: number;
  };
  queryLatencyMs: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAsUTC(dateStr: string): Date {
  const normalized =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
      ? dateStr
      : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "–";
  const date = parseAsUTC(dateStr);
  if (isNaN(date.getTime())) return "–";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "blue" | "muted";
}) {
  const accentClass =
    accent === "green"
      ? "text-terminal-green"
      : accent === "amber"
        ? "text-terminal-amber"
        : accent === "blue"
          ? "text-blue-500"
          : "text-terminal-muted";

  return (
    <Card className="bg-terminal-cream/40 border-terminal-border/50">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 rounded-md p-2 bg-terminal-cream/60 border border-terminal-border/40", accentClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-mono text-xs text-terminal-muted">{label}</p>
            <p className="font-mono text-2xl font-bold text-terminal-dark leading-tight">{value}</p>
            {sub ? <p className="font-mono text-xs text-terminal-muted/80 mt-0.5">{sub}</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCard({
  session,
  agentName,
  onClick,
  pinned,
}: {
  session: SessionInfo;
  agentName?: string;
  onClick: () => void;
  pinned?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all duration-150",
        pinned
          ? "border-terminal-amber/30 bg-terminal-amber/5 hover:bg-terminal-amber/10"
          : "border-terminal-border/40 bg-terminal-cream/40 hover:bg-terminal-cream/70",
      )}
    >
      <div className={cn("mt-0.5 shrink-0", pinned ? "text-terminal-amber" : "text-terminal-muted")}>
        {pinned ? <Pin className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium text-terminal-dark truncate">
          {session.title || "Untitled chat"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-mono text-terminal-muted/80">
          {agentName ? <span className="text-terminal-green/80">{agentName}</span> : null}
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {relativeTime(session.lastMessageAt ?? session.updatedAt)}
          </span>
          {session.messageCount > 0 ? (
            <span>{session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  maxCount,
  onClick,
}: {
  agent: AgentStat;
  maxCount: number;
  onClick: () => void;
}) {
  const pct = maxCount > 0 ? (agent.sessionCount / maxCount) * 100 : 0;
  const initials = agent.name.slice(0, 2).toUpperCase();

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg px-2 py-2.5 cursor-pointer hover:bg-terminal-cream/60 transition-colors"
    >
      <Avatar className="h-7 w-7 shrink-0">
        {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt={agent.name} /> : null}
        <AvatarFallback className="bg-terminal-green/10 text-xs font-mono text-terminal-green">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-sm text-terminal-dark truncate group-hover:text-terminal-green transition-colors">
            {agent.name}
          </p>
          <span className="font-mono text-xs text-terminal-muted shrink-0 ml-2">
            {agent.sessionCount} chats
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-terminal-border/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-terminal-green/60 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [chatStats, setChatStats] = useState<ChatStats | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);

  const [skillSummary, setSkillSummary] = useState<SkillSummary | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillWindow, setSkillWindow] = useState<WindowPreset>("7d");
  const [skillOpen, setSkillOpen] = useState(false);

  const loadChatStats = async () => {
    try {
      setChatLoading(true);
      setChatError(null);
      const res = await fetch("/api/dashboard/chat-stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load stats");
      setChatStats(data as ChatStats);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setChatLoading(false);
    }
  };

  const loadSkillSummary = async (w: WindowPreset) => {
    try {
      setSkillLoading(true);
      setSkillError(null);
      const res = await fetch(`/api/dashboard/summary?window=${w}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load skill data");
      setSkillSummary(data as SkillSummary);
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : "Failed to load skill data");
    } finally {
      setSkillLoading(false);
    }
  };

  useEffect(() => {
    void loadChatStats();
  }, []);

  useEffect(() => {
    if (skillOpen) {
      void loadSkillSummary(skillWindow);
    }
  }, [skillOpen, skillWindow]);

  const maxAgentCount = useMemo(
    () => Math.max(...(chatStats?.topAgents.map((a) => a.sessionCount) ?? [1])),
    [chatStats],
  );

  const skillFailureCount = useMemo(
    () => skillSummary?.trend.reduce((acc, item) => acc + item.failures, 0) ?? 0,
    [skillSummary],
  );

  const goToSession = (session: SessionInfo) => {
    if (session.characterId) {
      router.push(`/chat/${session.characterId}?sessionId=${session.id}`);
    } else {
      router.push(`/chat?sessionId=${session.id}`);
    }
  };

  const goToAgent = (agentId: string) => {
    router.push(`/chat/${agentId}`);
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-2xl font-bold text-terminal-dark">Dashboard</h1>
            <p className="font-mono text-sm text-terminal-muted mt-0.5">Your AI workspace at a glance</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadChatStats()}
            disabled={chatLoading}
            className="font-mono"
          >
            {chatLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        {chatError ? (
          <p className="font-mono text-sm text-red-500">{chatError}</p>
        ) : null}

        {chatLoading ? (
          <div className="space-y-6">
            {/* Stat cards skeleton */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="bg-terminal-cream/40 border-terminal-border/50">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-9 w-9 rounded-md shrink-0" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-7 w-16" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Recent + agents skeleton */}
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3 bg-terminal-cream/30 border-terminal-border/50">
                <CardHeader className="pb-2"><Skeleton className="h-4 w-28" /></CardHeader>
                <CardContent className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-terminal-border/40 bg-terminal-cream/40 p-3">
                      <Skeleton className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 bg-terminal-cream/30 border-terminal-border/50">
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : chatStats ? (
          <>
            {/* ── Stat cards ── */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <StatCard
                icon={MessageSquare}
                label="Total chats"
                value={chatStats.totalSessions.toLocaleString()}
                accent="green"
              />
              <StatCard
                icon={Hash}
                label="Total messages"
                value={chatStats.totalMessages.toLocaleString()}
                accent="blue"
              />
              <StatCard
                icon={Calendar}
                label="Today"
                value={chatStats.sessionsToday}
                sub="active chats"
                accent="amber"
              />
              <StatCard
                icon={TrendingUp}
                label="This week"
                value={chatStats.sessionsThisWeek}
                sub="active chats"
                accent="muted"
              />
            </div>

            {/* ── Pinned chats ── */}
            {chatStats.pinnedSessions.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-terminal-amber" />
                  <h2 className="font-mono text-sm font-semibold text-terminal-dark uppercase tracking-wider">
                    Pinned Chats
                  </h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {chatStats.pinnedSessions.map((session) => {
                    const agent = session.characterId ? chatStats.agentMap[session.characterId] : undefined;
                    return (
                      <SessionCard
                        key={session.id}
                        session={session}
                        agentName={agent?.name}
                        onClick={() => goToSession(session)}
                        pinned
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* ── Recent chats + Top agents ── */}
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Recent chats (wider) */}
              <Card className="lg:col-span-3 bg-terminal-cream/30 border-terminal-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm font-semibold text-terminal-dark flex items-center gap-2">
                    <Clock className="h-4 w-4 text-terminal-muted" />
                    Recent Chats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {chatStats.recentSessions.length === 0 ? (
                    <p className="font-mono text-sm text-terminal-muted text-center py-4">
                      No chats yet. Start a conversation!
                    </p>
                  ) : (
                    chatStats.recentSessions.map((session) => {
                      const agent = session.characterId ? chatStats.agentMap[session.characterId] : undefined;
                      return (
                        <SessionCard
                          key={session.id}
                          session={session}
                          agentName={agent?.name}
                          onClick={() => goToSession(session)}
                        />
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Top agents (narrower) */}
              <Card className="lg:col-span-2 bg-terminal-cream/30 border-terminal-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm font-semibold text-terminal-dark flex items-center gap-2">
                    <Zap className="h-4 w-4 text-terminal-muted" />
                    Top Agents
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {chatStats.topAgents.length === 0 ? (
                    <p className="font-mono text-sm text-terminal-muted text-center py-4">
                      No agents used yet.
                    </p>
                  ) : (
                    chatStats.topAgents.map((agent) => (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        maxCount={maxAgentCount}
                        onClick={() => goToAgent(agent.id)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        {/* ── Skill Automation (collapsible) ── */}
        <div className="rounded-lg border border-terminal-border/40 overflow-hidden">
          <button
            onClick={() => setSkillOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-terminal-cream/30 hover:bg-terminal-cream/50 transition-colors"
          >
            <span className="font-mono text-sm font-medium text-terminal-muted flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Skill Automation
            </span>
            {skillOpen ? (
              <ChevronUp className="h-4 w-4 text-terminal-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-terminal-muted" />
            )}
          </button>

          {skillOpen ? (
            <div className="border-t border-terminal-border/40 p-4 space-y-4 bg-terminal-cream/10">
              {/* Window controls */}
              <div className="flex items-center gap-2">
                {(["24h", "7d", "30d"] as const).map((w) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={skillWindow === w ? "default" : "outline"}
                    className="font-mono text-xs h-7"
                    onClick={() => setSkillWindow(w)}
                  >
                    {w}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs h-7"
                  onClick={() => void loadSkillSummary(skillWindow)}
                  disabled={skillLoading}
                >
                  {skillLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>

              {skillError ? (
                <p className="font-mono text-sm text-red-500">{skillError}</p>
              ) : skillLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-terminal-muted" />
                </div>
              ) : skillSummary ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-mono text-terminal-muted">Total Runs</CardTitle></CardHeader><CardContent className="pt-0 font-mono font-bold">{skillSummary.totalRuns}</CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-mono text-terminal-muted">Success Rate</CardTitle></CardHeader><CardContent className="pt-0 font-mono font-bold">{skillSummary.successRate ?? "N/A"}%</CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-mono text-terminal-muted">Failures</CardTitle></CardHeader><CardContent className="pt-0 font-mono font-bold">{skillFailureCount}</CardContent></Card>
                    <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-mono text-terminal-muted">Latency</CardTitle></CardHeader><CardContent className="pt-0 font-mono font-bold">{skillSummary.queryLatencyMs} ms</CardContent></Card>
                  </div>
                  {skillSummary.topSkills.length > 0 ? (
                    <div className="space-y-1">
                      <p className="font-mono text-xs text-terminal-muted uppercase tracking-wider">Top Skills</p>
                      {skillSummary.topSkills.map((skill) => (
                        <div key={skill.skillId} className="flex items-center justify-between border-b border-terminal-border/30 pb-1 text-sm font-mono">
                          <span className="text-terminal-dark">{skill.name}</span>
                          <span className="text-terminal-muted">{skill.runs} runs · {skill.successRate ?? "N/A"}%</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {skillSummary.upcomingRuns.length > 0 ? (
                    <div className="space-y-1">
                      <p className="font-mono text-xs text-terminal-muted uppercase tracking-wider">Upcoming Runs</p>
                      {skillSummary.upcomingRuns.map((run) => (
                        <div key={run.taskId} className="flex items-center justify-between border-b border-terminal-border/30 pb-1 text-sm font-mono">
                          <span className="text-terminal-dark">{run.taskName}</span>
                          <span className="text-terminal-muted">{run.nextRunAt ? new Date(run.nextRunAt).toLocaleString() : "N/A"}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded border border-terminal-border/40 bg-terminal-cream/30 p-3 space-y-1 text-xs font-mono text-terminal-muted">
                    <p>Auto-triggered: {skillSummary.telemetrySummary.autoTriggeredCount} · Manual: {skillSummary.telemetrySummary.manualRunCount}</p>
                    <p>Copy: {skillSummary.telemetrySummary.copySuccessCount} ok / {skillSummary.telemetrySummary.copyFailureCount} fail</p>
                    <p>Updates: {skillSummary.telemetrySummary.updateSuccessCount} ok / {skillSummary.telemetrySummary.updateStaleCount} stale</p>
                    <p>As of: {new Date(skillSummary.asOf).toLocaleString()}</p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
