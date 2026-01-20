"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Save, X, Plus, Loader2, Globe, ArrowLeft, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";

import { ScheduleTypeTabs, type ScheduleType } from "./schedule-type-tabs";
import { DaySelector } from "./day-selector";
import { PromptEditor, type PromptEditorRef } from "./prompt-editor";
import { VariableChips } from "./variable-chips";
import { ScheduleSummaryCard } from "./schedule-summary-card";
import { CronBuilder } from "./cron-builder";
import { useLocalTimezone, parseTimezoneValue, formatTimezoneDisplay } from "@/lib/hooks/use-local-timezone";
import { buildCronExpression, parseCronExpression } from "@/lib/utils/cron-helpers";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";

interface ScheduleFormProps {
  characterId: string;
  characterName?: string;
  schedule?: Partial<ScheduledTask>;
  onSubmit: (data: Partial<ScheduledTask>) => Promise<void>;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Denver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function ScheduleForm({
  characterId,
  characterName,
  schedule,
  onSubmit,
}: ScheduleFormProps) {
  const t = useTranslations("schedules.newForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const promptEditorRef = useRef<PromptEditorRef>(null);
  const { timezone: localTz, displayName: localDisplayName, localValue } = useLocalTimezone();

  const isEditing = !!schedule?.id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing schedule if editing
  const existingCron = schedule?.cronExpression || "0 8 * * 1,3,5";
  const { time: existingTime, days: existingDays, isSimple } = parseCronExpression(existingCron);

  // Form state
  const [name, setName] = useState(schedule?.name ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [prompt, setPrompt] = useState(schedule?.initialPrompt ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    isSimple ? (existingDays.length === 7 ? "daily" : "specific") : "advanced"
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(existingDays);
  const [time, setTime] = useState(existingTime);
  const [timezone, setTimezone] = useState(schedule?.timezone ?? (localValue ?? "UTC"));
  const [cronExpression, setCronExpression] = useState(existingCron);
  const [priority, setPriority] = useState<"low" | "normal" | "high">(
    (schedule?.priority as "low" | "normal" | "high") ?? "normal"
  );
  const [maxRetries, setMaxRetries] = useState(schedule?.maxRetries ?? 3);

  // Check if current selection is a local timezone
  const isLocalTimezone = timezone.startsWith("local::");
  const { timezone: parsedTz } = parseTimezoneValue(timezone);

  // Build cron from UI selections (for daily/specific modes)
  const buildCronFromUI = useCallback(() => {
    const days = scheduleType === "daily" ? undefined : selectedDays;
    return buildCronExpression(time, days);
  }, [time, selectedDays, scheduleType]);

  // Get effective cron expression based on mode
  const effectiveCron = scheduleType === "advanced" ? cronExpression : buildCronFromUI();

  // Update cron expression when UI changes
  useEffect(() => {
    if (scheduleType !== "advanced") {
      setCronExpression(buildCronFromUI());
    }
  }, [scheduleType, time, selectedDays, buildCronFromUI]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !prompt.trim()) {
      setError(t("validation.required"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduleType: "cron",
        cronExpression: effectiveCron,
        timezone,
        initialPrompt: prompt.trim(),
        priority,
        maxRetries,
      });
      router.push(`/agents/${characterId}/schedules`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("validation.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVariableInsert = (variable: string) => {
    if (promptEditorRef.current) {
      promptEditorRef.current.insertAtCursor(variable);
    } else {
      setPrompt((prev) => prev + variable);
    }
  };

  const handleCancel = () => {
    router.push(`/agents/${characterId}/schedules`);
  };

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col bg-terminal-cream/30">
      {/* Header */}
      <div className="px-6 md:px-8 py-5 border-b border-terminal-border flex items-center justify-between shrink-0 bg-terminal-cream/50">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 -ml-2 rounded-lg hover:bg-terminal-dark/10 text-terminal-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tight font-mono text-terminal-dark">
              {isEditing ? t("editTitle") : t("createTitle")}
            </h2>
            <p className="text-sm text-terminal-muted mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {t("systemActive")}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-6 md:px-8 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700 font-mono">{error}</p>
        </div>
      )}

      {/* Two-Panel Content */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT PANEL - Configuration */}
        <div className="lg:col-span-5 border-r border-terminal-border overflow-y-auto custom-scrollbar">
          <div className="p-6 md:p-8 space-y-8">
            {/* Section 1: Basic Info */}
            <section className="space-y-5">
              <SectionHeader number={1} title={t("sections.basicInfo")} />

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-terminal-muted ml-1 uppercase tracking-wider">
                  {t("fields.name")}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("placeholders.name")}
                  className="font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs text-terminal-muted ml-1 uppercase tracking-wider">
                  {t("fields.description")}
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("placeholders.description")}
                  rows={2}
                  className="font-mono text-sm"
                />
              </div>
            </section>

            <hr className="border-terminal-border border-dashed" />

            {/* Section 2: Frequency & Timing */}
            <section className="space-y-5">
              <SectionHeader number={2} title={t("sections.frequency")} />

              <ScheduleTypeTabs value={scheduleType} onChange={setScheduleType} />

              {scheduleType === "advanced" ? (
                <div className="p-4 bg-terminal-cream rounded-xl border border-terminal-border">
                  <CronBuilder value={cronExpression} onChange={setCronExpression} />
                </div>
              ) : (
                <div className="space-y-5 p-5 bg-terminal-cream rounded-xl border border-terminal-border">
                  {scheduleType === "specific" && (
                    <DaySelector
                      selectedDays={selectedDays}
                      onChange={setSelectedDays}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-terminal-muted uppercase tracking-wider">
                        {t("fields.atTime")}
                      </Label>
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-terminal-muted uppercase tracking-wider">
                        {t("fields.timezone")}
                      </Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="font-mono text-sm">
                          <div className="flex items-center gap-2 truncate">
                            {isLocalTimezone && <Globe className="h-4 w-4 text-blue-500 shrink-0" />}
                            <SelectValue>
                              {isLocalTimezone
                                ? `Local (${localDisplayName || parsedTz})`
                                : formatTimezoneDisplay(timezone)
                              }
                            </SelectValue>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {/* Local timezone option at top */}
                          {localTz && localValue && (
                            <>
                              <SelectItem
                                value={localValue}
                                className="font-mono bg-blue-50 hover:bg-blue-100"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-blue-500" />
                                    <span>Local Time ({localDisplayName ?? localTz})</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground pl-6">
                                    Detected from your device
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectSeparator />
                            </>
                          )}
                          {/* Common timezones */}
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz} className="font-mono">
                              {formatTimezoneDisplay(tz)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <ScheduleSummaryCard
                cronExpression={effectiveCron}
                timezone={parsedTz}
              />
            </section>
          </div>
        </div>

        {/* RIGHT PANEL - Prompt Editor */}
        <div className="lg:col-span-7 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-6 md:p-8 flex-1 flex flex-col space-y-6">
            {/* Section 3: Agent Instructions */}
            <section className="flex-1 flex flex-col space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SectionHeader number={3} title={t("sections.instructions")} />
                <VariableChips onInsert={handleVariableInsert} />
              </div>

              <div className="flex-1 min-h-[300px]">
                <PromptEditor
                  ref={promptEditorRef}
                  value={prompt}
                  onChange={setPrompt}
                  placeholder={t("placeholders.prompt")}
                />
              </div>
            </section>

            {/* Additional Settings */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-terminal-cream/50 rounded-lg border border-terminal-border">
              <div className="space-y-2">
                <Label className="text-xs text-terminal-muted uppercase tracking-wider">
                  {t("fields.priority")}
                </Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="font-mono">{t("priority.low")}</SelectItem>
                    <SelectItem value="normal" className="font-mono">{t("priority.normal")}</SelectItem>
                    <SelectItem value="high" className="font-mono">{t("priority.high")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-terminal-muted uppercase tracking-wider">
                  {t("fields.maxRetries")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 md:px-8 py-4 border-t border-terminal-border bg-terminal-cream/50 flex items-center justify-between shrink-0">
        <Button type="button" variant="ghost" disabled={isSubmitting} className="hidden sm:flex font-mono">
          <Save className="w-4 h-4 mr-2" />
          {t("saveDraft")}
        </Button>

        <div className="flex items-center gap-3 ml-auto">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="font-mono"
          >
            <X className="w-4 h-4 mr-2" />
            {tc("cancel")}
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || !name.trim() || !prompt.trim()}
            className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarClock className="w-4 h-4" />
            )}
            {isEditing ? t("updateSchedule") : t("createSchedule")}
          </Button>
        </div>
      </div>
    </form>
  );
}

// Helper component for section headers
function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded bg-terminal-green/10 border border-terminal-green/20 flex items-center justify-center text-terminal-green text-xs font-bold font-mono">
        {number}
      </span>
      <h3 className="text-sm font-semibold text-terminal-dark">{title}</h3>
    </div>
  );
}
