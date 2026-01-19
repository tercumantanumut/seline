/**
 * Schedule Presets
 * 
 * Pre-built schedule templates for common workflows.
 */

export * from "./types";

import type { SchedulePreset, PresetCategory } from "./types";
import { linearSummaryPreset } from "./linear-summary";
import { weeklyDigestPreset } from "./weekly-digest";
import { codeReviewPreset } from "./code-review";
import { dailyStandupPreset } from "./daily-standup";

/**
 * All available presets
 */
export const presets: SchedulePreset[] = [
  linearSummaryPreset,
  weeklyDigestPreset,
  codeReviewPreset,
  dailyStandupPreset,
];

/**
 * Get all presets
 */
export function getAllPresets(): SchedulePreset[] {
  return presets;
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): SchedulePreset | undefined {
  return presets.find((p) => p.id === id);
}

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: PresetCategory): SchedulePreset[] {
  return presets.filter((p) => p.category === category);
}

/**
 * Get all preset categories with counts
 */
export function getPresetCategories(): Array<{ category: PresetCategory; count: number }> {
  const categories = new Map<PresetCategory, number>();
  
  for (const preset of presets) {
    categories.set(preset.category, (categories.get(preset.category) || 0) + 1);
  }
  
  return Array.from(categories.entries()).map(([category, count]) => ({
    category,
    count,
  }));
}

