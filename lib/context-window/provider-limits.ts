/**
 * Context Window Provider Limits
 *
 * Defines context window configurations for all supported LLM providers and models.
 * Parses context window strings from model-catalog.ts and provides threshold configurations.
 *
 * @see docs/CONTEXT_WINDOW_MANAGEMENT_DESIGN.md
 */

import type { LLMProvider } from "@/components/model-bag/model-bag.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextWindowConfig {
  /** Maximum tokens for this model's context window */
  maxTokens: number;
  /** Percentage threshold to trigger warning (e.g., 0.75 = 75%) */
  warningThreshold: number;
  /** Percentage threshold to force compaction (e.g., 0.90 = 90%) */
  criticalThreshold: number;
  /** Percentage threshold that blocks requests (e.g., 0.95 = 95%) */
  hardLimit: number;
  /** Whether this model supports streaming responses */
  supportsStreaming: boolean;
  /** Minimum messages required before compaction is allowed */
  minMessagesForCompaction: number;
  /** Number of recent messages to always keep uncompacted */
  keepRecentMessages: number;
}

// ---------------------------------------------------------------------------
// Context Window Parsing
// ---------------------------------------------------------------------------

/**
 * Parse context window string (e.g., "200K", "1M", "128K") to numeric tokens
 */
export function parseContextWindowString(contextWindow: string): number {
  if (!contextWindow) return 128000; // Default fallback

  const normalized = contextWindow.toUpperCase().trim();

  // Handle "1M" format
  if (normalized.endsWith("M")) {
    const value = parseFloat(normalized.slice(0, -1));
    return value * 1_000_000;
  }

  // Handle "200K" format
  if (normalized.endsWith("K")) {
    const value = parseFloat(normalized.slice(0, -1));
    return value * 1_000;
  }

  // Handle raw numbers
  const parsed = parseInt(normalized, 10);
  return isNaN(parsed) ? 128000 : parsed;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig = {
  maxTokens: 128000, // 128K - conservative default for unknown models
  warningThreshold: 0.75, // 75% - trigger background compaction
  criticalThreshold: 0.90, // 90% - force compaction before request
  hardLimit: 0.95, // 95% - block request, require compaction
  supportsStreaming: true,
  minMessagesForCompaction: 3, // Lowered from 10 to allow sparse long-running sessions
  keepRecentMessages: 6,
};

// ---------------------------------------------------------------------------
// Provider Default Limits
// ---------------------------------------------------------------------------

/**
 * Default context window limits per provider.
 * Used when model-specific limits are not available.
 */
export const PROVIDER_DEFAULT_LIMITS: Record<LLMProvider, number> = {
  anthropic: 200000, // 200K for all Claude models (standard context window per Anthropic docs)
  claudecode: 200000, // 200K for Claude Code (Claude Opus 4.6 = 200K standard)
  antigravity: 200000, // Claude-based models = 200K; Gemini models use model-specific overrides
  openrouter: 128000, // Varies widely, conservative default
  codex: 400000, // GPT-5 models are 400K context
  kimi: 128000, // Kimi K2 models range 128K-256K
  ollama: 32000, // Local models typically have smaller context
};

// ---------------------------------------------------------------------------
// Model-Specific Configurations
// ---------------------------------------------------------------------------

/**
 * Model-specific context window configurations.
 * Overrides defaults for known models with specific limits.
 */
export const MODEL_CONTEXT_CONFIGS: Record<string, Partial<ContextWindowConfig>> = {
  // Anthropic Direct — 200K standard context window per Anthropic docs
  // (1M available only via opt-in beta header "context-1m-2025-08-07")
  "claude-sonnet-4-5-20250929": {
    maxTokens: 200000,
    supportsStreaming: true,
  },
  "claude-haiku-4-5-20251001": {
    maxTokens: 200000,
    supportsStreaming: true,
  },

  // Antigravity (Claude-based) — 200K standard context window
  "claude-sonnet-4-5": {
    maxTokens: 200000,
    supportsStreaming: true,
  },
  "claude-sonnet-4-5-thinking": {
    maxTokens: 200000,
    supportsStreaming: true,
  },
  "claude-opus-4-6-thinking": {
    maxTokens: 200000,
    supportsStreaming: true,
  },

  // Antigravity (Gemini-based) - Large context windows
  "gemini-3-pro-high": {
    maxTokens: 1000000, // 1M tokens
    supportsStreaming: true,
    warningThreshold: 0.80, // Higher threshold for large context
    criticalThreshold: 0.92,
    hardLimit: 0.97,
  },
  "gemini-3-pro-low": {
    maxTokens: 1000000,
    supportsStreaming: true,
    warningThreshold: 0.80,
    criticalThreshold: 0.92,
    hardLimit: 0.97,
  },
  "gemini-3-flash": {
    maxTokens: 1000000,
    supportsStreaming: true,
    warningThreshold: 0.80,
    criticalThreshold: 0.92,
    hardLimit: 0.97,
  },

  // Antigravity (GPT-based)
  "gpt-oss-120b-medium": {
    maxTokens: 128000,
    supportsStreaming: true,
  },

  // Codex (GPT-5 models — all 400K context)
  "gpt-5.3-codex": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.2-codex": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.2": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.1-codex-max": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.1-codex": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.1-codex-mini": {
    maxTokens: 400000,
    supportsStreaming: true,
  },
  "gpt-5.1": {
    maxTokens: 400000,
    supportsStreaming: true,
  },

  // Kimi models
  "kimi-k2.5": {
    maxTokens: 256000,
    supportsStreaming: true,
  },
  "kimi-k2-thinking": {
    maxTokens: 128000,
    supportsStreaming: true,
  },
  "kimi-k2-thinking-turbo": {
    maxTokens: 128000,
    supportsStreaming: true,
  },
  "kimi-k2-turbo-preview": {
    maxTokens: 128000,
    supportsStreaming: true,
  },
  "kimi-k2-0905-preview": {
    maxTokens: 128000,
    supportsStreaming: true,
  },

  // Ollama local models (smaller context windows)
  "llama3.1:8b": {
    maxTokens: 32000,
    supportsStreaming: true,
    warningThreshold: 0.70, // Lower threshold for smaller context
    criticalThreshold: 0.85,
    hardLimit: 0.92,
  },
  "llama3.1:70b": {
    maxTokens: 32000,
    supportsStreaming: true,
    warningThreshold: 0.70,
    criticalThreshold: 0.85,
    hardLimit: 0.92,
  },
  "codellama:34b": {
    maxTokens: 16000,
    supportsStreaming: true,
    warningThreshold: 0.65,
    criticalThreshold: 0.80,
    hardLimit: 0.90,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get context window configuration for a specific model.
 *
 * @param modelId - The model identifier (e.g., "claude-sonnet-4-5-20250929")
 * @param provider - Optional provider for fallback defaults
 * @returns Complete context window configuration
 */
export function getContextWindowConfig(
  modelId: string,
  provider?: LLMProvider
): ContextWindowConfig {
  // Check for model-specific config
  const modelConfig = MODEL_CONTEXT_CONFIGS[modelId];

  if (modelConfig) {
    return {
      ...DEFAULT_CONTEXT_CONFIG,
      ...modelConfig,
    };
  }

  // Fall back to provider default
  if (provider) {
    const providerMaxTokens = PROVIDER_DEFAULT_LIMITS[provider];
    return {
      ...DEFAULT_CONTEXT_CONFIG,
      maxTokens: providerMaxTokens,
    };
  }

  // Return default config
  return DEFAULT_CONTEXT_CONFIG;
}

/**
 * Get context window limit in tokens for a model.
 *
 * @param modelId - The model identifier
 * @param provider - Optional provider for fallback
 * @returns Maximum tokens for the context window
 */
export function getContextWindowLimit(modelId: string, provider?: LLMProvider): number {
  return getContextWindowConfig(modelId, provider).maxTokens;
}

/**
 * Calculate token thresholds for a model.
 *
 * @param modelId - The model identifier
 * @param provider - Optional provider for fallback
 * @returns Object with warning, critical, and hard limit token counts
 */
export function getTokenThresholds(
  modelId: string,
  provider?: LLMProvider
): {
  warningTokens: number;
  criticalTokens: number;
  hardLimitTokens: number;
  maxTokens: number;
} {
  const config = getContextWindowConfig(modelId, provider);

  return {
    warningTokens: Math.floor(config.maxTokens * config.warningThreshold),
    criticalTokens: Math.floor(config.maxTokens * config.criticalThreshold),
    hardLimitTokens: Math.floor(config.maxTokens * config.hardLimit),
    maxTokens: config.maxTokens,
  };
}

/**
 * Check if a model supports streaming responses.
 *
 * @param modelId - The model identifier
 * @returns Whether streaming is supported
 */
export function supportsStreaming(modelId: string): boolean {
  const config = MODEL_CONTEXT_CONFIGS[modelId];
  return config?.supportsStreaming ?? true;
}

/**
 * Get compaction settings for a model.
 *
 * @param modelId - The model identifier
 * @param provider - Optional provider for fallback
 * @returns Compaction configuration
 */
export function getCompactionSettings(
  modelId: string,
  provider?: LLMProvider
): {
  minMessages: number;
  keepRecent: number;
} {
  const config = getContextWindowConfig(modelId, provider);

  return {
    minMessages: config.minMessagesForCompaction,
    keepRecent: config.keepRecentMessages,
  };
}

/**
 * Format context window size for display.
 *
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "200K", "1M")
 */
export function formatContextWindowSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return millions === Math.floor(millions)
      ? `${millions}M`
      : `${millions.toFixed(1)}M`;
  }

  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return thousands === Math.floor(thousands)
      ? `${thousands}K`
      : `${thousands.toFixed(1)}K`;
  }

  return tokens.toString();
}
