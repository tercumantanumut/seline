/**
 * Unified Model Catalog
 *
 * Single source of truth that aggregates all provider model lists
 * and enriches them with metadata for the Bag of Models UI.
 *
 * Re-uses existing getXxxModels() functions — no duplication.
 */

import { getAntigravityModels } from "@/lib/auth/antigravity-models";
import { getCodexModels } from "@/lib/auth/codex-models";
import { getClaudeCodeModels } from "@/lib/auth/claudecode-models";
import { getKimiModels } from "@/lib/auth/kimi-models";
import type {
  LLMProvider,
  ModelItem,
  ModelCapabilities,
  ModelRole,
} from "@/components/model-bag/model-bag.types";
import { PROVIDER_DISPLAY_NAMES } from "@/components/model-bag/model-bag.constants";
import { invertAssignments } from "@/components/model-bag/model-bag.utils";

// ---------------------------------------------------------------------------
// Static metadata enrichment for known models
// ---------------------------------------------------------------------------

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  thinking: false,
  toolUse: true,
  streaming: true,
  speed: "standard",
};

export const MODEL_METADATA: Record<
  string,
  Partial<Pick<ModelItem, "tier"> & { capabilities: Partial<ModelCapabilities> }>
> = {
  // Anthropic direct
  // --- 4.5 Series (Future/Beta) ---
  "claude-sonnet-4-5-20250929": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "200K", speed: "standard" },
  },
  "claude-haiku-4-5-20251001": {
    tier: "utility",
    capabilities: { vision: true, contextWindow: "200K", speed: "fast" },
  },
  "claude-opus-4-6-thinking": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "200K", speed: "slow" },
  },

  // --- 3.5 Series ---
  "claude-3-5-sonnet-20241022": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "200K", speed: "standard" },
  },
  "claude-3-5-haiku-20241022": {
    tier: "utility",
    capabilities: { vision: false, contextWindow: "200K", speed: "fast" },
  },

  // --- 3.0 Series ---
  "claude-3-opus-20240229": {
    tier: "flagship",
    capabilities: { vision: true, contextWindow: "200K", speed: "slow" },
  },
  "claude-3-sonnet-20240229": {
    tier: "standard",
    capabilities: { vision: true, contextWindow: "200K", speed: "standard" },
  },
  "claude-3-haiku-20240307": {
    tier: "utility",
    capabilities: { vision: true, contextWindow: "200K", speed: "fast" },
  },

  // --- Legacy ---
  "claude-2.1": {
    tier: "legacy",
    capabilities: { vision: false, contextWindow: "200K", speed: "slow" },
  },
  "claude-2.0": {
    tier: "legacy",
    capabilities: { vision: false, contextWindow: "100K", speed: "slow" },
  },
  "claude-instant-1.2": {
    tier: "legacy",
    capabilities: { vision: false, contextWindow: "100K", speed: "fast" },
  },

  // Antigravity
  "claude-sonnet-4-5": {
    tier: "flagship",
    capabilities: { vision: true, contextWindow: "200K", speed: "standard" },
  },
  "claude-sonnet-4-5-thinking": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "200K", speed: "slow" },
  },
  "gemini-3-pro-high": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "1M", speed: "standard" },
  },
  "gemini-3-pro-low": {
    tier: "standard",
    capabilities: { vision: true, contextWindow: "1M", speed: "fast" },
  },
  "gemini-3-flash": {
    tier: "utility",
    capabilities: { vision: true, contextWindow: "1M", speed: "fast" },
  },
  "gpt-oss-120b-medium": {
    tier: "standard",
    capabilities: { vision: false, contextWindow: "128K", speed: "standard" },
  },

  // Codex (GPT-5 models — all 400K context)
  "gpt-5.3-codex": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "standard" },
  },
  "gpt-5.2-codex": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "standard" },
  },
  "gpt-5.2": {
    tier: "standard",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "standard" },
  },
  "gpt-5.1-codex-max": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "slow" },
  },
  "gpt-5.1-codex": {
    tier: "standard",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "standard" },
  },
  "gpt-5.1-codex-mini": {
    tier: "utility",
    capabilities: { vision: true, contextWindow: "400K", speed: "fast" },
  },
  "gpt-5.1": {
    tier: "standard",
    capabilities: { vision: true, thinking: true, contextWindow: "400K", speed: "standard" },
  },

  // Kimi
  "kimi-k2.5": {
    tier: "flagship",
    capabilities: { vision: true, thinking: true, contextWindow: "256K", speed: "standard" },
  },
  "kimi-k2-thinking": {
    tier: "flagship",
    capabilities: { vision: false, thinking: true, contextWindow: "128K", speed: "slow" },
  },
  "kimi-k2-thinking-turbo": {
    tier: "standard",
    capabilities: { vision: false, thinking: true, contextWindow: "128K", speed: "standard" },
  },
  "kimi-k2-turbo-preview": {
    tier: "utility",
    capabilities: { vision: false, contextWindow: "128K", speed: "fast" },
  },
  "kimi-k2-0905-preview": {
    tier: "standard",
    capabilities: { vision: false, contextWindow: "128K", speed: "standard" },
  },
};

