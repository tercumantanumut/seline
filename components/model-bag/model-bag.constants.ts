/**
 * Model Bag Constants
 *
 * Visual identity for providers and roles used throughout the bag UI.
 */

import type { LLMProvider, ModelRole } from "./model-bag.types";

/** Visual theme per provider */
export const PROVIDER_THEME: Record<
  LLMProvider,
  {
    accentColor: string;
    bgColor: string;
    badgeColor: string;
    iconEmoji: string;
    authType: "api-key" | "oauth" | "local";
  }
> = {
  anthropic: {
    accentColor: "border-amber-500",
    bgColor: "bg-amber-500/5",
    badgeColor: "bg-amber-500/20",
    iconEmoji: "🟤",
    authType: "api-key",
  },
  openrouter: {
    accentColor: "border-blue-500",
    bgColor: "bg-blue-500/5",
    badgeColor: "bg-blue-500/20",
    iconEmoji: "🔵",
    authType: "api-key",
  },
  antigravity: {
    accentColor: "border-purple-500",
    bgColor: "bg-purple-500/5",
    badgeColor: "bg-purple-500/20",
    iconEmoji: "🟣",
    authType: "oauth",
  },
  codex: {
    accentColor: "border-green-500",
    bgColor: "bg-green-500/5",
    badgeColor: "bg-green-500/20",
    iconEmoji: "🟢",
    authType: "oauth",
  },
  claudecode: {
    accentColor: "border-orange-500",
    bgColor: "bg-orange-500/5",
    badgeColor: "bg-orange-500/20",
    iconEmoji: "🟠",
    authType: "oauth",
  },
  kimi: {
    accentColor: "border-cyan-500",
    bgColor: "bg-cyan-500/5",
    badgeColor: "bg-cyan-500/20",
    iconEmoji: "🔷",
    authType: "api-key",
  },
  ollama: {
    accentColor: "border-gray-500",
    bgColor: "bg-gray-500/5",
    badgeColor: "bg-gray-500/20",
    iconEmoji: "⚪",
    authType: "local",
  },
};

/** Display names for providers */
export const PROVIDER_DISPLAY_NAMES: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  antigravity: "Antigravity",
  codex: "OpenAI Codex",
  claudecode: "Claude Code",
  kimi: "Moonshot Kimi",
  ollama: "Ollama",
};

/** Role display metadata */
export const ROLE_THEME: Record<
  ModelRole,
  {
    label: string;
    description: string;
    iconEmoji: string;
    color: string;
  }
> = {
  chat: {
    label: "Chat",
    description: "Primary conversation model",
    iconEmoji: "💬",
    color: "text-terminal-green",
  },
  research: {
    label: "Research",
    description: "Deep research & analysis",
    iconEmoji: "🔬",
    color: "text-blue-400",
  },
  vision: {
    label: "Vision",
    description: "Image analysis & description",
    iconEmoji: "👁️",
    color: "text-purple-400",
  },
  utility: {
    label: "Utility",
    description: "Background tasks & compaction",
    iconEmoji: "⚡",
    color: "text-yellow-400",
  },
};
