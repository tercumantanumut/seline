"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/ui/animated-card";
import { ScheduleCard } from "./schedule-card";
import { ScheduleForm } from "./schedule-form";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";

interface ScheduleListProps {
  characterId: string;
  characterName?: string;
}

interface ScheduleWithRuns extends ScheduledTask {
  runs?: Array<{
    id: string;
    status: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
  }>;
}

export function ScheduleList({ characterId, characterName }: ScheduleListProps) {
  const t = useTranslations("schedules");
  const searchParams = useSearchParams();
  const [schedules, setSchedules] = useState<ScheduleWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithRuns | null>(null);

  // URL params for highlighting
  const highlightTaskId = searchParams.get("highlight");
  const highlightRunId = searchParams.get("run");
  const expandHistory = searchParams.get("expandHistory") === "true";
  const highlightedRef = useRef<HTMLDivElement>(null);

  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/schedules?characterId=${characterId}`);
      if (!res.ok) throw new Error("Failed to load schedules");
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Scroll to highlighted task when URL params are present
  useEffect(() => {
    if (highlightTaskId && !loading && highlightedRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        highlightedRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 100);
    }
  }, [highlightTaskId, loading]);

  const handleCreate = async (data: Partial<ScheduledTask>) => {
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, characterId }),
      });
      if (!res.ok) throw new Error("Failed to create schedule");
      setShowForm(false);
      await loadSchedules();
    } catch (err) {
      console.error("Failed to create schedule:", err);
      throw err;
    }
  };

  const handleUpdate = async (id: string, data: Partial<ScheduledTask>) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      setEditingSchedule(null);
      await loadSchedules();
    } catch (err) {
      console.error("Failed to update schedule:", err);
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete schedule");
      await loadSchedules();
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/trigger`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to trigger schedule");
      await loadSchedules();
    } catch (err) {
      console.error("Failed to trigger schedule:", err);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await handleUpdate(id, { enabled });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-terminal-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="font-mono text-red-500">{error}</p>
        <Button variant="outline" onClick={loadSchedules} className="gap-2 font-mono">
          <RefreshCw className="h-4 w-4" />
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-mono text-terminal-dark">
            {t("title")}
          </h2>
          <p className="text-sm font-mono text-terminal-muted">
            {t("description", { name: characterName || "Agent" })}
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-terminal-cream font-mono"
        >
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <ScheduleForm
          characterId={characterId}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Edit Form */}
      {editingSchedule && (
        <ScheduleForm
          characterId={characterId}
          schedule={editingSchedule}
          onSubmit={(data) => handleUpdate(editingSchedule.id, data)}
          onCancel={() => setEditingSchedule(null)}
        />
      )}

      {/* Schedule List */}
      {schedules.length === 0 && !showForm ? (
        <AnimatedCard className="bg-terminal-cream/50">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Calendar className="h-12 w-12 text-terminal-muted" />
            <div className="text-center">
              <p className="font-mono text-terminal-dark">{t("empty.title")}</p>
              <p className="text-sm font-mono text-terminal-muted">{t("empty.description")}</p>
            </div>
            <Button
              onClick={() => setShowForm(true)}
              variant="outline"
              className="gap-2 font-mono"
            >
              <Plus className="h-4 w-4" />
              {t("empty.action")}
            </Button>
          </div>
        </AnimatedCard>
      ) : (
        <div className="grid gap-4">
          {schedules.map((schedule) => {
            const isHighlighted = schedule.id === highlightTaskId;
            return (
              <div
                key={schedule.id}
                ref={isHighlighted ? highlightedRef : undefined}
              >
                <ScheduleCard
                  schedule={schedule}
                  onEdit={() => setEditingSchedule(schedule)}
                  onDelete={() => handleDelete(schedule.id)}
                  onTrigger={() => handleTrigger(schedule.id)}
                  onToggle={(enabled) => handleToggle(schedule.id, enabled)}
                  isHighlighted={isHighlighted}
                  highlightRunId={isHighlighted ? highlightRunId ?? undefined : undefined}
                  expandHistory={isHighlighted && expandHistory}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

