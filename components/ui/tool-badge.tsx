"use client";

import { cn } from "@/lib/utils";
import { getToolIcon, type ToolIconConfig } from "./tool-icon-map";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

/** Tool ID to category color mapping */
const TOOL_COLORS: Record<string, string> = {
  knowledge: "bg-blue-100 text-blue-700 border-blue-200",
  search: "bg-amber-100 text-amber-700 border-amber-200",
  "image-generation": "bg-purple-100 text-purple-700 border-purple-200",
  "image-editing": "bg-pink-100 text-pink-700 border-pink-200",
  "video-generation": "bg-rose-100 text-rose-700 border-rose-200",
  analysis: "bg-cyan-100 text-cyan-700 border-cyan-200",
  utility: "bg-slate-100 text-slate-700 border-slate-200",
  "custom-comfyui": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

/** Tool ID to category mapping */
const TOOL_CATEGORIES: Record<string, string> = {
  docsSearch: "knowledge",
  vectorSearch: "knowledge",
  readFile: "knowledge",
  webSearch: "search",
  firecrawlCrawl: "search",
  generateImageFlux2: "image-generation",
  generateImageWan22: "image-generation",
  generateImageFlux2Klein4B: "image-generation",
  editImageFlux2Klein4B: "image-editing",
  referenceImageFlux2Klein4B: "image-generation",
  generateImageFlux2Klein9B: "image-generation",
  editImageFlux2Klein9B: "image-editing",
  referenceImageFlux2Klein9B: "image-generation",
  editRoomImage: "image-editing",
  editImage: "image-editing",
  generateVideoWan22: "video-generation",
  generatePixelVideoWan22: "video-generation",
  assembleVideo: "video-generation",
  describeImage: "analysis",
  showProductImages: "utility",
  executeCommand: "utility",
  calculator: "utility",
};

function resolveToolCategory(toolId: string): string {
  if (TOOL_CATEGORIES[toolId]) return TOOL_CATEGORIES[toolId];
  if (toolId.startsWith("customComfyUI_")) return "custom-comfyui";
  return "utility";
}

interface ToolBadgeProps {
  toolId: string;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  label?: string;
  className?: string;
}

/**
 * ToolBadge - Displays a tool icon with optional label
 * Color-coded by tool category
 * Now using Phosphor Icons with weight-based visual hierarchy
 */
export function ToolBadge({
  toolId,
  size = "sm",
  showLabel = false,
  label,
  className,
}: ToolBadgeProps) {
  const iconConfig = getToolIcon(toolId);
  const Icon = iconConfig.icon;
  const category = resolveToolCategory(toolId);
  const colorClass = TOOL_COLORS[category];

  const sizeClasses = {
    xs: "w-5 h-5 p-0.5",
    sm: "w-6 h-6 p-1",
    md: "w-8 h-8 p-1.5",
  };

  const iconSizes = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  if (showLabel) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono transition-all duration-200",
          colorClass,
          className
        )}
      >
        <Icon className={iconSizes[size]} weight={iconConfig.weight} />
        <span>{label || toolId}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full border transition-all duration-200",
        sizeClasses[size],
        colorClass,
        className
      )}
      title={label || toolId}
    >
      <Icon className={iconSizes[size]} weight={iconConfig.weight} />
    </div>
  );
}

/** Get icon configuration for a tool ID */
export function getToolIconConfig(toolId: string): ToolIconConfig {
  return getToolIcon(toolId);
}

/** Get top N tools from a list, prioritizing variety */
export function getTopTools(tools: string[], count: number = 3): string[] {
  const categories = new Set<string>();
  const result: string[] = [];

  // First pass: get one from each category
  for (const tool of tools) {
    const category = TOOL_CATEGORIES[tool];
    if (category && !categories.has(category) && result.length < count) {
      categories.add(category);
      result.push(tool);
    }
  }

  // Second pass: fill remaining slots
  for (const tool of tools) {
    if (!result.includes(tool) && result.length < count) {
      result.push(tool);
    }
  }

  return result;
}

