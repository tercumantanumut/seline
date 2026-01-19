"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2, Globe } from "lucide-react";
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
import { CronBuilder } from "./cron-builder";
import { useLocalTimezone, parseTimezoneValue, formatTimezoneDisplay } from "@/lib/hooks/use-local-timezone";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";

interface ScheduleFormProps {
  characterId: string;
  schedule?: Partial<ScheduledTask>;
  onSubmit: (data: Partial<ScheduledTask>) => Promise<void>;
  onCancel: () => void;
}

export function ScheduleForm({
  characterId,
  schedule,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const t = useTranslations("schedules.form");
  const tc = useTranslations("common");
  const isEditing = !!schedule?.id;
  const { timezone: localTz, displayName: localDisplayName, localValue } = useLocalTimezone();

  const [name, setName] = useState(schedule?.name || "");
  const [description, setDescription] = useState(schedule?.description || "");
  const [scheduleType, setScheduleType] = useState<"cron" | "interval" | "once">(
    (schedule?.scheduleType as "cron" | "interval" | "once") || "cron"
  );
  const [cronExpression, setCronExpression] = useState(schedule?.cronExpression || "0 9 * * *");
  const [intervalMinutes, setIntervalMinutes] = useState(schedule?.intervalMinutes || 60);
  const [scheduledAt, setScheduledAt] = useState(schedule?.scheduledAt || "");
  // Default to local timezone if not editing, otherwise use existing value
  const [timezone, setTimezone] = useState(
    schedule?.timezone || (localValue ?? "UTC")
  );
  const [initialPrompt, setInitialPrompt] = useState(schedule?.initialPrompt || "");
  const [priority, setPriority] = useState<"high" | "normal" | "low">(
    (schedule?.priority as "high" | "normal" | "low") || "normal"
  );
  const [maxRetries, setMaxRetries] = useState(schedule?.maxRetries ?? 3);
  const [timeoutMs, setTimeoutMs] = useState(schedule?.timeoutMs ?? 300000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if current selection is a local timezone
  const isLocalTimezone = timezone.startsWith("local::");
  const { timezone: parsedTz } = parseTimezoneValue(timezone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !initialPrompt.trim()) {
      setError(t("validation.required"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduleType,
        cronExpression: scheduleType === "cron" ? cronExpression : undefined,
        intervalMinutes: scheduleType === "interval" ? intervalMinutes : undefined,
        scheduledAt: scheduleType === "once" ? scheduledAt : undefined,
        timezone,
        initialPrompt: initialPrompt.trim(),
        priority,
        maxRetries,
        timeoutMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("validation.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const timezones = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Europe/London",
    "Europe/Paris",
    "Europe/Istanbul",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-terminal-green/30 bg-terminal-green/5 p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold font-mono text-terminal-dark">
          {isEditing ? t("editTitle") : t("createTitle")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-dark"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm font-mono">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label className="font-mono text-sm">{t("name")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="font-mono"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label className="font-mono text-sm">{t("description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            className="font-mono"
          />
        </div>

        {/* Schedule Type */}
        <div className="space-y-2">
          <Label className="font-mono text-sm">{t("scheduleType")}</Label>
          <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as typeof scheduleType)}>
            <SelectTrigger className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cron" className="font-mono">{t("types.cron")}</SelectItem>
              <SelectItem value="interval" className="font-mono">{t("types.interval")}</SelectItem>
              <SelectItem value="once" className="font-mono">{t("types.once")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cron Expression */}
        {scheduleType === "cron" && (
          <CronBuilder value={cronExpression} onChange={setCronExpression} />
        )}

        {/* Interval Minutes */}
        {scheduleType === "interval" && (
          <div className="space-y-2">
            <Label className="font-mono text-sm">{t("intervalMinutes")}</Label>
            <Input
              type="number"
              min={1}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 60)}
              className="font-mono"
            />
          </div>
        )}

        {/* Scheduled At */}
        {scheduleType === "once" && (
          <div className="space-y-2">
            <Label className="font-mono text-sm">{t("scheduledAt")}</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="font-mono"
            />
          </div>
        )}

        {/* Timezone */}
        <div className="space-y-2">
          <Label className="font-mono text-sm">{t("timezone")}</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="font-mono">
              <div className="flex items-center gap-2">
                {isLocalTimezone && <Globe className="h-4 w-4 text-blue-500" />}
                <SelectValue>
                  {isLocalTimezone
                    ? t("timezoneLocal", { timezone: localDisplayName || parsedTz })
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
                        <span>{t("timezoneLocal", { timezone: localDisplayName ?? localTz })}</span>
                      </div>
                      <span className="text-xs text-muted-foreground pl-6">
                        {t("timezoneDetected")}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectSeparator />
                </>
              )}
              {/* Common timezones */}
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz} className="font-mono">
                  {formatTimezoneDisplay(tz)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Timezone note */}
          {isLocalTimezone ? (
            <p className="text-xs font-mono text-blue-600">{t("timezoneLocalNote")}</p>
          ) : timezone !== "UTC" ? (
            <p className="text-xs font-mono text-terminal-muted">
              {t("timezoneExplicitNote", { timezone: formatTimezoneDisplay(timezone) })}
            </p>
          ) : null}
        </div>

        {/* Initial Prompt */}
        <div className="space-y-2">
          <Label className="font-mono text-sm">{t("prompt")}</Label>
          <Textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder={t("promptPlaceholder")}
            className="min-h-[100px] font-mono text-sm"
          />
          <p className="text-xs font-mono text-terminal-muted">{t("promptHint")}</p>
        </div>

        {/* Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-mono text-sm">{t("priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high" className="font-mono">{t("priorities.high")}</SelectItem>
                <SelectItem value="normal" className="font-mono">{t("priorities.normal")}</SelectItem>
                <SelectItem value="low" className="font-mono">{t("priorities.low")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-sm">{t("maxRetries")}</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
              className="font-mono"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="font-mono"
          >
            {tc("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || !initialPrompt.trim() || isSubmitting}
            className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-terminal-cream font-mono"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? t("save") : t("create")}
          </Button>
        </div>
      </div>
    </form>
  );
}

