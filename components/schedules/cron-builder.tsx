"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

type CronPreset = "custom" | "every_minute" | "every_hour" | "daily" | "weekly" | "monthly";

const PRESETS: Record<CronPreset, string> = {
  custom: "",
  every_minute: "* * * * *",
  every_hour: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
};

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const t = useTranslations("schedules.cron");
  const [preset, setPreset] = useState<CronPreset>("custom");
  const [parts, setParts] = useState<string[]>(["0", "9", "*", "*", "*"]);

  // Parse initial value
  useEffect(() => {
    const cronParts = value.split(" ");
    if (cronParts.length === 5) {
      setParts(cronParts);
      // Check if it matches a preset
      const matchedPreset = Object.entries(PRESETS).find(
        ([_, expr]) => expr === value
      );
      if (matchedPreset) {
        setPreset(matchedPreset[0] as CronPreset);
      } else {
        setPreset("custom");
      }
    }
  }, [value]);

  const handlePresetChange = (newPreset: CronPreset) => {
    setPreset(newPreset);
    if (newPreset !== "custom" && PRESETS[newPreset]) {
      const newParts = PRESETS[newPreset].split(" ");
      setParts(newParts);
      onChange(PRESETS[newPreset]);
    }
  };

  const handlePartChange = (index: number, newValue: string) => {
    const newParts = [...parts];
    newParts[index] = newValue;
    setParts(newParts);
    setPreset("custom");
    onChange(newParts.join(" "));
  };

  const getHumanReadable = (): string => {
    try {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      if (minute === "*" && hour === "*") return t("readable.everyMinute");
      if (minute === "0" && hour === "*") return t("readable.everyHour");
      if (minute === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
        return t("readable.dailyAt", { hour });
      }
      if (minute === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
        const dayKeys = ["days.sun", "days.mon", "days.tue", "days.wed", "days.thu", "days.fri", "days.sat"] as const;
        const dayKey = dayKeys[parseInt(dayOfWeek)];
        const day = dayKey ? t(dayKey) : dayOfWeek;
        return t("readable.weeklyAt", { day, hour });
      }
      if (minute === "0" && dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
        return t("readable.monthlyAt", { day: dayOfMonth, hour });
      }
      return t("readable.custom");
    } catch {
      return t("readable.custom");
    }
  };

  return (
    <div className="space-y-3">
      <Label className="font-mono text-sm">{t("label")}</Label>
      
      {/* Preset Selector */}
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as CronPreset)}>
        <SelectTrigger className="font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="every_minute" className="font-mono">{t("presets.everyMinute")}</SelectItem>
          <SelectItem value="every_hour" className="font-mono">{t("presets.everyHour")}</SelectItem>
          <SelectItem value="daily" className="font-mono">{t("presets.daily")}</SelectItem>
          <SelectItem value="weekly" className="font-mono">{t("presets.weekly")}</SelectItem>
          <SelectItem value="monthly" className="font-mono">{t("presets.monthly")}</SelectItem>
          <SelectItem value="custom" className="font-mono">{t("presets.custom")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Cron Parts */}
      {preset === "custom" && (
        <div className="grid grid-cols-5 gap-2">
          {["minute", "hour", "dayOfMonth", "month", "dayOfWeek"].map((label, index) => (
            <div key={label} className="space-y-1">
              <label className="text-xs font-mono text-terminal-muted">
                {t(`parts.${label}`)}
              </label>
              <Input
                value={parts[index]}
                onChange={(e) => handlePartChange(index, e.target.value)}
                className="font-mono text-center text-sm"
                placeholder="*"
              />
            </div>
          ))}
        </div>
      )}

      {/* Human Readable Description */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-terminal-muted">{t("expression")}:</span>
        <code className="px-2 py-1 bg-terminal-dark/10 rounded font-mono text-terminal-dark">
          {parts.join(" ")}
        </code>
      </div>
      <p className="text-sm font-mono text-terminal-green">{getHumanReadable()}</p>
    </div>
  );
}

