"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PROVIDER_THEME, ROLE_THEME } from "./model-bag.constants";
import { speedLabel, tierLabel } from "./model-bag.utils";
import type { ModelItem } from "./model-bag.types";

interface ModelBagTooltipProps {
  model: ModelItem | null;
}

export function ModelBagTooltip({ model }: ModelBagTooltipProps) {
  const t = useTranslations("modelBag.tooltip");
  if (!model) return null;

  const theme = PROVIDER_THEME[model.provider];
  const caps = model.capabilities;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3 shadow-lg",
        theme.accentColor,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-bold text-terminal-dark">
            {model.name}
          </p>
          <p className="font-mono text-[10px] text-terminal-muted">
            {model.providerDisplayName} · {model.id}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold",
            theme.badgeColor,
          )}
        >
          {tierLabel(model.tier)}
        </span>
      </div>

      {/* Capabilities */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {caps.contextWindow && (
          <Badge label={`📐 ${caps.contextWindow}`} />
        )}
        <Badge label={speedLabel(caps.speed)} />
        {caps.vision && <Badge label={`👁️ ${t("vision")}`} />}
        {caps.thinking && <Badge label={`🧠 ${t("thinking")}`} />}
        {caps.toolUse && <Badge label={`🔧 ${t("tools")}`} />}
      </div>

      {/* Assigned roles */}
      {model.assignedRoles.length > 0 && (
        <div className="mt-2 flex gap-1">
          <span className="font-mono text-[9px] text-terminal-muted">
            {t("assigned")}
          </span>
          {model.assignedRoles.map((role) => (
            <span
              key={role}
              className="rounded bg-terminal-green/15 px-1 font-mono text-[9px] font-bold text-terminal-green"
            >
              {ROLE_THEME[role].iconEmoji} {ROLE_THEME[role].label}
            </span>
          ))}
        </div>
      )}

      {!model.isAvailable && (
        <p className="mt-2 font-mono text-[10px] text-red-500">
          ⚠ {t("notConfigured")}
        </p>
      )}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded bg-terminal-dark/5 px-1.5 py-0.5 font-mono text-[9px] text-terminal-dark/70">
      {label}
    </span>
  );
}
