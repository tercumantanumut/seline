/**
 * Model Bag Utilities
 */

import type { ModelItem, ModelRole } from "./model-bag.types";

/** Generate a visual letter/emoji icon from a model name */
export function getModelIcon(model: ModelItem): string {
  const name = model.name.toLowerCase();
  if (name.includes("opus")) return "◆";
  if (name.includes("sonnet")) return "S";
  if (name.includes("haiku")) return "H";
  if (name.includes("claude")) return "C";
  if (name.includes("gemini")) return "G";
  if (name.includes("gpt") || name.includes("codex")) return "⊕";
  if (name.includes("kimi")) return "K";
  if (name.includes("moonshot")) return "M";
  if (name.includes("llama")) return "🦙";
  if (name.includes("grok")) return "X";
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
      return "⚡ Fast";
    case "slow":
      return "🐢 Slow";
    default:
      return "🔄 Standard";
  }
}

/** Tier label for tooltip */
export function tierLabel(tier: ModelItem["tier"]): string {
  switch (tier) {
    case "flagship":
      return "★ Flagship";
    case "utility":
      return "⚡ Utility";
    case "legacy":
      return "📦 Legacy";
    default:
      return "● Standard";
  }
}
