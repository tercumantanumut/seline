"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PROVIDER_THEME, ROLE_THEME } from "./model-bag.constants";
import { getModelIcon } from "./model-bag.utils";
import type { ModelItem, ModelRole } from "./model-bag.types";

interface ModelBagItemProps {
  model: ModelItem;
  isHovered: boolean;
  isActiveProvider: boolean;
  onHover: (id: string | null) => void;
  onAssign: (modelId: string, role: ModelRole) => void;
  isSaving: boolean;
}

const ALL_ROLES: ModelRole[] = ["chat", "research", "vision", "utility"];

export function ModelBagItem({
  model,
  isHovered,
  isActiveProvider,
  onHover,
  onAssign,
  isSaving,
}: ModelBagItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const theme = PROVIDER_THEME[model.provider];
  const hasRoles = model.assignedRoles.length > 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 transition-all duration-150",
        "cursor-pointer select-none",
        "border-transparent bg-white/60 backdrop-blur-sm",
        isHovered && [theme.accentColor, theme.bgColor, "shadow-md scale-[1.03]"],
        isActiveProvider && "ring-1 ring-terminal-green/30",
        !model.isAvailable && "opacity-40 grayscale cursor-not-allowed",
        hasRoles && "border-terminal-green/40 bg-terminal-green/5",
      )}
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => { onHover(null); setShowMenu(false); }}
      onClick={() => {
        if (!model.isAvailable || isSaving) return;
        setShowMenu(!showMenu);
      }}
    >
      {/* Provider badge */}
      <span
        className={cn(
          "absolute -right-1 -top-1 rounded-full px-1 py-0.5 font-mono text-[9px] font-bold leading-none",
          theme.badgeColor,
          "text-terminal-dark",
        )}
      >
        {theme.iconEmoji}
      </span>

      {/* Flagship star */}
      {model.tier === "flagship" && (
        <div className="absolute -left-0.5 -top-0.5 size-2 rounded-full bg-yellow-400 shadow-sm shadow-yellow-400/50" />
      )}

      {/* Default badge */}
      {model.isDefault && (
        <div className="absolute left-0 top-0 rounded-br-md rounded-tl-md bg-terminal-green/20 px-1 font-mono text-[7px] font-bold text-terminal-green">
          DEF
        </div>
      )}

      {/* Model icon — RPG item slot aesthetic */}
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-md",
          "bg-gradient-to-br from-white/80 to-transparent",
          "border border-terminal-border/50",
          "font-mono text-lg font-bold text-terminal-dark/60",
        )}
      >
        {getModelIcon(model)}
      </div>

      {/* Model name */}
      <span className="w-full truncate text-center font-mono text-[10px] font-medium leading-tight text-terminal-dark">
        {model.name}
      </span>

      {/* Assigned role badges */}
      {hasRoles && (
        <div className="flex gap-0.5">
          {model.assignedRoles.map((role) => (
            <span
              key={role}
              className="rounded bg-terminal-green/20 px-1 font-mono text-[8px] font-bold text-terminal-green"
              title={ROLE_THEME[role].label}
            >
              {ROLE_THEME[role].iconEmoji}
            </span>
          ))}
        </div>
      )}

      {/* Click menu: assign to role */}
      {showMenu && model.isAvailable && (
        <div
          className="absolute -bottom-1 left-1/2 z-50 -translate-x-1/2 translate-y-full rounded-lg border border-terminal-border bg-white p-1.5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1 px-1 font-mono text-[9px] font-bold text-terminal-muted">
            ASSIGN TO:
          </p>
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              onClick={(e) => {
                e.stopPropagation();
                onAssign(model.id, role);
                setShowMenu(false);
              }}
              disabled={isSaving}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 font-mono text-[10px] transition-colors",
                "hover:bg-terminal-green/10 hover:text-terminal-green",
                model.assignedRoles.includes(role) &&
                  "bg-terminal-green/10 font-bold text-terminal-green",
              )}
            >
              <span>{ROLE_THEME[role].iconEmoji}</span>
              <span>{ROLE_THEME[role].label}</span>
              {model.assignedRoles.includes(role) && (
                <span className="ml-auto">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
