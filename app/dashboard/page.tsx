"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { SKILLS_V2_TRACK_C } from "@/lib/flags";

type WindowPreset = "24h" | "7d" | "30d";

type DashboardSummary = {
  asOf: string;
  window: WindowPreset;
  totalRuns: number;
  successRate: number | null;
  topSkills: Array<{ skillId: string; name: string; runs: number; successRate: number | null }>;
  trend: Array<{ day: string; runs: number; failures: number }>;
  upcomingRuns: Array<{ taskId: string; taskName: string; nextRunAt: string | null }>;
};

export default function DashboardPage() {
  if (!SKILLS_V2_TRACK_C) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-4xl px-6 py-10 font-mono text-terminal-muted">
          Dashboard is disabled for this rollout cohort.
        </div>
      </Shell>
    );
  }

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
      await fetch("/api/skills/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "skill_dashboard_loaded", metadata: { window: windowArg } }),
      });
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
              <Card><CardHeader><CardTitle>As Of</CardTitle></CardHeader><CardContent>{new Date(summary.asOf).toLocaleString()}</CardContent></Card>
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
          </>
        ) : null}
      </div>
    </Shell>
  );
}
