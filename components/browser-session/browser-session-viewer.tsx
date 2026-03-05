"use client";

/**
 * BrowserSessionViewer — Dedicated full-screen browser session viewer.
 *
 * Three-panel layout:
 *  - Top: Full-size live screencast (no blur/dim)
 *  - Bottom-left: Live action timeline
 *  - Bottom-right: Controls (replay, record, download)
 */

import { useEffect, useRef, useState, useCallback, type FC } from "react";
import {
  Globe,
  CursorClick,
  TextT,
  TreeStructure,
  Code,
  Eye,
  X,
  Play,
  ArrowRight,
  CheckCircle,
  XCircle,
  CircleNotch,
  Clock,
  Record as RecordIcon,
  Stop,
  DownloadSimple,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useScreencastRecorder } from "./use-screencast-recorder";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionRecord {
  seq: number;
  timestamp: string;
  action: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  durationMs: number;
  pageUrl?: string;
  pageTitle?: string;
  domSnapshot?: string;
  error?: string;
}

interface SessionHistory {
  sessionId: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  totalDurationMs?: number;
  actions: ActionRecord[];
}

// ─── Action helpers ───────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, typeof Globe> = {
  open: Globe,
  navigate: ArrowRight,
  click: CursorClick,
  type: TextT,
  snapshot: TreeStructure,
  extract: Eye,
  replay: Play,
  evaluate: Code,
  close: X,
};

function getActionIcon(action: string) {
  return ACTION_ICONS[action] ?? Globe;
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    open: "Open",
    navigate: "Navigate",
    click: "Click",
    type: "Type",
    snapshot: "Snapshot",
    extract: "Extract",
    evaluate: "Evaluate",
    close: "Close",
    replay: "Replay",
  };
  return labels[action] ?? action;
}

