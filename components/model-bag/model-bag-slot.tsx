"use client";

import { cn } from "@/lib/utils";
import { ROLE_THEME, PROVIDER_THEME } from "./model-bag.constants";
import type { ModelRole, ModelItem } from "./model-bag.types";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface ModelBagSlotProps {
  role: ModelRole;
  assignedModelId: string;
  models: ModelItem[];
  onClear: () => void;
  isSaving: boolean;
}

export function ModelBagSlot({
  role,
  assignedModelId,
  models,
  onClear,
  isSaving,
}: ModelBagSlotProps) {
  const t = useTranslations("modelBag");
  const roleInfo = ROLE_THEME[role];
  const assignedModel = models.find((m) => m.id === assignedModelId);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-2 transition-all",
        assignedModel
          ? "border-terminal-green/40 bg-terminal-green/5"
          : "border-terminal-border/50 bg-white/30",
      )}
    >
      {/* Role label */}
      <span className={cn("font-mono text-[10px] font-bold", roleInfo.color)}>
        {roleInfo.iconEmoji} {roleInfo.label}
      </span>

      {/* Assigned model or empty */}
      {assignedModel ? (
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded px-1 py-0.5 font-mono text-[9px]",
              PROVIDER_THEME[assignedModel.provider].badgeColor,
            )}
          >
            {PROVIDER_THEME[assignedModel.provider].iconEmoji}
          </span>
          <span className="max-w-[80px] truncate font-mono text-[10px] text-terminal-dark">
            {assignedModel.name}
          </span>
          <button
            onClick={onClear}
            disabled={isSaving}
            className="ml-0.5 rounded-full p-0.5 text-terminal-muted hover:bg-red-100 hover:text-red-500 disabled:opacity-50"
            title={t("clearOverride")}
            aria-label={t("clearOverride")}
          >
            <XIcon className="size-2.5" />
          </button>
        </div>
      ) : assignedModelId ? (
        // Custom model ID (openrouter/ollama)
        <div className="flex items-center gap-1">
          <span className="max-w-[100px] truncate font-mono text-[9px] text-terminal-dark">
            {assignedModelId}
          </span>
          <button
            onClick={onClear}
            disabled={isSaving}
            className="ml-0.5 rounded-full p-0.5 text-terminal-muted hover:bg-red-100 hover:text-red-500 disabled:opacity-50"
          >
            <XIcon className="size-2.5" />
          </button>
        </div>
      ) : (
        <span className="font-mono text-[9px] italic text-terminal-muted">
          {t("usingDefault")}
        </span>
      )}
    </div>
  );
}
