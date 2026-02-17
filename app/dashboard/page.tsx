"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";

type WindowPreset = "24h" | "7d" | "30d";

type DashboardSummary = {
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

export default function DashboardPage() {
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("7d");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const loadSummary = async (windowArg: WindowPreset) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/dashboard/summary?window=${windowArg}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load dashboard");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary(windowPreset);
  }, [windowPreset]);

  const failureCount = useMemo(() => {
    if (!summary) return 0;
    return summary.trend.reduce((acc, item) => acc + item.failures, 0);
  }, [summary]);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-2xl font-semibold text-terminal-dark">Team Dashboard</h1>
          <div className="flex items-center gap-2">
            {(["24h", "7d", "30d"] as const).map((item) => (
              <Button key={item} size="sm" variant={windowPreset === item ? "default" : "outline"} onClick={() => setWindowPreset(item)}>{item}</Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => void loadSummary(windowPreset)}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
          </div>
        </div>

        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}
        {error ? <p className="font-mono text-sm text-red-500">{error}</p> : null}

        {summary && !isLoading ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Card><CardHeader><CardTitle>Total Runs</CardTitle></CardHeader><CardContent>{summary.totalRuns}</CardContent></Card>
              <Card><CardHeader><CardTitle>Success Rate</CardTitle></CardHeader><CardContent>{summary.successRate ?? "N/A"}%</CardContent></Card>
              <Card><CardHeader><CardTitle>Failures</CardTitle></CardHeader><CardContent>{failureCount}</CardContent></Card>
              <Card><CardHeader><CardTitle>Query Latency</CardTitle></CardHeader><CardContent>{summary.queryLatencyMs} ms</CardContent></Card>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Card><CardHeader><CardTitle>Auto-Trigger Rate</CardTitle></CardHeader><CardContent>{summary.telemetrySummary.autoTriggerRate == null ? "N/A" : `${(summary.telemetrySummary.autoTriggerRate * 100).toFixed(1)}%`}</CardContent></Card>
              <Card><CardHeader><CardTitle>Copy Success Rate</CardTitle></CardHeader><CardContent>{summary.telemetrySummary.copySuccessRate == null ? "N/A" : `${(summary.telemetrySummary.copySuccessRate * 100).toFixed(1)}%`}</CardContent></Card>
              <Card><CardHeader><CardTitle>Copy Failure Rate</CardTitle></CardHeader><CardContent>{summary.telemetrySummary.copyFailureRate == null ? "N/A" : `${(summary.telemetrySummary.copyFailureRate * 100).toFixed(1)}%`}</CardContent></Card>
              <Card><CardHeader><CardTitle>Stale Update Rate</CardTitle></CardHeader><CardContent>{summary.telemetrySummary.staleUpdateRate == null ? "N/A" : `${(summary.telemetrySummary.staleUpdateRate * 100).toFixed(1)}%`}</CardContent></Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Top Skills</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {summary.topSkills.length === 0 ? <p className="text-sm text-terminal-muted">No runs in selected window.</p> : null}
                {summary.topSkills.map((skill) => (
                  <div key={skill.skillId} className="flex items-center justify-between border-b border-terminal-border/50 pb-2 text-sm">
                    <span className="font-mono">{skill.name}</span>
                    <span className="font-mono text-terminal-muted">{skill.runs} runs / {skill.successRate ?? "N/A"}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Upcoming Runs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {summary.upcomingRuns.length === 0 ? <p className="text-sm text-terminal-muted">No upcoming scheduled runs.</p> : null}
                {summary.upcomingRuns.map((run) => (
                  <div key={run.taskId} className="flex items-center justify-between border-b border-terminal-border/50 pb-2 text-sm">
                    <span className="font-mono">{run.taskName}</span>
                    <span className="font-mono text-terminal-muted">{run.nextRunAt ? new Date(run.nextRunAt).toLocaleString() : "N/A"}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Skill Telemetry</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm font-mono text-terminal-muted">
                <p>Auto-triggered: {summary.telemetrySummary.autoTriggeredCount}</p>
                <p>Manual runs: {summary.telemetrySummary.manualRunCount}</p>
                <p>Copy success/failure: {summary.telemetrySummary.copySuccessCount}/{summary.telemetrySummary.copyFailureCount}</p>
                <p>Skill updates success/stale: {summary.telemetrySummary.updateSuccessCount}/{summary.telemetrySummary.updateStaleCount}</p>
                <p>As of: {new Date(summary.asOf).toLocaleString()}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
