"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Pause, Play, Terminal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const MAX_LOG_ENTRIES = 1000;
const BOTTOM_THRESHOLD_PX = 24;

function appendLogs(current: LogEntry[], next: LogEntry[]) {
  return [...current, ...next].slice(-MAX_LOG_ENTRIES);
}

function hydrateLogs(buffer: LogEntry[], queued: LogEntry[]) {
  return appendLogs(buffer.slice(-MAX_LOG_ENTRIES), queued);
}

function flushQueuedLogs(current: LogEntry[], queued: LogEntry[]) {
  return appendLogs(current, queued);
}

function formatLogLine(log: LogEntry) {
  return `${new Date(log.timestamp).toLocaleTimeString()} [${log.level}] ${log.message}`;
}

/**
 * DevLogsViewer - Streaming logs viewer for Electron dev mode
 * Shows real-time logs from the main process with error toasts for critical issues.
 */
export function DevLogsViewer() {
  const t = useTranslations("dev");
  const [isElectron, setIsElectron] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingLogsRef = useRef<LogEntry[]>([]);
  const hydrationQueueRef = useRef<LogEntry[]>([]);
  const shouldStickToBottomRef = useRef(true);
  const pausedRef = useRef(false);
  const isHydratingRef = useRef(false);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    setIsElectron(typeof window !== "undefined" && !!window.electronAPI?.logs);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const syncScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return true;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    shouldStickToBottomRef.current = atBottom;
    setAutoScroll(atBottom);
    return atBottom;
  }, []);

  const flushPendingLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) {
      return;
    }

    setLogs((current) => appendLogs(current, pendingLogsRef.current));
    pendingLogsRef.current = [];
    setPendingCount(0);
  }, []);

  useEffect(() => {
    if (!isElectron || !isOpen || !window.electronAPI?.logs) {
      return;
    }

    const electronLogs = window.electronAPI.logs;
    let disposed = false;

    electronLogs.subscribe();

    void electronLogs.getBuffer().then((buffer) => {
      if (disposed) {
        return;
      }

      setLogs(buffer.slice(-MAX_LOG_ENTRIES));
      pendingLogsRef.current = [];
      setPendingCount(0);
      requestAnimationFrame(() => {
        shouldStickToBottomRef.current = true;
        setAutoScroll(true);
        scrollToBottom();
      });
    });

    const disposeEntry = electronLogs.onEntry((entry: LogEntry) => {
      if (pausedRef.current) {
        pendingLogsRef.current = appendLogs(pendingLogsRef.current, [entry]);
        setPendingCount(pendingLogsRef.current.length);
        return;
      }

      setLogs((current) => appendLogs(current, [entry]));
    });

    const disposeCritical = electronLogs.onCritical((data: { type: string; message: string }) => {
      if (data.type === "dimension_mismatch") {
        toast.error(t("dimensionMismatch"), {
          duration: 10000,
        });
      }
    });

    return () => {
      disposed = true;
      electronLogs.unsubscribe();
      disposeEntry();
      disposeCritical();
    };
  }, [isElectron, isOpen, scrollToBottom, t]);

  useEffect(() => {
    if (!isOpen || !autoScroll || isPaused || !shouldStickToBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [autoScroll, isOpen, isPaused, logs, scrollToBottom]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((current) => {
      const nextPaused = !current;
      if (current) {
        flushPendingLogs();
        requestAnimationFrame(() => {
          if (shouldStickToBottomRef.current) {
            scrollToBottom();
          }
        });
      }
      return nextPaused;
    });
  }, [flushPendingLogs, scrollToBottom]);

  const clearLogs = useCallback(() => {
    if (!isElectron || !window.electronAPI?.logs) {
      return;
    }

    window.electronAPI.logs.clear();
    pendingLogsRef.current = [];
    setPendingCount(0);
    setLogs([]);
    shouldStickToBottomRef.current = true;
    setAutoScroll(true);
    toast.success(t("logsCleared"));
  }, [isElectron, t]);

  const filteredLogs = useMemo(() => {
    if (!filter) {
      return logs;
    }

    const query = filter.toLowerCase();
    return logs.filter((log) => {
      const renderedLine = formatLogLine(log).toLowerCase();
      return renderedLine.includes(query);
    });
  }, [filter, logs]);

  const copyText = useCallback(async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(t("copyFailed"));
    }
  }, [t]);

  const copyVisibleLogs = useCallback(async () => {
    if (filteredLogs.length === 0) {
      toast.error(t("nothingToCopy"));
      return;
    }

    await copyText(filteredLogs.map(formatLogLine).join("\n"), t("copiedVisibleLogs"));
  }, [copyText, filteredLogs, t]);

  const resumeFollowing = useCallback(() => {
    shouldStickToBottomRef.current = true;
    setAutoScroll(true);
    if (!isPaused) {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    }
  }, [isPaused, scrollToBottom]);

  if (!isElectron) {
    return null;
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warning":
        return "text-amber-300";
      case "info":
        return "text-sky-300";
      default:
        return "text-zinc-200";
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 h-11 w-11 rounded-full border border-emerald-500/40 bg-zinc-950 text-emerald-300 shadow-lg shadow-black/40 hover:bg-zinc-900"
        onClick={() => setIsOpen((current) => !current)}
        title={t("toggleLogs")}
      >
        <Terminal className="h-5 w-5" />
      </Button>

      {isOpen && (
        <div className="fixed bottom-16 right-4 z-50 flex h-[420px] w-[720px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900/95 px-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-zinc-100">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">{t("title")}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                  {filteredLogs.length}
                </span>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                    {t("pausedCount", { count: pendingCount })}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-400">{t("subtitle")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={handlePauseToggle}
                title={isPaused ? t("resumeUpdates") : t("pauseUpdates")}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                <span className="hidden sm:inline">{isPaused ? t("resume") : t("pause")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={copyVisibleLogs}
                title={t("copyVisibleLogs")}
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">{t("copy")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                onClick={clearLogs}
                title={t("clearLogs")}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("clear")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                onClick={() => setIsOpen(false)}
                title={t("closeLogs")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
            <input
              type="text"
              placeholder={t("filterPlaceholder")}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="min-w-[220px] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 border-zinc-700 bg-zinc-950 px-3 text-xs",
                autoScroll
                  ? "text-emerald-300 hover:bg-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
              )}
              onClick={resumeFollowing}
            >
              {autoScroll ? t("following") : t("jumpToLatest")}
            </Button>
          </div>

          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-1 overflow-y-auto bg-zinc-950 p-2 font-mono text-xs"
            onScroll={syncScrollState}
          >
            {filteredLogs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-zinc-500">
                {filter ? t("noFilteredLogs") : t("emptyState")}
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-900/80"
                >
                  <span className="mt-0.5 shrink-0 text-[11px] text-zinc-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 select-text whitespace-pre-wrap break-words leading-5",
                      getLevelColor(log.level)
                    )}
                  >
                    {log.message}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => void copyText(formatLogLine(log), t("copiedLine"))}
                    title={t("copyLine")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

export { appendLogs, flushQueuedLogs, formatLogLine, hydrateLogs };