// ---------------------------------------------------------------------------
// Default models per provider (mirrors providers.ts DEFAULT_MODELS)
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "openrouter/auto",
  antigravity: "claude-sonnet-4-5",
  codex: "gpt-5.1-codex",
  claudecode: "claude-sonnet-4-5-20250929",
  kimi: "kimi-k2.5",
  ollama: "llama3.1:8b",
};

// ---------------------------------------------------------------------------
// Catalog builder
// ---------------------------------------------------------------------------

/**
 * Build the complete model catalog.
 *
 * @param activeProvider  Currently selected llmProvider from settings
 * @param authStatus      Per-provider authentication state
 * @param currentAssignments  { chatModel: "...", researchModel: "...", ... }
 */
export function buildModelCatalog(
  activeProvider: LLMProvider,
  authStatus: Record<LLMProvider, boolean>,
  currentAssignments: Record<string, string>,
): ModelItem[] {
  const catalog: ModelItem[] = [];
  const roleInverse = invertAssignments(currentAssignments);

  // Anthropic (expanded to include full roster)
  const anthropicModels = [
    // 4.5 Series
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
    // 3.5 Series
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    // 3.0 Series
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
    { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
    // Legacy
    { id: "claude-2.1", name: "Claude 2.1" },
    { id: "claude-2.0", name: "Claude 2.0" },
    { id: "claude-instant-1.2", name: "Claude Instant 1.2" },
  ];

  // OpenRouter models - organized by category
  // Users can also enter custom IDs via the input field
  const openrouterModels = [
    // --- Routers ---
    { id: "openrouter/auto", name: "🎯 Auto Router (Smart Selection)" },
    { id: "openrouter/free", name: "🆓 Free Router (Random Free Model)" },
    
    // --- Most Popular (Top Usage) ---
    { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5 (#1 Most Used)" },
    { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3.2" },
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
    
    // --- Best Value (Performance/Price) ---
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (Fast)" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5 (Coding)" },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS-120B (Open Weight)" },
    { id: "qwen/qwen3-coder-next", name: "Qwen3 Coder Next" },
    
    // --- Free Models (Top Tier) ---
    { id: "openai/gpt-oss-120b:free", name: "🆓 GPT-OSS-120B Free" },
    { id: "openai/gpt-oss-20b:free", name: "🆓 GPT-OSS-20B Free" },
    { id: "deepseek/deepseek-r1-0528:free", name: "🆓 DeepSeek R1 Free" },
    { id: "z-ai/glm-4.5-air:free", name: "🆓 GLM 4.5 Air Free" },
    { id: "arcee-ai/trinity-large-preview:free", name: "🆓 Trinity Large Preview Free" },
    { id: "stepfun/step-3.5-flash:free", name: "🆓 Step 3.5 Flash Free" },
    { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "🆓 NVIDIA Nemotron 30B Free" },
    { id: "upstage/solar-pro-3:free", name: "🆓 Solar Pro 3 Free" },
    
    // --- Reasoning Models ---
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Reasoning)" },
    { id: "qwen/qwen3-max-thinking", name: "Qwen3 Max Thinking" },
    { id: "x-ai/grok-code", name: "Grok Code (Reasoning)" },
    
    // --- Legacy Popular ---
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
  ];

  const allSources: Array<{
    provider: LLMProvider;
    models: Array<{ id: string; name: string }>;
  }> = [
    { provider: "anthropic", models: anthropicModels },
    { provider: "antigravity", models: getAntigravityModels() },
    { provider: "codex", models: getCodexModels() },
    { provider: "claudecode", models: getClaudeCodeModels() },
    { provider: "kimi", models: getKimiModels() },
    { provider: "openrouter", models: openrouterModels },
    // ollama is free-text — handled separately in UI
  ];

  for (const { provider, models } of allSources) {
    for (const model of models) {
      const meta = MODEL_METADATA[model.id];
      catalog.push({
        id: model.id,
        name: model.name,
        provider,
        providerDisplayName: PROVIDER_DISPLAY_NAMES[provider],
        tier: meta?.tier ?? "standard",
        capabilities: { ...DEFAULT_CAPABILITIES, ...meta?.capabilities },
        assignedRoles: roleInverse[model.id] ?? [],
        isAvailable: authStatus[provider] ?? false,
        isDefault: model.id === DEFAULT_MODELS[provider],
      });
    }
  }

  return catalog;
}

/**
 * Get default model ID for a provider.
 */
export function getDefaultModelForProvider(provider: LLMProvider): string {
  return DEFAULT_MODELS[provider] ?? "";
}
