"use client";

/**
 * ModelBag — Main container component.
 *
 * RPG-inspired "bag of models" inventory UI.
 * Can be mounted in the Settings page (replacing the models section)
 * or as a slide-over panel from the chat sidebar.
 */

import { useModelBag } from "./use-model-bag";
import { ModelBagGrid } from "./model-bag-grid";
import { ModelBagSlot } from "./model-bag-slot";
import { ModelBagProviderFilter } from "./model-bag-provider-filter";
import { ModelBagTooltip } from "./model-bag-tooltip";
import type { ModelRole } from "./model-bag.types";
import { cn } from "@/lib/utils";
import { Loader2Icon, PackageIcon, SearchIcon } from "lucide-react";

interface ModelBagProps {
  className?: string;
  onClose?: () => void;
}

const ROLES: ModelRole[] = ["chat", "research", "vision", "utility"];

export function ModelBag({ className, onClose }: ModelBagProps) {
  const bag = useModelBag();

  if (bag.isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-12", className)}>
        <Loader2Icon className="size-6 animate-spin text-terminal-muted" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-terminal-border bg-terminal-cream/95 p-5 shadow-2xl backdrop-blur-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageIcon className="size-5 text-terminal-green" />
          <h2 className="font-mono text-lg font-bold text-terminal-dark">
            Model Bag
          </h2>
          <span className="rounded-full bg-terminal-green/10 px-2 py-0.5 font-mono text-xs text-terminal-green">
            {bag.models.length} models
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-terminal-muted transition-colors hover:bg-terminal-dark/10 hover:text-terminal-dark"
          >
            ✕
          </button>
        )}
      </div>

      {/* Role Assignment Slots — "equipped items" row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ROLES.map((role) => (
          <ModelBagSlot
            key={role}
            role={role}
            assignedModelId={bag.roleAssignments[role]}
            models={bag.models}
            onClear={() => bag.assignModelToRole("", role)}
            isSaving={bag.isSaving}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-terminal-border" />
        <span className="font-mono text-xs text-terminal-muted">INVENTORY</span>
        <div className="h-px flex-1 bg-terminal-border" />
      </div>

      {/* Provider Filter + Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <ModelBagProviderFilter
          providers={bag.providers}
          activeFilter={bag.filterProvider}
          onFilterChange={bag.setFilterProvider}
          onProviderSwitch={bag.switchProvider}
        />
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-terminal-muted" />
          <input
            type="text"
            value={bag.searchQuery}
            onChange={(e) => bag.setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full rounded-lg border border-terminal-border bg-white/50 py-1.5 pl-8 pr-3 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
        </div>
      </div>

      {/* The Grid — RPG bag inventory */}
      <ModelBagGrid
        models={bag.filteredModels}
        roleAssignments={bag.roleAssignments}
        onAssign={bag.assignModelToRole}
        onHover={bag.setHoveredModel}
        hoveredModel={bag.hoveredModel}
        activeProvider={bag.activeProvider}
        isSaving={bag.isSaving}
      />

      {/* Tooltip */}
      <ModelBagTooltip
        model={bag.models.find((m) => m.id === bag.hoveredModel) ?? null}
      />
    </div>
  );
}
