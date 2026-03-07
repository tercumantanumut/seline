/**
 * Model Bag Utilities
 */

import type { ModelItem, ModelRole } from "./model-bag.types";

/** First letter of the model name, uppercased */
export function getModelIcon(model: ModelItem): string {
  return model.name.charAt(0).toUpperCase();
}

/**
 * Invert { chatModel: "claude-..." } → { "claude-...": ["chat"] }
 */
export function invertAssignments(
  assignments: Record<string, string>,
): Record<string, ModelRole[]> {
  const keyToRole: Record<string, ModelRole> = {
    chatModel: "chat",
    researchModel: "research",
    visionModel: "vision",
    utilityModel: "utility",
  };
  const result: Record<string, ModelRole[]> = {};
  for (const [key, modelId] of Object.entries(assignments)) {
    if (modelId && keyToRole[key]) {
      (result[modelId] ??= []).push(keyToRole[key]);
    }
  }
  return result;
}

/** Speed label for tooltip */
export function speedLabel(speed?: "fast" | "standard" | "slow"): string {
  switch (speed) {
    case "fast":
      return "Fast";
    case "slow":
      return "Slow";
    default:
      return "Standard";
  }
}

/** Tier label for tooltip */
export function tierLabel(tier: ModelItem["tier"]): string {
  switch (tier) {
    case "flagship":
      return "Flagship";
    case "utility":
      return "Utility";
    case "legacy":
      return "Legacy";
    default:
      return "Standard";
  }
}
