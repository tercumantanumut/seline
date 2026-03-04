"use client";

import { useState, useEffect, useCallback } from "react";
import { CopyIcon, TrashIcon, Loader2Icon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface HistoryEntry {
  id: string;
  inputText: string;
  outputText: string;
  action: string;
  provider: string;
  createdAt: string;
  durationMs: number | null;
  language: string | null;
}

interface TranscriptionHistoryProps {
  sessionId?: string;
  className?: string;
  previewLength?: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "transcription": "Transcription",
    "fix-grammar": "Grammar Fix",
    "professional": "Professional",
    "summarize": "Summary",
    "translate": "Translation",
  };
  return labels[action] || action;
}

export function TranscriptionHistory({ sessionId, className, previewLength = 140 }: TranscriptionHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const t = useTranslations("voice");

  const loadHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      params.set("limit", "100");

      const response = await fetch(`/api/voice/history?${params.toString()}`);
      if (!response.ok) {
        console.error("[TranscriptionHistory] Server error:", response.status);
        return;
      }
      const data = await response.json() as { items?: HistoryEntry[] };

      if (Array.isArray(data.items)) {
        setEntries(data.items);
      }
    } catch (error) {
      console.error("[TranscriptionHistory] Failed to load:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("historyCopied"));
    } catch {
      toast.error(t("historyCopyFailed"));
    }
  }, [t]);

  const handleDelete = useCallback(async (entryId: string) => {
    setDeletingId(entryId);
    try {
      const response = await fetch(`/api/voice/history?id=${entryId}`, { method: "DELETE" });
      if (response.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        toast.success(t("historyDeleted"));
      }
    } catch (error) {
      console.error("[TranscriptionHistory] Delete failed:", error);
      toast.error(t("historyDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }, [t]);

  // Group by date
  const grouped = entries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
    const dateKey = entry.createdAt.slice(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2Icon className="size-4 animate-spin text-terminal-muted" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-terminal-muted", className)}>
        <HistoryIcon className="size-5" />
        <span className="text-xs font-mono">{t("historyEmpty")}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {sortedDates.map((date) => (
        <div key={date} className="flex flex-col gap-1.5">
          <div className="text-[11px] font-mono text-terminal-muted/70 uppercase tracking-wider px-1">
            {formatDate(date)}
          </div>
          {grouped[date].map((entry) => (
            <div
              key={entry.id}
              className="group relative flex flex-col gap-1 rounded-md border border-terminal-border/50 bg-terminal-cream/30 px-3 py-2 transition-colors hover:bg-terminal-cream/60"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-terminal-muted/60 uppercase">
                  {actionLabel(entry.action)}
                </span>
                {entry.durationMs != null && (
                  <span className="text-[10px] font-mono text-terminal-muted/40">
                    {(entry.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {entry.language && (
                  <span className="text-[10px] font-mono text-terminal-muted/40">
                    {entry.language}
                  </span>
                )}
              </div>

              <p className="text-xs font-mono text-terminal-dark leading-relaxed">
                {entry.outputText.length > previewLength
                  ? `${entry.outputText.slice(0, previewLength)}...`
                  : entry.outputText}
              </p>

              {/* Hover actions */}
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => void handleCopy(entry.outputText)}
                  className="rounded p-1 text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/5 transition-colors"
                  title="Copy"
                >
                  <CopyIcon className="size-3" />
                </button>
                <button
                  onClick={() => void handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  className="rounded p-1 text-terminal-muted hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {deletingId === entry.id ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <TrashIcon className="size-3" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
