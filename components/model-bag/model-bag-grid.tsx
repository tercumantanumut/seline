"use client";

import { useState } from "react";
import { ModelBagItem } from "./model-bag-item";
import type { ModelItem, ModelRole, LLMProvider } from "./model-bag.types";
import { cn } from "@/lib/utils";

interface ModelBagGridProps {
  models: ModelItem[];
  roleAssignments: Record<ModelRole, string>;
  onAssign: (modelId: string, role: ModelRole) => void;
  onHover: (modelId: string | null) => void;
  hoveredModel: string | null;
  activeProvider: LLMProvider;
  isSaving: boolean;
}

export function ModelBagGrid({
  models,
  roleAssignments,
  onAssign,
  onHover,
  hoveredModel,
  activeProvider,
  isSaving,
}: ModelBagGridProps) {
  const [customModelInput, setCustomModelInput] = useState("");

  if (models.length === 0 && activeProvider !== "openrouter" && activeProvider !== "ollama") {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-terminal-border p-8">
        <p className="font-mono text-sm text-terminal-muted">
          No models match your filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* OpenRouter / Ollama custom input */}
      {(activeProvider === "openrouter" || activeProvider === "ollama") && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-terminal-border bg-white/30 p-2">
          <input
            type="text"
            value={customModelInput}
            onChange={(e) => setCustomModelInput(e.target.value)}
            placeholder={
              activeProvider === "openrouter"
                ? "x-ai/grok-4.1-fast"
                : "llama3.1:8b"
            }
            className="flex-1 rounded border border-terminal-border bg-white/50 px-2 py-1 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customModelInput.trim()) {
                // Assign to chat role by default
                onAssign(customModelInput.trim(), "chat");
                setCustomModelInput("");
              }
            }}
          />
          <span className="font-mono text-[9px] text-terminal-muted">
            Enter + ↵
          </span>
        </div>
      )}

      {/* Model grid */}
      {models.length > 0 && (
        <div
          className={cn(
            "grid gap-2 overflow-y-auto rounded-lg border border-terminal-border bg-terminal-dark/5 p-3",
            "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
            "max-h-[360px]",
          )}
        >
          {models.map((model) => (
            <ModelBagItem
              key={model.id}
              model={model}
              isHovered={hoveredModel === model.id}
              isActiveProvider={model.provider === activeProvider}
              onHover={onHover}
              onAssign={onAssign}
              isSaving={isSaving}
            />
          ))}
        </div>
      )}
    </div>
  );
}