function truncateUrl(url: string, maxLen: number): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.slice(0, maxLen);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const BrowserSessionViewer: FC<{ sessionId: string }> = ({ sessionId }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [history, setHistory] = useState<SessionHistory | null>(null);
  const [pageTitle, setPageTitle] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const historyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    isRecording,
    hasRecording,
    startRecording,
    stopRecording,
    downloadRecording,
    feedFrame,
  } = useScreencastRecorder(canvasRef);

  // Connect to screencast stream
  useEffect(() => {
    if (!sessionId) return;

    let mounted = true;

    const connect = () => {
      const es = new EventSource(`/api/browser/${sessionId}/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (mounted) setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const { data } = JSON.parse(event.data) as { data: string; ts: number };
          if (data) {
            const src = `data:image/jpeg;base64,${data}`;
            if (imgRef.current) {
              imgRef.current.src = src;
            }
            feedFrame(src);
            if (mounted && !hasFrame) setHasFrame(true);
          }
        } catch {
          // Skip malformed frames
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (mounted) {
          setIsConnected(false);
          // Retry after delay
          setTimeout(() => {
            if (mounted && !eventSourceRef.current) connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Poll for action history
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/browser/${sessionId}/history`);
        if (res.ok) {
          const data = await res.json() as SessionHistory;
          setHistory(data);

          // Update page info from latest action
          const lastAction = data.actions[data.actions.length - 1];
          if (lastAction?.pageTitle) setPageTitle(lastAction.pageTitle);
          if (lastAction?.pageUrl) setPageUrl(lastAction.pageUrl);
        }
      } catch {
        // Ignore poll errors
      }
    };

    void poll();
    historyPollRef.current = setInterval(poll, 2000);

    return () => {
      if (historyPollRef.current) {
        clearInterval(historyPollRef.current);
        historyPollRef.current = null;
      }
    };
  }, [sessionId]);

  const handleReplay = useCallback(async () => {
    if (!sessionId || !history) return;
    try {
      const res = await fetch(`/api/browser/${sessionId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        console.error("Replay failed:", await res.text());
      }
    } catch (err) {
      console.error("Replay error:", err);
    }
  }, [sessionId, history]);

  const handleDownload = useCallback(async () => {
    await downloadRecording(`browser-session-${sessionId.slice(0, 8)}.webm`);
  }, [downloadRecording, sessionId]);

  return (
    <div className="flex h-full flex-col bg-black text-white">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-black/80 border-b border-white/10 shrink-0">
        <Globe className="size-4 text-white/60" weight="bold" />
        <span className="text-sm font-mono text-white/80 truncate">
          {pageTitle || "Browser Session"}
        </span>
        {pageUrl && (
          <span className="text-xs font-mono text-white/40 truncate ml-auto">
            {truncateUrl(pageUrl, 50)}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-2">
          {isConnected ? (
            <>
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              <span className="text-[10px] font-medium text-green-400/80">LIVE</span>
            </>
          ) : (
            <>
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
              <span className="text-[10px] font-medium text-yellow-500/80">CONNECTING</span>
            </>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Screencast panel (left, dominant) ── */}
        <div className="flex-1 relative flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            alt="Live browser screencast"
            className={cn(
              "max-h-full max-w-full object-contain transition-opacity duration-300",
              hasFrame ? "opacity-100" : "opacity-0"
            )}
          />

          {/* Hidden canvas for recording */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Placeholder when no frames */}
          {!hasFrame && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/30">
                <CircleNotch className="size-8 animate-spin" weight="bold" />
                <span className="text-sm font-mono">Waiting for frames...</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: Timeline + Controls ── */}
        <div className="w-80 flex flex-col border-l border-white/10 bg-black/60 shrink-0">
          {/* Timeline */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
              <Play className="size-3.5 text-white/60" weight="fill" />
              <span className="text-xs font-mono font-medium text-white/80">
                Action Timeline
              </span>
              {history && (
                <span className="text-[10px] text-white/40 ml-auto font-mono">
                  {history.actions.length} actions
                </span>
              )}
            </div>

            <div className="divide-y divide-white/5">
              {history?.actions.map((record) => {
                const Icon = getActionIcon(record.action);
                return (
                  <div
                    key={record.seq}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors"
                  >
                    {/* Status */}
                    {record.success ? (
                      <CheckCircle className="size-3 text-green-400 shrink-0" weight="fill" />
                    ) : (
                      <XCircle className="size-3 text-red-400 shrink-0" weight="fill" />
                    )}

                    {/* Icon */}
                    <Icon className="size-3 text-white/50 shrink-0" weight="bold" />

                    {/* Label */}
                    <span className="text-xs font-mono text-white/70 font-medium shrink-0">
                      {getActionLabel(record.action)}
                    </span>

                    {/* URL or target */}
                    {record.pageUrl && (
                      <span className="text-[10px] font-mono text-white/30 truncate">
                        {truncateUrl(record.pageUrl, 25)}
                      </span>
                    )}

                    {/* Duration */}
                    <span className="ml-auto text-[10px] font-mono text-white/20 shrink-0">
                      {record.durationMs}ms
                    </span>
                  </div>
                );
              })}

              {(!history || history.actions.length === 0) && (
                <div className="px-3 py-8 text-center text-xs text-white/20 font-mono">
                  No actions yet
                </div>
              )}
            </div>
          </div>

          {/* ── Controls panel ── */}
          <div className="border-t border-white/10 px-3 py-3 space-y-2 shrink-0">
            {/* Session stats */}
            {history && history.actions.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                <span className="flex items-center gap-1 text-green-400/80">
                  <CheckCircle className="size-2.5" weight="fill" />
                  {history.actions.filter((a) => a.success).length}
                </span>
                {history.actions.some((a) => !a.success) && (
                  <span className="flex items-center gap-1 text-red-400/80">
                    <XCircle className="size-2.5" weight="fill" />
                    {history.actions.filter((a) => !a.success).length}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-2.5" />
                  {((history.actions.reduce((sum, a) => sum + a.durationMs, 0)) / 1000).toFixed(1)}s
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Record / Stop */}
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <Stop className="size-3.5" weight="fill" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-mono text-white/60 hover:bg-white/20 hover:text-white/80 transition-colors"
                >
                  <RecordIcon className="size-3.5 text-red-400" weight="fill" />
                  Record
                </button>
              )}

              {/* Download recording */}
              {hasRecording && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-mono text-white/60 hover:bg-white/20 hover:text-white/80 transition-colors"
                >
                  <DownloadSimple className="size-3.5" weight="bold" />
                  Download
                </button>
              )}

              {/* Replay */}
              {history && history.actions.length > 0 && (
                <button
                  type="button"
                  onClick={handleReplay}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-mono text-white/60 hover:bg-white/20 hover:text-white/80 transition-colors ml-auto"
                >
                  <ArrowClockwise className="size-3.5" weight="bold" />
                  Replay
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
