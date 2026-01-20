"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Loader2, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/ui/animated-card";
import { ScheduleCard } from "./schedule-card";
import { ScheduleForm } from "./schedule-form";
import { PresetSelector } from "./preset-selector";
import { FilterBar, StatusFilter, PriorityFilter } from "./filter-bar";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";
import { SchedulePreset } from "@/lib/scheduler/presets/types";

interface ScheduleListProps {
  characterId: string;
  characterName?: string;
  onNewScheduleClick?: () => void;
  showForm?: boolean;
  onFormClose?: () => void;
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

export function ScheduleList({
  characterId,
  characterName,
  onNewScheduleClick,
  showForm: externalShowForm,
  onFormClose
}: ScheduleListProps) {
  const t = useTranslations("schedules");
  const searchParams = useSearchParams();
  const [schedules, setSchedules] = useState<ScheduleWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalShowForm, setInternalShowForm] = useState(false);
  const [creationStep, setCreationStep] = useState<"preset" | "form">("preset");
  const [prefilledData, setPrefilledData] = useState<Partial<ScheduledTask> | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithRuns | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  // Determine if form should be shown (external control takes precedence)
  const showForm = externalShowForm ?? internalShowForm;
  const setShowForm = onFormClose
    ? (show: boolean) => { if (!show) onFormClose(); }
    : setInternalShowForm;

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

  // Filter schedules based on search and filters
  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
      // Search filter
      const matchesSearch = !searchQuery ||
        schedule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        schedule.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        schedule.initialPrompt?.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" && schedule.enabled) ||
        (statusFilter === "inactive" && !schedule.enabled);

      // Priority filter
      const matchesPriority = priorityFilter === "all" ||
        schedule.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [schedules, searchQuery, statusFilter, priorityFilter]);

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

  const handleStartCreate = () => {
    setCreationStep("preset");
    setPrefilledData(null);
    if (onNewScheduleClick) {
      onNewScheduleClick();
    } else {
      setInternalShowForm(true);
    }
  };

  const handlePresetSelect = (preset: SchedulePreset) => {
    setPrefilledData({
      name: preset.name,
      description: preset.description,
      cronExpression: preset.defaults.cronExpression,
      timezone: preset.defaults.timezone || undefined,
      initialPrompt: preset.defaults.initialPrompt,
      scheduleType: "cron",
    });
    setCreationStep("form");
  };

  const handleSkipPresets = () => {
    setPrefilledData(null);
    setCreationStep("form");
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
      {/* Create Flow */}
      {showForm && (
        <div className="space-y-6">
          {creationStep === "preset" ? (
            <div className="bg-terminal-cream/50 p-6 rounded-xl border border-border">
              <PresetSelector
                onSelectPreset={handlePresetSelect}
                onSkip={handleSkipPresets}
              />
              <div className="mt-6 flex justify-center">
                <Button variant="ghost" onClick={() => setShowForm(false)} className="font-mono text-sm">
                  {t("form.cancel") || "Cancel"}
                </Button>
              </div>
            </div>
          ) : (
            <ScheduleForm
              characterId={characterId}
              schedule={prefilledData || undefined}
              onSubmit={handleCreate}
              onCancel={() => {
                setShowForm(false);
                setCreationStep("preset");
              }}
            />
          )}
        </div>
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

      {/* Filter Bar - Only show when there are schedules */}
      {schedules.length > 0 && !showForm && !editingSchedule && (
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
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
              onClick={handleStartCreate}
              variant="outline"
              className="gap-2 font-mono"
            >
              {t("empty.action")}
            </Button>
          </div>
        </AnimatedCard>
      ) : filteredSchedules.length === 0 && schedules.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <p className="font-mono text-terminal-muted">No schedules match your filters</p>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setPriorityFilter("all");
            }}
            className="font-mono text-sm"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSchedules.map((schedule) => {
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
