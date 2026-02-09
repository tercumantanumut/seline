"use client";

import { cn } from "@/lib/utils";
import { PROVIDER_THEME } from "./model-bag.constants";
import type { ProviderStatus, LLMProvider } from "./model-bag.types";

interface ModelBagProviderFilterProps {
  providers: ProviderStatus[];
  activeFilter: LLMProvider | "all";
  onFilterChange: (provider: LLMProvider | "all") => void;
  onProviderSwitch: (provider: LLMProvider) => void;
}

export function ModelBagProviderFilter({
  providers,
  activeFilter,
  onFilterChange,
  onProviderSwitch,
}: ModelBagProviderFilterProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {/* "All" pill */}
      <button
        onClick={() => onFilterChange("all")}
        className={cn(
          "rounded-full px-2.5 py-1 font-mono text-[10px] font-medium transition-all",
          activeFilter === "all"
            ? "bg-terminal-dark text-terminal-cream"
            : "bg-white/50 text-terminal-muted hover:bg-white/80",
        )}
      >
        All
      </button>

      {/* Provider pills */}
      {providers.map((p) => {
        const theme = PROVIDER_THEME[p.id];
        const isFiltered = activeFilter === p.id;

        return (
          <button
            key={p.id}
            onClick={() => onFilterChange(isFiltered ? "all" : p.id)}
            onDoubleClick={() => {
              if (p.isAuthenticated && !p.isActive) {
                onProviderSwitch(p.id);
              }
            }}
            title={
              p.isActive
                ? `${p.displayName} (active provider)`
                : p.isAuthenticated
                  ? `${p.displayName} — double-click to switch`
                  : `${p.displayName} — not configured`
            }
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-medium transition-all",
              isFiltered
                ? [theme.accentColor, theme.bgColor, "border"]
                : "bg-white/50 text-terminal-muted hover:bg-white/80",
              !p.isAuthenticated && "opacity-50",
            )}
          >
            <span className="text-[9px]">{p.iconEmoji}</span>
            <span className="hidden sm:inline">{p.displayName}</span>
            {p.isActive && (
              <span className="size-1.5 rounded-full bg-terminal-green" />
            )}
            {p.modelCount > 0 && (
              <span className="text-[8px] text-terminal-muted">
                {p.modelCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
