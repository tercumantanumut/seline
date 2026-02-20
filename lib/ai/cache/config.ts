/**
 * Prompt Caching Configuration
 *
 * Manages cache settings and determines when caching should be used.
 * Supports Anthropic (direct), OpenRouter (multiple providers), and Kimi.
 */

import { loadSettings } from "@/lib/settings/settings-manager";
import { getConfiguredProvider, type LLMProvider } from "@/lib/ai/providers";
import type { CacheConfig } from "./types";

/**
 * Default cache configuration
 * - Enabled by default for cost savings
 * - 5-minute TTL (most cost-effective for frequent usage)
 * - 1024 min tokens (Anthropic requirement for Sonnet/Opus 4)
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  defaultTtl: "5m",
  minTokensToCache: 1024,
};

/**
 * Get cache configuration from settings
 * Falls back to defaults if not configured
 */
export function getCacheConfig(): CacheConfig {
  try {
    const settings = loadSettings();

    return {
      enabled: settings.promptCachingEnabled ?? DEFAULT_CACHE_CONFIG.enabled,
      defaultTtl: (settings.promptCachingTtl as "5m" | "1h") ?? DEFAULT_CACHE_CONFIG.defaultTtl,
      minTokensToCache: DEFAULT_CACHE_CONFIG.minTokensToCache,
    };
  } catch (error) {
    console.warn("[CACHE CONFIG] Failed to load settings, using defaults:", error);
    return DEFAULT_CACHE_CONFIG;
  }
}

/**
 * Check if caching should be used for the resolved provider.
 * Optionally accepts a provider override (useful for session-level model routing).
 *
 * Supported providers:
 * - Anthropic: Requires cache_control breakpoints
 * - OpenRouter: Supports cache_control for Anthropic & Gemini models,
 *               automatic caching for OpenAI, Grok, Moonshot, Groq, DeepSeek
 * - Kimi: Automatic context caching for kimi-k2.5
 */
export function shouldUseCache(providerOverride?: LLMProvider): boolean {
  try {
    const provider = providerOverride ?? getConfiguredProvider();
    const config = getCacheConfig();

    const supportsCaching = provider === "anthropic" || provider === "openrouter" || provider === "kimi";
    const isCachingEnabled = config.enabled;

    if (isCachingEnabled && !supportsCaching) {
      console.log(
        `[CACHE CONFIG] Caching is enabled but current provider is ${provider}. ` +
        "Prompt caching works with Anthropic, OpenRouter, and Kimi."
      );
    }

    return isCachingEnabled && supportsCaching;
  } catch (error) {
    console.warn("[CACHE CONFIG] Failed to determine if caching should be used:", error);
    return false;
  }
}

/**
 * Get minimum tokens required for caching based on model
 *
 * Anthropic models:
 * - Opus 4.6: 4096 tokens
 * - Haiku 4.5: 4096 tokens
 * - Haiku 3.5 / Haiku 3: 2048 tokens
 * - Opus 4.1 / Opus 4 / Sonnet 4.5 / Sonnet 4 / Sonnet 3.7: 1024 tokens
 *
 * OpenRouter providers:
 * - OpenAI: 1024 tokens
 * - Gemini 2.5 Flash: 2048 tokens (via OpenRouter)
 * - Gemini 2.5 Pro: 4096 tokens (via OpenRouter)
 * - Other providers: automatic (no minimum)
 */
export function getMinTokensForModel(model: string): number {
  // Anthropic models
  if (model.includes("opus-4-6")) {
    return 4096;
  }
  if (model.includes("haiku-4-5")) {
    return 4096;
  }
  if (model.includes("haiku-3-5")) {
    return 2048;
  }
  if (model.includes("haiku-3")) {
    return 2048;
  }
  if (model.includes("claude")) {
    return 1024;
  }

  // OpenRouter - Gemini models (when routing through OpenRouter)
  if (model.includes("gemini-2.5-pro")) {
    return 4096;
  }
  if (model.includes("gemini-2.5-flash")) {
    return 2048;
  }
  if (model.includes("gemini")) {
    return 4096; // Default for other Gemini models
  }

  // OpenRouter - OpenAI models
  if (model.includes("gpt")) {
    return 1024;
  }

  // Default for other providers (most have automatic caching)
  return 1024;
}
