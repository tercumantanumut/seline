"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/ui/animated-card";
import { ScheduleCard } from "./schedule-card";
import { FilterBar, StatusFilter, PriorityFilter } from "./filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export function ScheduleList({
  characterId,
  characterName,
}: ScheduleListProps) {
  const t = useTranslations("schedules");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [schedules, setSchedules] = useState<ScheduleWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

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
      if (!res.ok) throw new Error(t("loadSchedulesFailed"));
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadSchedulesFailed"));
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
        (statusFilter === "active" && schedule.status === "active" && schedule.enabled) ||
        (statusFilter === "inactive" && (schedule.status === "paused" || schedule.status === "archived" || !schedule.enabled)) ||
        (statusFilter === "draft" && schedule.status === "draft");

      // Priority filter
      const matchesPriority = priorityFilter === "all" ||
        schedule.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [schedules, searchQuery, statusFilter, priorityFilter]);

  const handleUpdate = async (id: string, data: Partial<ScheduledTask>) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(t("updateScheduleFailed"));
      await loadSchedules();
    } catch (err) {
      console.error("Failed to update schedule:", err);
      throw err;
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/schedules/${deleteConfirmId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("deleteScheduleFailed"));
      await loadSchedules();
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/trigger`, { method: "POST" });
      if (!res.ok) throw new Error(t("triggerScheduleFailed"));
      await loadSchedules();
    } catch (err) {
      console.error("Failed to trigger schedule:", err);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await handleUpdate(id, { enabled });
  };

  const handleEdit = (scheduleId: string) => {
    router.push(`/agents/${characterId}/schedules/${scheduleId}/edit`);
  };

  const handleStartCreate = () => {
    router.push(`/agents/${characterId}/schedules/new`);
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
      {/* Filter Bar - Only show when there are schedules */}
      {schedules.length > 0 && (
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
      {schedules.length === 0 ? (
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
          <p className="font-mono text-terminal-muted">{t("filters.noMatch")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setPriorityFilter("all");
            }}
            className="font-mono text-sm"
          >
            {t("filters.clearFilters")}
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
                  onEdit={() => handleEdit(schedule.id)}
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

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
