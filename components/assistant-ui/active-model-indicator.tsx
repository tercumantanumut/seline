"use client";

import type { FC } from "react";
import { cn } from "@/lib/utils";
import { CpuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ContextWindowStatus } from "@/lib/hooks/use-context-status";

/** Provider accent colors for the badge (matches model-bag.constants.ts) */
const PROVIDER_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  anthropic: { bg: "bg-amber-500/10", text: "text-amber-700", border: "border-amber-500/30" },
  openrouter: { bg: "bg-blue-500/10", text: "text-blue-700", border: "border-blue-500/30" },
  antigravity: { bg: "bg-purple-500/10", text: "text-purple-700", border: "border-purple-500/30" },
  codex: { bg: "bg-green-500/10", text: "text-green-700", border: "border-green-500/30" },
  claudecode: { bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-500/30" },
  kimi: { bg: "bg-cyan-500/10", text: "text-cyan-700", border: "border-cyan-500/30" },
  ollama: { bg: "bg-gray-500/10", text: "text-gray-700", border: "border-gray-500/30" },
};

/** Provider display names */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  antigravity: "Antigravity",
  codex: "Codex",
  claudecode: "Claude Code",
  kimi: "Kimi",
  ollama: "Ollama",
};

/**
 * Derive a short, human-friendly model label from the full model ID.
 *
 * Examples:
 *   "moonshotai/kimi-k2.5" → "Kimi K2.5"
 *   "claude-sonnet-4-5-20250929" → "Sonnet 4.5"
 *   "gpt-5.1-codex" → "GPT 5.1 Codex"
 *   "anthropic/claude-opus-4" → "Claude Opus 4"
 */
function formatModelName(modelId: string): string {
  // Strip provider prefix (e.g., "moonshotai/" or "anthropic/")
  const stripped = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  // Common model name patterns — simple string replacements
  const simplePatterns: [RegExp, string][] = [
    [/^kimi-k(\d[\d.]*)/i, "Kimi K$1"],
    [/^claude-opus-(\d[\d.-]*)/i, "Opus $1"],
    [/^claude-sonnet-(\d+)-(\d+)/i, "Sonnet $1.$2"],
    [/^claude-haiku-(\d+)-(\d+)/i, "Haiku $1.$2"],
    [/^claude-(\d[\d.]*)/i, "Claude $1"],
  ];

  for (const [regex, replacement] of simplePatterns) {
    if (regex.test(stripped)) {
      return stripped.replace(regex, replacement);
    }
  }

  // GPT / Gemini patterns with function replacers
  const gptMatch = stripped.match(/^gpt-(\d[\d.]*)-?(.*)/i);
  if (gptMatch) {
    const [, ver, suffix] = gptMatch;
    return `GPT ${ver}${suffix ? ` ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}` : ""}`;
  }
  const geminiMatch = stripped.match(/^gemini-(\d[\d.]*)-?(.*)/i);
  if (geminiMatch) {
    const [, ver, suffix] = geminiMatch;
    return `Gemini ${ver}${suffix ? ` ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}` : ""}`;
  }

  // Fallback: title-case the stripped ID
  return stripped
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

interface ActiveModelIndicatorProps {
  status: ContextWindowStatus | null;
}

/**
 * Compact badge showing the currently active model + provider.
 * Displayed alongside the context window indicator below the composer.
 *
 * Reads model info from the context-status API response which already
 * resolves session overrides via session-model-resolver.ts.
 */
export const ActiveModelIndicator: FC<ActiveModelIndicatorProps> = ({ status }) => {
  const t = useTranslations("modelBag");
  if (!status?.model) return null;

  const { id: modelId, provider } = status.model;
  const colors = PROVIDER_BADGE_COLORS[provider] ?? PROVIDER_BADGE_COLORS.anthropic;
  const providerName = PROVIDER_NAMES[provider] ?? provider;
  const modelName = formatModelName(modelId);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border",
            "text-[10px] font-mono cursor-default select-none transition-colors",
            colors.bg,
            colors.text,
            colors.border,
          )}
        >
          <CpuIcon className="size-2.5 shrink-0" />
          <span className="truncate max-w-[120px]">{modelName}</span>
          <span className="text-[9px] opacity-60">·</span>
          <span className="text-[9px] opacity-60 truncate max-w-[60px]">{providerName}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-terminal-dark text-terminal-cream font-mono text-xs max-w-xs"
      >
        <p className="font-bold">{modelName}</p>
        <p className="text-terminal-cream/70 mt-0.5">{t("providerLabel")} {providerName}</p>
        <p className="text-terminal-cream/50 mt-0.5 text-[10px] break-all">ID: {modelId}</p>
      </TooltipContent>
    </Tooltip>
  );
};
